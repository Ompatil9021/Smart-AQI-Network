import logging
from datetime import datetime
from typing import Optional

import pandas as pd
from xgboost import XGBRegressor

from aqi_calc import clamp_aqi
from config import MODEL_PATHS

logger = logging.getLogger(__name__)

FEATURE_COLUMNS = [
    "pm2_5_ugm3",
    "pm10_ugm3",
    "co_ugm3",
    "no2_ugm3",
    "so2_ugm3",
    "o3_ugm3",
    "humidity_percent",
    "dew_point_c",
    "wind_gusts_kmh",
    "pressure_msl_hpa",
    "cloud_cover_percent",
    "month",
]

_models: dict[str, Optional[XGBRegressor]] = {"6h": None, "24h": None, "48h": None}


def load_models() -> None:
    for horizon, path in MODEL_PATHS.items():
        model = XGBRegressor()
        model.load_model(path)
        _models[horizon] = model
    logger.info("XGBoost 6h/24h/48h models loaded")


def _num(value, default: float) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def build_features(pollutants: dict, weather: dict) -> pd.DataFrame:
    month = datetime.now().month
    row = {
        "pm2_5_ugm3": _num(pollutants.get("pm2_5"), 50),
        "pm10_ugm3": _num(pollutants.get("pm10"), 80),
        "co_ugm3": _num(pollutants.get("co"), 400),
        "no2_ugm3": _num(pollutants.get("no2"), 25),
        "so2_ugm3": _num(pollutants.get("so2"), 10),
        "o3_ugm3": _num(pollutants.get("o3"), 30),
        "humidity_percent": _num(weather.get("humidity"), 60),
        "dew_point_c": _num(weather.get("dew_point"), 18),
        "wind_gusts_kmh": _num(weather.get("wind_gusts"), 12),
        "pressure_msl_hpa": _num(weather.get("pressure"), 1010),
        "cloud_cover_percent": _num(weather.get("cloud_cover"), 40),
        "month": month,
    }
    return pd.DataFrame([row], columns=FEATURE_COLUMNS)


def predict_forecast(pollutants: dict, weather: dict) -> dict:
    if _models["6h"] is None or _models["24h"] is None or _models["48h"] is None:
        load_models()
    features = build_features(pollutants, weather)
    out = {}
    for horizon in ("6h", "24h", "48h"):
        model = _models.get(horizon)
        if model is None:
            out[horizon] = None
            continue
        pred = model.predict(features)[0]
        out[horizon] = clamp_aqi(pred)
    return out
