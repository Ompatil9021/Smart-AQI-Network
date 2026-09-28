import argparse
import json
import os

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

from features import HORIZONS, POLLUTANT_COLS, WEATHER_COLS, build_features, to_hourly

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_CSV = r"C:\Users\ompat\Desktop\rf\aqi_india_38cols_knn_final.csv"
DEFAULT_OUT = os.path.join(SCRIPT_DIR, "models", "aqi_models.joblib")


def make_model(algo):
    if algo == "xgb":
        from xgboost import XGBRegressor
        return XGBRegressor(n_estimators=600, learning_rate=0.05, max_depth=7,
                            subsample=0.8, colsample_bytree=0.6, min_child_weight=10,
                            tree_method="hist", n_jobs=-1, random_state=42)
    # size-controlled RF: bigger min_samples_leaf / smaller max_samples = smaller file
    return RandomForestRegressor(n_estimators=100, max_depth=20, min_samples_leaf=30,
                                 max_features=0.4, max_samples=0.3,
                                 n_jobs=-1, random_state=42)


def load(csv_path):
    df = pd.read_csv(csv_path)
    df.columns = df.columns.str.strip()
    try:
        df["datetime"] = pd.to_datetime(df["datetime"], format="ISO8601")
    except (ValueError, TypeError):
        df["datetime"] = pd.to_datetime(df["datetime"], format="mixed", errors="coerce")
    df = df.dropna(subset=["datetime"])

    needed = ["city", "latitude", "longitude"] + POLLUTANT_COLS + WEATHER_COLS
    missing = [c for c in needed if c not in df.columns]
    if missing:
        raise SystemExit(f"Missing columns in CSV: {missing}")
    for c in POLLUTANT_COLS + WEATHER_COLS:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    print("CO max (should be hundreds or more, in ug/m3):", df["co_ugm3"].max())
    return df


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default=DEFAULT_CSV)
    ap.add_argument("--algo", choices=["rf", "xgb"], default="rf")
    ap.add_argument("--out", default=DEFAULT_OUT)
    args = ap.parse_args()

    df = load(args.csv)
    print("Rows:", len(df), "| Cities:", df["city"].nunique())

    parts = []
    for city, g in df.groupby("city"):
        f = build_features(to_hourly(g))
        for h in HORIZONS:
            f[f"target_{h}h"] = f["aqi"].shift(-h)
        parts.append(f.assign(city=city))
    data = pd.concat(parts)
    data = data[data["aqi"].notna()]
    FEATURES = [c for c in data.columns if c != "city" and not c.startswith("target_")]

    cutoff = data.index.sort_values()[int(len(data) * 0.85)]
    gap = pd.Timedelta(hours=max(HORIZONS))
    train, test = data[data.index < cutoff - gap], data[data.index >= cutoff]
    print(f"Train {len(train):,} | Test {len(test):,} | Cutoff {cutoff}")

    models, results = {}, []
    for h in HORIZONS:
        tgt = f"target_{h}h"
        tr = train.dropna(subset=FEATURES + [tgt])
        te = test.dropna(subset=FEATURES + [tgt])
        m = make_model(args.algo)
        m.fit(tr[FEATURES], tr[tgt])
        pred = np.clip(m.predict(te[FEATURES]), 0, 500)
        base = te["aqi"].values
        results.append({
            "horizon_h": h,
            "MAE": mean_absolute_error(te[tgt], pred),
            "RMSE": float(np.sqrt(mean_squared_error(te[tgt], pred))),
            "R2": r2_score(te[tgt], pred),
            "Persistence_MAE": mean_absolute_error(te[tgt], base),
            "Persistence_R2": r2_score(te[tgt], base),
        })
        models[h] = m
        print(f"Done {h}h")

    res = pd.DataFrame(results).round(3)
    print("\n", res.to_string(index=False))

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    joblib.dump({"models": models, "features": FEATURES, "algo": args.algo},
                args.out, compress=3)
    res.to_json(os.path.join(os.path.dirname(args.out), "metrics.json"), orient="records")
    print(f"\nSaved {args.out}  ({os.path.getsize(args.out) / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
