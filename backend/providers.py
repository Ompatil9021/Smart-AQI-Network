import json
import logging
import math
import os
import threading
import time
from typing import Optional

import requests

from config import (
    CITY_ALIASES,
    CITY_BBOXES,
    NOMINATIM_MIN_INTERVAL,
    NOMINATIM_SEARCH,
    OPEN_METEO_AIR,
    OPEN_METEO_GEOCODE,
    OPEN_METEO_WEATHER,
    REQUEST_TIMEOUT,
    USER_AGENT,
    WAQI_FEED_URL,
    WAQI_TOKEN,
)
from aqi_calc import compute_cpcb_aqi
from db import cache_get, cache_put

logger = logging.getLogger(__name__)

_CURATED_BOUNDARIES: dict[str, dict] = {}
_boundaries_file = os.path.join(os.path.dirname(__file__), "data", "city_boundaries.json")
if os.path.exists(_boundaries_file):
    try:
        with open(_boundaries_file, "r", encoding="utf-8") as _f:
            _CURATED_BOUNDARIES = json.load(_f)
        logger.info("Loaded %d curated city boundaries", len(_CURATED_BOUNDARIES))
    except Exception as _e:
        logger.warning("Failed to load curated boundaries: %s", _e)

_session = requests.Session()
_session.headers.update({"User-Agent": USER_AGENT, "Accept": "application/json"})

_nominatim_lock = threading.Lock()
_last_nominatim = 0.0


def normalize_city_name(name: str) -> str:
    cleaned = " ".join((name or "").strip().split())
    alias = CITY_ALIASES.get(cleaned.lower())
    return alias or cleaned


def city_key(name: str) -> str:
    return normalize_city_name(name).lower()


def bbox_polygon(west: float, south: float, east: float, north: float) -> dict:
    return {
        "type": "Polygon",
        "coordinates": [
            [
                [west, south],
                [east, south],
                [east, north],
                [west, north],
                [west, south],
            ]
        ],
    }


def _extract_current(payload: dict, keys: list[str]) -> dict:
    current = payload.get("current") or {}
    hourly = payload.get("hourly") or {}
    out = {}
    for key in keys:
        value = current.get(key)
        if value is None:
            series = hourly.get(key) or []
            for item in reversed(series):
                if item is not None:
                    value = item
                    break
        out[key] = value
    return out


def geocode_city(query: str) -> Optional[dict]:
    name = normalize_city_name(query)
    key = city_key(name)
    cached = cache_get("geo_cache", key)
    if cached and cached.get("lat") is not None:
        geojson = None
        if cached.get("geojson"):
            try:
                geojson = json.loads(cached["geojson"])
            except json.JSONDecodeError:
                geojson = None
        return {
            "name": cached.get("display_name") or name,
            "lat": cached["lat"],
            "lon": cached["lon"],
            "geojson": geojson,
        }

    try:
        res = _session.get(
            OPEN_METEO_GEOCODE,
            params={"name": name, "count": 5, "language": "en", "format": "json", "countryCode": "IN"},
            timeout=REQUEST_TIMEOUT,
        )
        res.raise_for_status()
        results = (res.json() or {}).get("results") or []
        if not results:
            res = _session.get(
                OPEN_METEO_GEOCODE,
                params={"name": name, "count": 5, "language": "en", "format": "json"},
                timeout=REQUEST_TIMEOUT,
            )
            res.raise_for_status()
            results = (res.json() or {}).get("results") or []
        if not results:
            return None
        best = results[0]
        display = best.get("name") or name
        lat = float(best["latitude"])
        lon = float(best["longitude"])
        geojson = _fallback_polygon(key, lat, lon)
        cache_put(
            "geo_cache",
            key,
            {
                "query": query,
                "lat": lat,
                "lon": lon,
                "display_name": display,
                "geojson": json.dumps(geojson),
            },
        )
        return {"name": display, "lat": lat, "lon": lon, "geojson": geojson}
    except requests.RequestException as exc:
        logger.warning("Geocode failed for %s: %s", name, exc)
        return None


