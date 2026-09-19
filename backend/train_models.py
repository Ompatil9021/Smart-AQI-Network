"""
=============================================================================
  Smart AQI Network — XGBoost Model Retraining Script
=============================================================================
  Trains three XGBoost models for AQI forecasting:
    - xgb_6h.json  → predict AQI 6 hours into the future
    - xgb_24h.json → predict AQI 24 hours into the future
    - xgb_48h.json → predict AQI 48 hours into the future

  Fixes over previous training:
    1. Adds `current_aqi` as a feature (most important fix!)
    2. Adds `hour`, `day_of_week`, `is_weekend` (temporal patterns)
    3. Fixes CO unit: CSV has mg/m3 -> convert to ug/m3 (* 1000)
    4. Uses proper per-city time-sorted splitting to avoid data leakage
    5. Reports per-model accuracy (MAE, RMSE, R2)

  Requirements:
    pip install xgboost scikit-learn pandas numpy

  Usage:
    python backend/train_models.py
=============================================================================
"""

import os
import time

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

# -------------------------------------------------
# PATHS
# -------------------------------------------------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(SCRIPT_DIR, "processed_aqi_data.csv")
MODELS_DIR = os.path.join(SCRIPT_DIR, "models")
os.makedirs(MODELS_DIR, exist_ok=True)

# -------------------------------------------------
# FEATURE COLUMNS
# MUST match what ml_models.py sends to the model
# -------------------------------------------------
FEATURE_COLUMNS = [
    "pm2_5_ugm3",       # PM2.5 concentration ug/m3
    "pm10_ugm3",        # PM10 concentration ug/m3
    "co_ugm3",          # CO concentration ug/m3  (CSV is mg/m3 -> x1000)
    "no2_ugm3",         # NO2 concentration ug/m3
    "so2_ugm3",         # SO2 concentration ug/m3
    "o3_ugm3",          # Ozone concentration ug/m3
    "current_aqi",      # NEW: current measured AQI (anchors prediction)
    "hour",             # NEW: hour of day 0-23 (rush hour patterns)
    "day_of_week",      # NEW: 0=Mon ... 6=Sun
    "is_weekend",       # NEW: 0 or 1
    "month",            # month 1-12 (seasonal patterns)
]

# Forecast horizons
HORIZONS = {
    "6h":  ("xgb_6h.json",  6),
    "24h": ("xgb_24h.json", 24),
    "48h": ("xgb_48h.json", 48),
}

# -------------------------------------------------
# XGBOOST HYPERPARAMETERS
# Tune these to improve accuracy:
#   n_estimators      more trees = better but slower (try 500-2000)
#   max_depth         tree depth 3-8, deeper = more complex
#   learning_rate     smaller = needs more trees but more accurate (0.01-0.3)
#   subsample         fraction of rows per tree (0.6-1.0)
#   colsample_bytree  fraction of features per tree (0.6-1.0)
#   min_child_weight  min samples in a leaf (higher = less overfitting)
# -------------------------------------------------
XGB_PARAMS = {
    "n_estimators":     1000,
    "max_depth":        6,
    "learning_rate":    0.05,
    "subsample":        0.8,
    "colsample_bytree": 0.8,
    "min_child_weight": 5,
    "reg_alpha":        0.1,
    "reg_lambda":       1.0,
    "objective":        "reg:squarederror",
    "eval_metric":      "rmse",
    "tree_method":      "hist",
    "random_state":     42,
    "n_jobs":           -1,
}


def load_and_prepare(csv_path: str) -> pd.DataFrame:
    print(f"\n  Loading data from: {csv_path}")
    df = pd.read_csv(csv_path)
    print(f"    Rows loaded: {len(df):,}")

    # Sort per city by time (critical for correct shift targets)
    df = df.sort_values(["location_name", "timestamp"]).reset_index(drop=True)

    # Rename CSV columns -> model feature names
    df = df.rename(columns={
        "pm25": "pm2_5_ugm3",
        "pm10": "pm10_ugm3",
        "no2":  "no2_ugm3",
        "so2":  "so2_ugm3",
        "o3":   "o3_ugm3",
    })

    # CO unit fix: CSV is in mg/m3, model expects ug/m3
    df["co_ugm3"] = df["co"] * 1000.0

    # current_aqi = the AQI at the current row
    df["current_aqi"] = df["aqi"]

    # Create future AQI targets (per city to avoid city boundary leakage)
    for label, (_, offset) in HORIZONS.items():
        df[f"aqi_{label}"] = df.groupby("location_name")["aqi"].shift(-offset)

    # Drop rows with NaN targets (last N rows of each city)
    target_cols = [f"aqi_{h}" for h in HORIZONS]
    df = df.dropna(subset=target_cols + FEATURE_COLUMNS)

    print(f"    Rows after cleaning: {len(df):,}")
    return df


