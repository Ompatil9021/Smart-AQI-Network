import logging
import os

import joblib

from aqi_calc import clamp_aqi
from features import build_features
from history import fetch_history

try:
    import ml_models_xgb          # old snapshot model, used only as fallback
except Exception:
    ml_models_xgb = None

logger = logging.getLogger(__name__)
MODEL_PATH = os.getenv(
    "AQI_MODEL_PATH",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "aqi_models.joblib"),
)
_bundle = None


def load_models() -> None:
    global _bundle
    try:
        _bundle = joblib.load(MODEL_PATH)
        logger.info("Loaded %s models from %s", _bundle.get("algo"), MODEL_PATH)
    except Exception as err:
        _bundle = None
        logger.error("Could not load %s: %s", MODEL_PATH, err)
    if ml_models_xgb:
        ml_models_xgb.load_models()


def predict_forecast(pollutants: dict, weather: dict, current_aqi: int = 0,
                     lat=None, lon=None) -> dict:
    # ── Primary path: 72-hour history + joblib XGB bundle ──────────────────
    if _bundle is not None and lat is not None and lon is not None:
        try:
            hist = fetch_history(float(lat), float(lon)).asfreq("h").ffill().bfill()
            X = build_features(hist).iloc[[-1]][_bundle["features"]].fillna(0)
            result = {f"{h}h": clamp_aqi(float(m.predict(X)[0]))
                      for h, m in _bundle["models"].items()}
            logger.info("History-based forecast for (%.2f, %.2f): %s", lat, lon, result)
            return result
        except Exception as err:
            logger.warning("History model failed, using snapshot fallback: %s", err)

    # ── Secondary path: 12-feature snapshot XGB models ─────────────────────
    if ml_models_xgb:
        result = ml_models_xgb.predict_forecast(pollutants, weather)
        logger.info("Snapshot forecast: %s", result)
        return result

    # ── Last resort: flat forecast anchored on current AQI ─────────────────
    logger.warning("All models unavailable, returning flat forecast")
    return {"6h": current_aqi, "24h": current_aqi, "48h": current_aqi}
