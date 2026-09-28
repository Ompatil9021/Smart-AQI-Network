import warnings
import numpy as np
import pandas as pd
from aqi_calc import (CO_BREAKS_MGM3, NO2_BREAKS, O3_BREAKS,
                      PM10_BREAKS, PM25_BREAKS, SO2_BREAKS)

HORIZONS = [6, 24, 48]
WEATHER_COLS = ["humidity_percent", "dew_point_c", "wind_gusts_kmh",
                "precipitation_mm", "pressure_msl_hpa", "cloud_cover_percent"]
POLLUTANT_COLS = ["pm2_5_ugm3", "pm10_ugm3", "co_ugm3", "no2_ugm3",
                  "so2_ugm3", "o3_ugm3", "dust_ugm3", "aod"]
BASE_COLS = WEATHER_COLS + POLLUTANT_COLS + ["aqi"]
LAG_COLS = ["aqi", "pm2_5_ugm3", "pm10_ugm3", "no2_ugm3", "o3_ugm3",
            "wind_gusts_kmh", "humidity_percent"]
LAGS = [1, 3, 6, 12, 24, 48]


def _sub_index(values, breaks):
    x = np.asarray(values, dtype=float)
    result = np.full(x.shape, np.nan)
    finite = np.isfinite(x)
    x = np.where(finite, np.maximum(x, 0.0), x)
    assigned = np.zeros(x.shape, dtype=bool)
    last = len(breaks) - 1
    for i, (c_low, c_high, i_low, i_high) in enumerate(breaks):
        mask = (finite & ~assigned) if i == last else (finite & ~assigned & (x <= c_high))
        if not mask.any():
            continue
        conc = np.minimum(x[mask], c_high)
        span = (c_high - c_low) or 1.0
        result[mask] = (i_high - i_low) / span * (conc - c_low) + i_low
        assigned |= mask
    return result


def add_aqi(d: pd.DataFrame) -> pd.DataFrame:
    """CPCB AQI = max sub-index. Same logic as your live app."""
    subs = np.vstack([
        _sub_index(d["pm2_5_ugm3"], PM25_BREAKS),
        _sub_index(d["pm10_ugm3"], PM10_BREAKS),
        _sub_index(d["no2_ugm3"], NO2_BREAKS),
        _sub_index(d["so2_ugm3"], SO2_BREAKS),
        _sub_index(d["o3_ugm3"], O3_BREAKS),
        _sub_index(d["co_ugm3"].to_numpy(dtype=float) / 1000.0, CO_BREAKS_MGM3),  # ug -> mg
    ])
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        overall = np.nanmax(subs, axis=0)
    d = d.copy()
    d["aqi"] = np.round(overall)
    return d


def to_hourly(city_df: pd.DataFrame) -> pd.DataFrame:
    """Training only: one city -> continuous hourly grid."""
    d = city_df.set_index("datetime").sort_index()
    d = d[~d.index.duplicated()]
    d = d.reindex(pd.date_range(d.index.min(), d.index.max(), freq="h"))
    d[["latitude", "longitude"]] = d[["latitude", "longitude"]].ffill().bfill()
    return d


def build_features(city_df: pd.DataFrame) -> pd.DataFrame:
    """Hourly frame for ONE city -> feature rows. Uses only info available at time t."""
    d = add_aqi(city_df)
    out = pd.DataFrame(index=d.index)
    out["latitude"], out["longitude"] = d["latitude"], d["longitude"]
    out[BASE_COLS] = d[BASE_COLS]

    hr, mo, dw = d.index.hour, d.index.month, d.index.dayofweek
    out["hour_sin"], out["hour_cos"] = np.sin(2*np.pi*hr/24), np.cos(2*np.pi*hr/24)
    out["month_sin"], out["month_cos"] = np.sin(2*np.pi*mo/12), np.cos(2*np.pi*mo/12)
    out["dow_sin"], out["dow_cos"] = np.sin(2*np.pi*dw/7), np.cos(2*np.pi*dw/7)

    for c in LAG_COLS:
        for l in LAGS:
            out[f"{c}_lag{l}"] = d[c].shift(l)

    for c in ["aqi", "pm2_5_ugm3", "pm10_ugm3"]:
        out[f"{c}_roll6_mean"] = d[c].rolling(6, min_periods=4).mean()
        out[f"{c}_roll24_mean"] = d[c].rolling(24, min_periods=16).mean()
        out[f"{c}_roll24_max"] = d[c].rolling(24, min_periods=16).max()
        out[f"{c}_roll24_std"] = d[c].rolling(24, min_periods=16).std()

    out["aqi_change_3h"] = d["aqi"] - d["aqi"].shift(3)
    out["aqi_change_24h"] = d["aqi"] - d["aqi"].shift(24)
    out["pressure_change_6h"] = d["pressure_msl_hpa"] - d["pressure_msl_hpa"].shift(6)
    out["rain_last_24h"] = d["precipitation_mm"].rolling(24, min_periods=12).sum()
    return out
