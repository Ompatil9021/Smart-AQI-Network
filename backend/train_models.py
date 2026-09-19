"""
=============================================================================
  Smart AQI Network — XGBoost Model Retraining Script
=============================================================================
  Trains three XGBoost models for AQI forecasting:
    - xgb_6h.json  → predict AQI 6 hours into the future
    - xgb_24h.json → predict AQI 24 hours into the future
    - xgb_48h.json → predict AQI 48 hours into the future

  Aligns training with live inference (ml_models.py + compute_cpcb_aqi):
    1. Target and current_aqi use India CPCB AQI (same as the API/UI)
    2. If AQI is missing, compute it from PM2.5 / PM10 / other pollutants
    3. CO is kept in µg/m³ (Open-Meteo scale). Old CSV mg/m³ is * 1000
    4. Per-city time-ordered split (no leakage across cities or future hours)
    5. Features match ml_models.FEATURE_COLUMNS exactly

  Usage:
    python backend/train_models.py
    python backend/train_models.py --csv "C:\\path\\to\\aqi_india_38cols_knn_final.csv"
=============================================================================
"""

from __future__ import annotations

import argparse
import os
import sys
import time

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

from aqi_calc import (
    CO_BREAKS_MGM3,
    NO2_BREAKS,
    O3_BREAKS,
    PM10_BREAKS,
    PM25_BREAKS,
    SO2_BREAKS,
)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(SCRIPT_DIR, "models")
DEFAULT_CSV_CANDIDATES = [
    os.path.join(
        os.path.expanduser("~"),
        "Desktop",
        "New folder",
        "aqi_india_38cols_knn_final.csv",
    ),
    r"C:\Users\ompat\Desktop\New folder\aqi_india_38cols_knn_final.csv",
    os.path.join(SCRIPT_DIR, "processed_aqi_data.csv"),
]

FEATURE_COLUMNS = [
    "pm2_5_ugm3",
    "pm10_ugm3",
    "co_ugm3",
    "no2_ugm3",
    "so2_ugm3",
    "o3_ugm3",
    "current_aqi",
    "hour",
    "day_of_week",
    "is_weekend",
    "month",
]

HORIZONS = {
    "6h": ("xgb_6h.json", 6),
    "24h": ("xgb_24h.json", 24),
    "48h": ("xgb_48h.json", 48),
}

XGB_PARAMS = {
    "n_estimators": 800,
    "max_depth": 6,
    "learning_rate": 0.05,
    "subsample": 0.8,
    "colsample_bytree": 0.8,
    "min_child_weight": 8,
    "reg_alpha": 0.1,
    "reg_lambda": 1.0,
    "objective": "reg:squarederror",
    "eval_metric": "rmse",
    "tree_method": "hist",
    "random_state": 42,
    "n_jobs": -1,
}


def _first_existing_csv(explicit: str | None) -> str:
    if explicit:
        if not os.path.isfile(explicit):
            raise FileNotFoundError(f"CSV not found: {explicit}")
        return explicit
    env_path = os.environ.get("AQI_TRAIN_CSV")
    if env_path and os.path.isfile(env_path):
        return env_path
    for path in DEFAULT_CSV_CANDIDATES:
        if os.path.isfile(path):
            return path
    raise FileNotFoundError(
        "No training CSV found. Pass --csv or set AQI_TRAIN_CSV."
    )


def _pick_col(df: pd.DataFrame, names: list[str]) -> str | None:
    lookup = {c.lower(): c for c in df.columns}
    for name in names:
        if name.lower() in lookup:
            return lookup[name.lower()]
    return None


def _sub_index_vec(values: np.ndarray, breaks: list[tuple]) -> np.ndarray:
    x = np.asarray(values, dtype=float)
    result = np.full(x.shape, np.nan, dtype=float)
    finite = np.isfinite(x)
    x = np.where(finite, np.maximum(x, 0.0), x)
    assigned = np.zeros(x.shape, dtype=bool)
    last = len(breaks) - 1
    for i, (c_low, c_high, i_low, i_high) in enumerate(breaks):
        if i == last:
            mask = finite & ~assigned
        else:
            mask = finite & ~assigned & (x <= c_high)
        if not mask.any():
            continue
        conc = np.minimum(x[mask], c_high)
        span_c = (c_high - c_low) or 1.0
        result[mask] = ((i_high - i_low) / span_c) * (conc - c_low) + i_low
        assigned |= mask
    return result


