import json
import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

from aqi_calc import aqi_category, aqi_color, clamp_aqi, compute_cpcb_aqi
from config import AQI_CACHE_TTL_SECONDS, MEMORY_CACHE_TTL_SECONDS, TRACKED_CITIES
from db import cache_get, cache_put, parse_payload
from ml_models import predict_forecast
from providers import (
    city_key,
    fetch_air_quality,
    fetch_weather,
    geocode_city,
    get_cached_polygon,
    normalize_city_name,
    schedule_polygon_refresh,
)

logger = logging.getLogger(__name__)

_memory: dict[str, tuple[float, dict]] = {}
_memory_lock = threading.Lock()


def _memory_get(key: str) -> dict | None:
    with _memory_lock:
        item = _memory.get(key)
        if not item:
            return None
        expires, payload = item
        if time.time() > expires:
            return None
        return payload


def _memory_set(key: str, payload: dict) -> None:
    with _memory_lock:
        _memory[key] = (time.time() + MEMORY_CACHE_TTL_SECONDS, payload)


def _round_pollutant(value):
    if value is None:
        return None
    try:
        return round(float(value), 1)
    except (TypeError, ValueError):
        return None


_MAX_FORECAST_DELTA = {"6h": 30, "24h": 45, "48h": 60}


def _forecast_for_display(pollutants: dict, weather: dict, displayed_aqi: int) -> dict:
    """Predict CAMS-consistent AQI change, then apply it to the number shown on screen.

    Training used CPCB(AQI) computed from the same pollutant row. Live current AQI is
    often a WAQI/CPCB station value (~124) while pollutants still come from Open-Meteo
    CAMS (~30–70). Plotting raw CAMS/ML absolute values next to the station reading
    produces the fake 124 → 32 cliff.
    """
    implied_now = compute_cpcb_aqi(pollutants)
    model_now = implied_now if implied_now > 0 else displayed_aqi
    raw = predict_forecast(pollutants, weather or {}, model_now)
    out = {}
    for horizon in ("6h", "24h", "48h"):
        pred = raw.get(horizon)
        if pred is None:
            out[horizon] = displayed_aqi
            continue
        delta = int(pred) - int(model_now)
        cap = _MAX_FORECAST_DELTA[horizon]
        delta = max(-cap, min(cap, delta))
        out[horizon] = clamp_aqi(displayed_aqi + delta)
    return out


