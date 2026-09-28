import logging
import time

import pandas as pd
import requests

logger = logging.getLogger(__name__)

AIR_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
WX_URL = "https://api.open-meteo.com/v1/forecast"
TZ = "Asia/Kolkata"

AIR_VARS = {"pm2_5": "pm2_5_ugm3", "pm10": "pm10_ugm3", "carbon_monoxide": "co_ugm3",
            "nitrogen_dioxide": "no2_ugm3", "sulphur_dioxide": "so2_ugm3",
            "ozone": "o3_ugm3", "dust": "dust_ugm3", "aerosol_optical_depth": "aod"}
WX_VARS = {"relative_humidity_2m": "humidity_percent", "dew_point_2m": "dew_point_c",
           "wind_gusts_10m": "wind_gusts_kmh", "precipitation": "precipitation_mm",
           "pressure_msl": "pressure_msl_hpa", "cloud_cover": "cloud_cover_percent"}

_cache = {}
_RETRIES = 4           # total attempts
_BACKOFF_BASE = 2.0    # seconds — doubles each retry: 2, 4, 8 …


def _hourly(url, var_map, lat, lon):
    """Fetch hourly data with automatic retry on 429 / transient errors."""
    params = {
        "latitude": lat, "longitude": lon,
        "hourly": ",".join(var_map), "past_days": 3, "forecast_days": 1,
        "timezone": TZ,
    }
    last_exc = None
    for attempt in range(_RETRIES):
        try:
            r = requests.get(url, params=params, timeout=20)
            if r.status_code == 429:
                wait = _BACKOFF_BASE * (2 ** attempt)
                logger.warning("Open-Meteo 429 from %s, retry in %.0fs (attempt %d/%d)",
                               url, wait, attempt + 1, _RETRIES)
                time.sleep(wait)
                continue
            r.raise_for_status()
            df = pd.DataFrame(r.json()["hourly"])
            df["time"] = pd.to_datetime(df["time"])
            return df.set_index("time").rename(columns=var_map)
        except requests.HTTPError as e:
            last_exc = e
            if attempt < _RETRIES - 1:
                time.sleep(_BACKOFF_BASE * (2 ** attempt))
        except Exception as e:
            last_exc = e
            break
    raise RuntimeError(f"Failed to fetch {url} after {_RETRIES} attempts: {last_exc}")


def fetch_history(lat: float, lon: float, ttl: int = 1800) -> pd.DataFrame:
    """Last ~72h hourly data, same columns and units as the training CSV."""
    key = (round(lat, 2), round(lon, 2))
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < ttl:
        return hit[1].copy()

    air_df = _hourly(AIR_URL, AIR_VARS, lat, lon)
    time.sleep(0.3)                    # brief pause between the two Open-Meteo calls
    wx_df = _hourly(WX_URL, WX_VARS, lat, lon)

    df = air_df.join(wx_df, how="inner")
    now = pd.Timestamp.now(tz=TZ).tz_localize(None).floor("h")
    df = df[df.index <= now]           # never use future hours
    df["latitude"], df["longitude"] = lat, lon
    _cache[key] = (time.time(), df)
    return df.copy()
