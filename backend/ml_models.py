import logging
import os
from datetime import datetime
from typing import Optional

import pandas as pd
import xgboost as xgb

from aqi_calc import clamp_aqi, compute_cpcb_aqi
from config import MODEL_PATHS

logger = logging.getLogger(__name__)

FEATURE_COLUMNS = [
    "pm2_5_ugm3",
    "pm10_ugm3",
    "co_ugm3",
    "no2_ugm3",
    "so2_ugm3",
    "o3_ugm3",
    "current_aqi",       # NEW: current measured AQI (anchors prediction)
    "hour",              # NEW: hour of day 0-23
    "day_of_week",       # NEW: 0=Mon ... 6=Sun
    "is_weekend",        # NEW: 0 or 1
    "month",
]

_models: dict[str, Optional[xgb.Booster]] = {"6h": None, "24h": None, "48h": None}


def load_models() -> None:
    loaded = []
    for horizon, path in MODEL_PATHS.items():
        try:
            if not os.path.isfile(path):
                raise FileNotFoundError(path)
            model = xgb.Booster()
            model.load_model(path)
            _models[horizon] = model
            loaded.append(f"{horizon} ({os.path.getsize(path)} bytes)")
            logger.info("Loaded XGBoost %s from %s", horizon, path)
        except Exception as err:
            _models[horizon] = None
            logger.error("Failed to load model %s from %s: %s", horizon, path, err)
    if loaded:
        logger.info("XGBoost forecast models ready: %s", ", ".join(loaded))


def _num(value, default: float) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def build_features(pollutants: dict, weather: dict, current_aqi: int = 0) -> pd.DataFrame:
    now = datetime.now()
    aqi_value = _num(current_aqi, 0)
    if aqi_value <= 0:
        aqi_value = float(compute_cpcb_aqi(pollutants) or 100)
    row = {
        "pm2_5_ugm3": _num(pollutants.get("pm2_5"), 50),
        "pm10_ugm3": _num(pollutants.get("pm10"), 80),
        "co_ugm3": _num(pollutants.get("co"), 400),
        "no2_ugm3": _num(pollutants.get("no2"), 25),
        "so2_ugm3": _num(pollutants.get("so2"), 10),
        "o3_ugm3": _num(pollutants.get("o3"), 30),
        "current_aqi": aqi_value,
        "hour": now.hour,
        "day_of_week": now.weekday(),   # 0=Monday, 6=Sunday
        "is_weekend": 1 if now.weekday() >= 5 else 0,
        "month": now.month,
    }
    return pd.DataFrame([row], columns=FEATURE_COLUMNS)




def predict_forecast(pollutants: dict, weather: dict, current_aqi: int = 0) -> dict:
    if _models["6h"] is None or _models["24h"] is None or _models["48h"] is None:
        load_models()
    features = build_features(pollutants, weather, current_aqi)
    dmatrix = xgb.DMatrix(features[FEATURE_COLUMNS])
    out = {}
    for horizon in ("6h", "24h", "48h"):
        model = _models.get(horizon)
        if model is None:
            out[horizon] = None
            continue
        try:
            pred = model.predict(dmatrix)[0]
            out[horizon] = clamp_aqi(float(pred))
        except Exception as err:
            logger.error("Prediction error for horizon %s: %s", horizon, err)
            out[horizon] = None
    return out