def _assemble(city_name: str, lat: float, lon: float, pollutants: dict, weather: dict, source: str, stale: bool = False) -> dict:
    clean_pollutants = {
        "pm2_5": _round_pollutant(pollutants.get("pm2_5")),
        "pm10": _round_pollutant(pollutants.get("pm10")),
        "co": _round_pollutant(pollutants.get("co")),
        "so2": _round_pollutant(pollutants.get("so2")),
        "no2": _round_pollutant(pollutants.get("no2")),
        "o3": _round_pollutant(pollutants.get("o3")),
    }
    if source == "waqi-cpcb" and pollutants.get("us_aqi") is not None:
        current_aqi = int(round(float(pollutants["us_aqi"])))
    else:
        current_aqi = compute_cpcb_aqi(clean_pollutants)
        if current_aqi == 0 and pollutants.get("us_aqi"):
            current_aqi = int(round(float(pollutants["us_aqi"])))

    forecast = _forecast_for_display(clean_pollutants, weather or {}, current_aqi)

    geojson = get_cached_polygon(city_name, lat, lon)
    schedule_polygon_refresh(city_name, lat, lon)

    payload = {
        "city": city_name,
        "lat": lat,
        "lon": lon,
        "current_aqi": current_aqi,
        "category": aqi_category(current_aqi),
        "color": aqi_color(current_aqi),
        "forecast": forecast,
        "pollutants": clean_pollutants,
        "weather": {
            "temperature": _round_pollutant((weather or {}).get("temperature")),
            "humidity": _round_pollutant((weather or {}).get("humidity")),
            "wind_gusts": _round_pollutant((weather or {}).get("wind_gusts")),
            "pressure": _round_pollutant((weather or {}).get("pressure")),
            "cloud_cover": _round_pollutant((weather or {}).get("cloud_cover")),
        },
        "geojson": geojson,
        "source": source,
        "stale": stale,
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    return payload


def get_city_data(city_name: str, use_cache: bool = True) -> dict | None:
    name = normalize_city_name(city_name)
    key = city_key(name)

    if use_cache:
        mem = _memory_get(key)
        if mem:
            mem = dict(mem)
            if mem.get("lat") and mem.get("lon"):
                mem["geojson"] = get_cached_polygon(mem.get("city") or name, mem["lat"], mem["lon"])
            return mem
        row = cache_get("aqi_cache", key, ttl=AQI_CACHE_TTL_SECONDS)
        fresh = parse_payload(row) if row and not row.get("_stale") else None
        if fresh:
            if fresh.get("lat") and fresh.get("lon"):
                fresh["geojson"] = get_cached_polygon(fresh.get("city") or name, fresh["lat"], fresh["lon"])
            _memory_set(key, fresh)
            return fresh

    geo = geocode_city(name)
    if not geo:
        stale_row = cache_get("aqi_cache", key)
        return parse_payload(stale_row)

    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            air_f = pool.submit(fetch_air_quality, geo["lat"], geo["lon"], geo["name"])
            wx_f = pool.submit(fetch_weather, geo["lat"], geo["lon"])
            pollutants = air_f.result()
            weather = wx_f.result()
        payload = _assemble(geo["name"], geo["lat"], geo["lon"], pollutants, weather, pollutants.get("source", "open-meteo"))

        cache_put(
            "aqi_cache",
            key,
            {
                "city_name": payload["city"],
                "lat": payload["lat"],
                "lon": payload["lon"],
                "payload": json.dumps(payload),
            },
        )
        _memory_set(key, payload)
        return payload
    except requests.RequestException as exc:
        logger.warning("Live fetch failed for %s: %s", name, exc)
        stale_row = cache_get("aqi_cache", key)
        stale = parse_payload(stale_row)
        if stale:
            stale["source"] = "cache"
            stale["stale"] = True
            return stale
        return None


def _load_tracked(name: str) -> dict | None:
    try:
        return get_city_data(name)
    except Exception as exc:
        logger.warning("Tracked city load failed for %s: %s", name, exc)
        return None


def get_leaderboard() -> list[dict]:
    rows = []
    for city in TRACKED_CITIES:
        key = city_key(city["name"])
        mem = _memory_get(key)
        if mem:
            data = mem
        else:
            row = cache_get("aqi_cache", key)
            data = parse_payload(row) if row else None
            
        if not data:
            continue
        rows.append(
            {
                "city": data["city"],
                "current_aqi": data.get("current_aqi", 0),
                "category": data.get("category", ""),
                "color": data.get("color", ""),
                "lat": data.get("lat"),
                "lon": data.get("lon"),
            }
        )
    rows.sort(key=lambda item: item["current_aqi"], reverse=True)
    for idx, row in enumerate(rows, start=1):
        row["rank"] = idx
        if idx == 1:
            row["badge"] = "🔥"
        elif idx == 2:
            row["badge"] = "⚠️"
        elif idx == 3:
            row["badge"] = "🟥"
        else:
            row["badge"] = ""
    return rows


def get_map_cities() -> list[dict]:
    cities = []
    for city in TRACKED_CITIES:
        key = city_key(city["name"])
        mem = _memory_get(key)
        if mem:
            data = mem
        else:
            row = cache_get("aqi_cache", key)
            data = parse_payload(row) if row else None
            
        if not data:
            continue
        cities.append(
            {
                "city": data["city"],
                "current_aqi": data.get("current_aqi", 0),
                "category": data.get("category", ""),
                "color": data.get("color", ""),
                "lat": data.get("lat"),
                "lon": data.get("lon"),
                "geojson": data.get("geojson"),
                "forecast": data.get("forecast"),
            }
        )
    return cities


def warmup_tracked_cities() -> None:
    def _load(name: str):
        try:
            get_city_data(name, use_cache=True)
        except Exception as exc:
            logger.warning("Warmup failed for %s: %s", name, exc)

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(_load, city["name"]) for city in TRACKED_CITIES]
        for future in as_completed(futures):
            future.result()
    logger.info("Tracked city cache warmup complete")


def start_warmup() -> None:
    thread = threading.Thread(target=warmup_tracked_cities, daemon=True, name="aqi-warmup")
    thread.start()