def train_and_save(df: pd.DataFrame) -> dict:
    X = df[FEATURE_COLUMNS]

    # Train/test split: use last 20% of TIME as test (no shuffle!)
    split_idx = int(len(df) * 0.80)
    X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]

    print(f"\n    Train size: {len(X_train):,} rows")
    print(f"    Test  size: {len(X_test):,} rows")

    results = {}

    for label, (filename, offset) in HORIZONS.items():
        print(f"\n  Training model: +{label}  (predicting AQI {offset} hours ahead)")

        y = df[f"aqi_{label}"]
        y_train, y_test = y.iloc[:split_idx], y.iloc[split_idx:]

        model = xgb.XGBRegressor(
            **XGB_PARAMS,
            early_stopping_rounds=50,
        )

        t0 = time.time()
        model.fit(
            X_train, y_train,
            eval_set=[(X_test, y_test)],
            verbose=100,
        )
        elapsed = time.time() - t0
        print(f"\n    Training time: {elapsed:.1f}s")

        # Evaluate
        y_pred = model.predict(X_test)
        y_pred = np.clip(y_pred, 0, 500)

        mae  = mean_absolute_error(y_test, y_pred)
        rmse = float(mean_squared_error(y_test, y_pred) ** 0.5)
        r2   = r2_score(y_test, y_pred)
        acc  = max(0.0, r2) * 100

        print(f"\n    Results for +{label}:")
        print(f"      MAE  (mean error in AQI units): {mae:.2f}")
        print(f"      RMSE (root mean sq error):      {rmse:.2f}")
        print(f"      R2   (accuracy proxy):          {r2:.4f}  ->  {acc:.1f}%")

        # Feature importance (top 5)
        fi = dict(zip(FEATURE_COLUMNS, model.feature_importances_))
        fi_sorted = sorted(fi.items(), key=lambda x: x[1], reverse=True)[:5]
        print(f"\n    Top 5 most important features:")
        for feat, imp in fi_sorted:
            bar = "#" * int(imp * 40)
            print(f"      {feat:<22} {bar}  ({imp:.3f})")

        # Save model
        out_path = os.path.join(MODELS_DIR, filename)
        model.get_booster().save_model(out_path)
        print(f"\n    Saved -> {out_path}")

        results[label] = {"mae": mae, "rmse": rmse, "r2": r2, "acc": acc}

    return results


def print_summary(results: dict):
    print(f"\n{'='*60}")
    print("  TRAINING COMPLETE")
    print(f"{'='*60}")
    print(f"  {'Horizon':<10} {'MAE':>8} {'RMSE':>8} {'Accuracy':>10}")
    print(f"  {'-'*10} {'-'*8} {'-'*8} {'-'*10}")
    for label, r in results.items():
        print(f"  {label:<10} {r['mae']:>8.2f} {r['rmse']:>8.2f} {r['acc']:>9.1f}%")
    print(f"{'='*60}")
    print("\n  Models saved to backend/models/")
    print("  NEXT STEPS:")
    print("  1. Update ml_models.py FEATURE_COLUMNS to match new list")
    print("  2. Update build_features() in ml_models.py to add new params")
    print("  3. git add backend/models/ && git commit && git push")
    print("  4. Render will auto-redeploy with the improved models\n")


if __name__ == "__main__":
    print("=" * 60)
    print("  Smart AQI Network - Model Retraining")
    print("=" * 60)
    print(f"\n  Feature columns ({len(FEATURE_COLUMNS)} total):")
    new_feats = {"current_aqi", "hour", "day_of_week", "is_weekend"}
    for f in FEATURE_COLUMNS:
        tag = "  NEW" if f in new_feats else "     "
        print(f"    [{tag}]  {f}")

    df = load_and_prepare(CSV_PATH)
    results = train_and_save(df)
    print_summary(results)