def compute_cpcb_aqi_columns(df: pd.DataFrame) -> np.ndarray:
    """CPCB overall AQI = max sub-index of available pollutants (same as live API)."""
    pm25 = _sub_index_vec(df["pm2_5_ugm3"].to_numpy(), PM25_BREAKS)
    pm10 = _sub_index_vec(df["pm10_ugm3"].to_numpy(), PM10_BREAKS)
    no2 = _sub_index_vec(df["no2_ugm3"].to_numpy(), NO2_BREAKS)
    so2 = _sub_index_vec(df["so2_ugm3"].to_numpy(), SO2_BREAKS)
    o3 = _sub_index_vec(df["o3_ugm3"].to_numpy(), O3_BREAKS)
    co_mg = df["co_ugm3"].to_numpy(dtype=float) / 1000.0
    co = _sub_index_vec(co_mg, CO_BREAKS_MGM3)
    stacked = np.vstack([pm25, pm10, no2, so2, o3, co])
    with np.errstate(all="ignore"):
        overall = np.nanmax(stacked, axis=0)
    overall[~np.isfinite(overall)] = np.nan
    return np.round(overall)


def time_split_by_city(df: pd.DataFrame, city_col: str, test_size: float = 0.2):
    train_parts, test_parts = [], []
    for _, group in df.groupby(city_col, sort=False):
        n = len(group)
        if n < 50:
            train_parts.append(group)
            continue
        split = int(n * (1 - test_size))
        train_parts.append(group.iloc[:split])
        test_parts.append(group.iloc[split:])
    train_df = pd.concat(train_parts).reset_index(drop=True)
    test_df = (
        pd.concat(test_parts).reset_index(drop=True)
        if test_parts
        else df.iloc[0:0].copy()
    )
    return train_df, test_df


def load_and_prepare(csv_path: str) -> tuple[pd.DataFrame, str]:
    print(f"\n  Loading data from: {csv_path}")
    df = pd.read_csv(csv_path)
    print(f"    Rows loaded: {len(df):,}")
    print(f"    Columns: {list(df.columns)}")

    city_col = _pick_col(df, ["city", "location_name", "location", "station"])
    time_col = _pick_col(df, ["datetime", "timestamp", "date", "time"])
    if not city_col or not time_col:
        raise ValueError("CSV must include a city column and a datetime column.")

    df[time_col] = pd.to_datetime(df[time_col], errors="coerce")
    df = df.dropna(subset=[city_col, time_col])
    df = df.sort_values([city_col, time_col]).reset_index(drop=True)

    rename_map = {}
    for src, dest in [
        ("pm25", "pm2_5_ugm3"),
        ("pm2_5", "pm2_5_ugm3"),
        ("pm2.5", "pm2_5_ugm3"),
        ("pm10", "pm10_ugm3"),
        ("no2", "no2_ugm3"),
        ("so2", "so2_ugm3"),
        ("o3", "o3_ugm3"),
        ("ozone", "o3_ugm3"),
    ]:
        found = _pick_col(df, [src])
        if found and dest not in df.columns:
            rename_map[found] = dest
    df = df.rename(columns=rename_map)

    if "co_ugm3" not in df.columns:
        co_col = _pick_col(df, ["co", "co_mgm3", "carbon_monoxide"])
        if co_col is None:
            df["co_ugm3"] = np.nan
        else:
            co_vals = pd.to_numeric(df[co_col], errors="coerce")
            # Old CPCB/CSV dumps store CO in mg/m³ (max ~2). Open-Meteo is µg/m³.
            if co_vals.max(skipna=True) is not None and co_vals.max(skipna=True) < 50:
                print("    CO looks like mg/m³ — converting to µg/m³ (* 1000)")
                df["co_ugm3"] = co_vals * 1000.0
            else:
                print("    CO already looks like µg/m³ — no conversion")
                df["co_ugm3"] = co_vals
    else:
        print("    Using co_ugm3 as ug/m3 (Open-Meteo / new dataset scale)")

    for col in ["pm2_5_ugm3", "pm10_ugm3", "no2_ugm3", "so2_ugm3", "o3_ugm3", "co_ugm3"]:
        if col not in df.columns:
            df[col] = np.nan
        df[col] = pd.to_numeric(df[col], errors="coerce")

    cpcb = compute_cpcb_aqi_columns(df)
    raw_aqi_col = _pick_col(df, ["aqi", "us_aqi", "current_aqi", "indian_aqi"])
    raw_aqi = (
        pd.to_numeric(df[raw_aqi_col], errors="coerce").to_numpy()
        if raw_aqi_col
        else np.full(len(df), np.nan)
    )
    filled = np.where(np.isfinite(cpcb) & (cpcb > 0), cpcb, raw_aqi)
    n_from_pollutants = int(np.isfinite(cpcb).sum())
    n_from_raw = int(((~np.isfinite(cpcb) | (cpcb <= 0)) & np.isfinite(raw_aqi)).sum())
    print(f"    CPCB AQI from pollutants: {n_from_pollutants:,} rows")
    print(f"    Fallback to CSV AQI column: {n_from_raw:,} rows")

    df["current_aqi"] = filled
    df["hour"] = df[time_col].dt.hour.astype(int)
    df["day_of_week"] = df[time_col].dt.dayofweek.astype(int)
    if "is_weekend" in df.columns:
        df["is_weekend"] = df["is_weekend"].astype(int)
    else:
        df["is_weekend"] = (df["day_of_week"] >= 5).astype(int)
    if "month" in df.columns:
        df["month"] = pd.to_numeric(df["month"], errors="coerce")
        df["month"] = df["month"].fillna(df[time_col].dt.month).astype(int)
    else:
        df["month"] = df[time_col].dt.month.astype(int)

    for label, (_, offset) in HORIZONS.items():
        df[f"aqi_{label}"] = df.groupby(city_col)["current_aqi"].shift(-offset)

    needed = FEATURE_COLUMNS + [f"aqi_{h}" for h in HORIZONS]
    before = len(df)
    df = df.dropna(subset=needed).reset_index(drop=True)
    print(f"    Rows after cleaning: {len(df):,}  (dropped {before - len(df):,})")
    print(f"    Cities: {df[city_col].nunique()}")
    print(f"    Date range: {df[time_col].min()} -> {df[time_col].max()}")
    print(
        "    AQI stats: "
        f"min={df['current_aqi'].min():.0f}  "
        f"median={df['current_aqi'].median():.0f}  "
        f"max={df['current_aqi'].max():.0f}"
    )
    return df, city_col