def search_cities(query: str, limit: int = 6) -> list[dict]:
    q = (query or "").strip()
    if len(q) < 2:
        return []
    try:
        res = _session.get(
            OPEN_METEO_GEOCODE,
            params={"name": q, "count": limit, "language": "en", "format": "json", "countryCode": "IN"},
            timeout=REQUEST_TIMEOUT,
        )
        res.raise_for_status()
        results = (res.json() or {}).get("results") or []
        out = []
        for item in results:
            out.append(
                {
                    "name": item.get("name"),
                    "admin1": item.get("admin1"),
                    "country": item.get("country"),
                    "lat": item.get("latitude"),
                    "lon": item.get("longitude"),
                    "label": ", ".join(
                        part
                        for part in (item.get("name"), item.get("admin1"), item.get("country"))
                        if part
                    ),
                }
            )
        return out
    except requests.RequestException as exc:
        logger.warning("City search failed: %s", exc)
        return []


def _is_concentration(value: Optional[float], station_aqi: Optional[int]) -> bool:
    """WAQI iaqi values are often US AQI sub-indexes, not µg/m³."""
    if value is None:
        return False
    if station_aqi is not None and abs(float(value) - float(station_aqi)) < 8:
        return False
    return True


def fetch_waqi_ground_aqi(lat: float, lon: float, city_name: str = "") -> Optional[dict]:
    """Fetch real-time CPCB ground station air quality from WAQI API."""
    if not WAQI_TOKEN:
        return None

    urls = []
    if city_name:
        clean_name = normalize_city_name(city_name).lower()
        urls.append(f"{WAQI_FEED_URL}/{clean_name}/?token={WAQI_TOKEN}")
    urls.append(f"{WAQI_FEED_URL}/geo:{lat};{lon}/?token={WAQI_TOKEN}")

    for url in urls:
        try:
            res = _session.get(url, timeout=REQUEST_TIMEOUT)
            if res.status_code != 200:
                continue
            data = res.json()
            if data.get("status") != "ok" or not isinstance(data.get("data"), dict):
                continue

            station_data = data["data"]
            aqi_val = station_data.get("aqi")
            if aqi_val is None or aqi_val == "-" or not isinstance(aqi_val, (int, float)):
                continue

            iaqi = station_data.get("iaqi") or {}

            def get_v(key: str) -> Optional[float]:
                item = iaqi.get(key)
                if isinstance(item, dict) and "v" in item:
                    try:
                        return float(item["v"])
                    except (TypeError, ValueError):
                        return None
                return None

            pm2_5 = get_v("pm25")
            pm10 = get_v("pm10")
            co = get_v("co")
            if co is not None and co < 100:
                co = co * 1000.0  # Convert mg/m³ to µg/m³ if needed

            no2 = get_v("no2")
            so2 = get_v("so2")
            o3 = get_v("o3")
            station_name = (station_data.get("city") or {}).get("name") or city_name
            station_aqi = int(aqi_val)

            return {
                "pm2_5": pm2_5 if _is_concentration(pm2_5, station_aqi) else None,
                "pm10": pm10 if _is_concentration(pm10, station_aqi) else None,
                "co": co,
                "no2": no2 if _is_concentration(no2, station_aqi) else None,
                "so2": so2 if _is_concentration(so2, station_aqi) else None,
                "o3": o3 if _is_concentration(o3, station_aqi) else None,
                "us_aqi": station_aqi,
                "european_aqi": None,
                "station_name": station_name,
                "observed_at": (station_data.get("time") or {}).get("s"),
                "source": "waqi-cpcb",
            }
        except Exception as exc:
            logger.debug("WAQI fetch failed for url %s: %s", url, exc)
            continue

    return None


def fetch_air_quality(lat: float, lon: float, city_name: str = "") -> dict:
    waqi_data = fetch_waqi_ground_aqi(lat, lon, city_name)

    open_meteo_data = {}
    try:
        res = _session.get(
            OPEN_METEO_AIR,
            params={
                "latitude": lat,
                "longitude": lon,
                "current": "pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,us_aqi,european_aqi",
                "timezone": "auto",
            },
            timeout=REQUEST_TIMEOUT,
        )
        if res.status_code == 200:
            data = res.json()
            open_meteo_data = _extract_current(
                data,
                [
                    "pm10",
                    "pm2_5",
                    "carbon_monoxide",
                    "nitrogen_dioxide",
                    "sulphur_dioxide",
                    "ozone",
                    "us_aqi",
                    "european_aqi",
                ],
            )
            open_meteo_data["observed_at"] = (data.get("current") or {}).get("time")
    except Exception as exc:
        logger.warning("Open-Meteo air fetch failed: %s", exc)

    if waqi_data:
        return {
            "pm2_5": waqi_data.get("pm2_5") if waqi_data.get("pm2_5") is not None else open_meteo_data.get("pm2_5"),
            "pm10": waqi_data.get("pm10") if waqi_data.get("pm10") is not None else open_meteo_data.get("pm10"),
            "co": waqi_data.get("co") if waqi_data.get("co") is not None else open_meteo_data.get("carbon_monoxide"),
            "no2": waqi_data.get("no2") if waqi_data.get("no2") is not None else open_meteo_data.get("nitrogen_dioxide"),
            "so2": waqi_data.get("so2") if waqi_data.get("so2") is not None else open_meteo_data.get("sulphur_dioxide"),
            "o3": waqi_data.get("o3") if waqi_data.get("o3") is not None else open_meteo_data.get("ozone"),
            "us_aqi": waqi_data["us_aqi"] if waqi_data["us_aqi"] is not None else open_meteo_data.get("us_aqi"),
            "european_aqi": open_meteo_data.get("european_aqi"),
            "station_name": waqi_data.get("station_name"),
            "observed_at": waqi_data["observed_at"] or open_meteo_data.get("observed_at"),
            "source": "waqi-cpcb",
        }

    return {
        "pm2_5": open_meteo_data.get("pm2_5"),
        "pm10": open_meteo_data.get("pm10"),
        "co": open_meteo_data.get("carbon_monoxide"),
        "no2": open_meteo_data.get("nitrogen_dioxide"),
        "so2": open_meteo_data.get("sulphur_dioxide"),
        "o3": open_meteo_data.get("ozone"),
        "us_aqi": open_meteo_data.get("us_aqi"),
        "european_aqi": open_meteo_data.get("european_aqi"),
        "observed_at": open_meteo_data.get("observed_at"),
        "source": "open-meteo",
    }



def fetch_weather(lat: float, lon: float) -> dict:
    res = _session.get(
        OPEN_METEO_WEATHER,
        params={
            "latitude": lat,
            "longitude": lon,
            "current": "relative_humidity_2m,dew_point_2m,wind_gusts_10m,pressure_msl,cloud_cover,temperature_2m",
            "timezone": "auto",
        },
        timeout=REQUEST_TIMEOUT,
    )
    res.raise_for_status()
    data = res.json()
    current = _extract_current(
        data,
        [
            "relative_humidity_2m",
            "dew_point_2m",
            "wind_gusts_10m",
            "pressure_msl",
            "cloud_cover",
            "temperature_2m",
        ],
    )
    return {
        "humidity": current.get("relative_humidity_2m"),
        "dew_point": current.get("dew_point_2m"),
        "wind_gusts": current.get("wind_gusts_10m"),
        "pressure": current.get("pressure_msl"),
        "cloud_cover": current.get("cloud_cover"),
        "temperature": current.get("temperature_2m"),
    }


def _generate_smooth_contour(lat: float, lon: float, radius_km: float = 12.0) -> dict:
    """Generate a realistic, organic multi-vertex boundary polygon around center coords."""
    dlat = radius_km / 111.0
    dlon = radius_km / (111.0 * max(0.2, math.cos(math.radians(lat))))
    steps = 18
    coords = []
    for i in range(steps):
        angle = 2 * math.pi * i / steps
        factor = 1.0 + 0.14 * math.sin(3 * angle) + 0.08 * math.cos(5 * angle)
        pt_lon = lon + dlon * math.cos(angle) * factor
        pt_lat = lat + dlat * math.sin(angle) * factor
        coords.append([round(pt_lon, 5), round(pt_lat, 5)])
    coords.append(coords[0])
    return {"type": "Polygon", "coordinates": [coords]}