def train_and_save(df: pd.DataFrame, city_col: str) -> dict:
    train_df, test_df = time_split_by_city(df, city_col)
    X_train = train_df[FEATURE_COLUMNS]
    X_test = test_df[FEATURE_COLUMNS]
    print(f"\n    Train size: {len(X_train):,} rows  ({train_df[city_col].nunique()} cities)")
    print(f"    Test  size: {len(X_test):,} rows  ({test_df[city_col].nunique()} cities)")

    os.makedirs(MODELS_DIR, exist_ok=True)
    results = {}

    for label, (filename, offset) in HORIZONS.items():
        print(f"\n  Training model: +{label}  (predicting CPCB AQI {offset} hours ahead)")
        y_train = train_df[f"aqi_{label}"]
        y_test = test_df[f"aqi_{label}"]

        model = xgb.XGBRegressor(**XGB_PARAMS, early_stopping_rounds=50)
        t0 = time.time()
        model.fit(
            X_train,
            y_train,
            eval_set=[(X_test, y_test)],
            verbose=100,
        )
        elapsed = time.time() - t0
        print(f"\n    Training time: {elapsed:.1f}s")

        y_pred = np.clip(model.predict(X_test), 0, 500)
        mae = mean_absolute_error(y_test, y_pred)
        rmse = float(mean_squared_error(y_test, y_pred) ** 0.5)
        r2 = r2_score(y_test, y_pred)
        acc = max(0.0, r2) * 100

        print(f"\n    Results for +{label}:")
        print(f"      MAE  (mean error in AQI units): {mae:.2f}")
        print(f"      RMSE (root mean sq error):      {rmse:.2f}")
        print(f"      R2   (accuracy proxy):          {r2:.4f}  ->  {acc:.1f}%")

        fi = dict(zip(FEATURE_COLUMNS, model.feature_importances_))
        fi_sorted = sorted(fi.items(), key=lambda x: x[1], reverse=True)[:6]
        print("\n    Top features:")
        for feat, imp in fi_sorted:
            bar = "#" * int(imp * 40)
            print(f"      {feat:<22} {bar}  ({imp:.3f})")

        out_path = os.path.join(MODELS_DIR, filename)
        model.get_booster().save_model(out_path)
        print(f"\n    Saved -> {out_path}")
        results[label] = {"mae": mae, "rmse": rmse, "r2": r2, "acc": acc}

    return results


def print_summary(results: dict):
    print(f"\n{'=' * 60}")
    print("  TRAINING COMPLETE")
    print(f"{'=' * 60}")
    print(f"  {'Horizon':<10} {'MAE':>8} {'RMSE':>8} {'Accuracy':>10}")
    print(f"  {'-' * 10} {'-' * 8} {'-' * 8} {'-' * 10}")
    for label, r in results.items():
        print(f"  {label:<10} {r['mae']:>8.2f} {r['rmse']:>8.2f} {r['acc']:>9.1f}%")
    print(f"{'=' * 60}")
    print("\n  Models saved to backend/models/")
    print("  Training target = CPCB AQI (same scale as live current_aqi).\n")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Retrain Smart AQI XGBoost models")
    parser.add_argument("--csv", default=None, help="Path to training CSV")
    args = parser.parse_args(argv)

    print("=" * 60)
    print("  Smart AQI Network - Model Retraining")
    print("=" * 60)
    print(f"\n  Feature columns ({len(FEATURE_COLUMNS)} total):")
    for feat in FEATURE_COLUMNS:
        print(f"    - {feat}")

    csv_path = _first_existing_csv(args.csv)
    df, city_col = load_and_prepare(csv_path)
    results = train_and_save(df, city_col)
    print_summary(results)
    return 0


if __name__ == "__main__":
    sys.exit(main())