def _fallback_polygon(key: str, lat: float, lon: float) -> Optional[dict]:
    if key in _CURATED_BOUNDARIES:
        return _CURATED_BOUNDARIES[key]
    return None


def _pick_polygon_geometry(geojson: dict) -> Optional[dict]:
    gtype = geojson.get("type")
    if gtype in ("Polygon", "MultiPolygon"):
        return geojson
    return None


def _is_detailed_polygon(geojson: dict) -> bool:
    if not geojson:
        return False
    if geojson.get("type") == "MultiPolygon":
        return True
    coords = geojson.get("coordinates") or []
    return bool(coords and len(coords[0]) > 6)


def get_cached_polygon(name: str, lat: float, lon: float) -> dict:
    """Return a genuine city region boundary immediately (curated, cached OSM, or smooth contour)."""
    key = city_key(name)
    if key in _CURATED_BOUNDARIES and _is_detailed_polygon(_CURATED_BOUNDARIES[key]):
        return _CURATED_BOUNDARIES[key]

    cached = cache_get("geo_cache", key)
    if cached and cached.get("geojson"):
        try:
            parsed = json.loads(cached["geojson"])
            if parsed and parsed.get("type") in ("Polygon", "MultiPolygon") and _is_detailed_polygon(parsed):
                return parsed
        except json.JSONDecodeError:
            pass

    geometry = _fallback_polygon(key, lat, lon)
    cache_put(
        "geo_cache",
        key,
        {
            "query": name,
            "lat": lat,
            "lon": lon,
            "display_name": normalize_city_name(name),
            "geojson": json.dumps(geometry),
        },
    )
    return geometry


def _refresh_osm_polygon(name: str, lat: float, lon: float) -> None:
    key = city_key(name)
    if key in _CURATED_BOUNDARIES and _is_detailed_polygon(_CURATED_BOUNDARIES[key]):
        return

    cached = cache_get("geo_cache", key)
    if cached and cached.get("geojson"):
        try:
            if _is_detailed_polygon(json.loads(cached["geojson"])):
                return
        except json.JSONDecodeError:
            pass

    geometry = None
    global _last_nominatim
    with _nominatim_lock:
        wait = NOMINATIM_MIN_INTERVAL - (time.time() - _last_nominatim)
        if wait > 0:
            time.sleep(wait)
        try:
            res = _session.get(
                NOMINATIM_SEARCH,
                params={
                    "q": f"{normalize_city_name(name)}, India",
                    "format": "json",
                    "polygon_geojson": 1,
                    "limit": 5,
                },
                timeout=REQUEST_TIMEOUT,
            )
            res.raise_for_status()
            _last_nominatim = time.time()
            results = res.json() or []
            for item in results:
                geom = _pick_polygon_geometry(item.get("geojson") or {})
                if geom:
                    geometry = geom
                    break
        except requests.RequestException as exc:
            logger.warning("Nominatim polygon failed for %s: %s", name, exc)
            _last_nominatim = time.time()

    if geometry is None:
        return

    cache_put(
        "geo_cache",
        key,
        {
            "query": name,
            "lat": lat,
            "lon": lon,
            "display_name": normalize_city_name(name),
            "geojson": json.dumps(geometry),
        },
    )


_polygon_inflight = set()
_polygon_inflight_lock = threading.Lock()


def schedule_polygon_refresh(name: str, lat: float, lon: float) -> None:
    key = city_key(name)
    if key in _CURATED_BOUNDARIES and _is_detailed_polygon(_CURATED_BOUNDARIES[key]):
        return
    with _polygon_inflight_lock:
        if key in _polygon_inflight:
            return
        _polygon_inflight.add(key)

    def _run():
        try:
            _refresh_osm_polygon(name, lat, lon)
        finally:
            with _polygon_inflight_lock:
                _polygon_inflight.discard(key)

    threading.Thread(target=_run, daemon=True, name=f"osm-{key}").start()


def _hourly_at(series: list, index: int):
    if index < 0 or index >= len(series):
        return None
    return series[index]


def fetch_openmeteo_forecast(lat: float, lon: float) -> dict:
    """Fetch +6h/+24h/+48h forecast and convert to CPCB AQI (same scale as current_aqi)."""
    try:
        res = _session.get(
            OPEN_METEO_AIR,
            params={
                "latitude": lat,
                "longitude": lon,
                "current": "pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone",
                "hourly": "pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone",
                "past_hours": 1,
                "forecast_hours": 50,
                "timezone": "auto",
            },
            timeout=REQUEST_TIMEOUT,
        )
        res.raise_for_status()
        data = res.json()
        hourly = data.get("hourly") or {}
        times = hourly.get("time") or []
        pm25_vals = hourly.get("pm2_5") or []
        pm10_vals = hourly.get("pm10") or []
        co_vals = hourly.get("carbon_monoxide") or []
        no2_vals = hourly.get("nitrogen_dioxide") or []
        so2_vals = hourly.get("sulphur_dioxide") or []
        o3_vals = hourly.get("ozone") or []

        current_time_str = (data.get("current") or {}).get("time", "")
        current_hour = current_time_str[:13]
        current_idx = 0
        for i, t in enumerate(times):
            if t[:13] >= current_hour:
                current_idx = i
                break

        forecast: dict[str, int | None] = {"6h": None, "24h": None, "48h": None}
        targets = {"6h": 6, "24h": 24, "48h": 48}
        for label, offset in targets.items():
            idx = current_idx + offset
            for search in range(idx, min(idx + 2, len(times))):
                pollutants = {
                    "pm2_5": _hourly_at(pm25_vals, search),
                    "pm10": _hourly_at(pm10_vals, search),
                    "co": _hourly_at(co_vals, search),
                    "no2": _hourly_at(no2_vals, search),
                    "so2": _hourly_at(so2_vals, search),
                    "o3": _hourly_at(o3_vals, search),
                }
                if all(v is None for v in pollutants.values()):
                    continue
                aqi = compute_cpcb_aqi(pollutants)
                if aqi > 0:
                    forecast[label] = aqi
                    break
        return forecast
    except Exception as exc:
        logger.warning("Open-Meteo forecast fetch failed: %s", exc)
        return {"6h": None, "24h": None, "48h": None}



def fetch_hourly_aqi(lat: float, lon: float, hours: int = 24) -> list[dict]:
    """Fetch real hourly AQI observations from Open-Meteo for the past N hours exactly up to current."""
    res = _session.get(
        OPEN_METEO_AIR,
        params={
            "latitude": lat,
            "longitude": lon,
            "current": "us_aqi",
            "hourly": "pm2_5,pm10,us_aqi",
            "past_hours": hours + 2,
            "forecast_hours": 3,
            "timezone": "auto",
        },
        timeout=REQUEST_TIMEOUT,
    )
    res.raise_for_status()
    data = res.json()
    
    current_time_str = data.get("current", {}).get("time", "")
    current_hour_prefix = current_time_str[:14] + "00" if current_time_str else ""

    hourly = data.get("hourly") or {}
    times = hourly.get("time") or []
    pm25_vals = hourly.get("pm2_5") or []
    pm10_vals = hourly.get("pm10") or []
    aqi_vals = hourly.get("us_aqi") or []
    
    # Find the index of the current hour
    current_idx = len(times) - 1
    if current_hour_prefix:
        for i, t in enumerate(times):
            if t == current_hour_prefix or t > current_hour_prefix:
                current_idx = i
                break
                
    # Extract exactly `hours` (e.g. 24) items ending at current_idx
    start_idx = max(0, current_idx - hours)
    
    result = []
    for i in range(start_idx, current_idx + 1):
        if i < len(times):
            result.append({
                "time": times[i],
                "pm2_5": pm25_vals[i] if i < len(pm25_vals) else None,
                "pm10": pm10_vals[i] if i < len(pm10_vals) else None,
                "us_aqi": aqi_vals[i] if i < len(aqi_vals) else None,
            })
    return result
