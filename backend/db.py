import json
import sqlite3
import time
from typing import Any, Optional

from config import DB_PATH


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=15, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = get_conn()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS aqi_cache (
            city_key TEXT PRIMARY KEY,
            city_name TEXT,
            lat REAL,
            lon REAL,
            payload TEXT NOT NULL,
            updated_at REAL NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS geo_cache (
            city_key TEXT PRIMARY KEY,
            query TEXT,
            lat REAL,
            lon REAL,
            display_name TEXT,
            geojson TEXT,
            updated_at REAL NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()


def cache_get(table: str, city_key: str, ttl: Optional[float] = None) -> Optional[dict]:
    conn = get_conn()
    row = conn.execute(f"SELECT * FROM {table} WHERE city_key = ?", (city_key,)).fetchone()
    conn.close()
    if not row:
        return None
    if ttl is not None and (time.time() - row["updated_at"]) > ttl:
        data = dict(row)
        data["_stale"] = True
        return data
    data = dict(row)
    data["_stale"] = False
    return data


def cache_put(table: str, city_key: str, fields: dict[str, Any]) -> None:
    conn = get_conn()
    if table == "aqi_cache":
        conn.execute(
            """
            INSERT INTO aqi_cache (city_key, city_name, lat, lon, payload, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(city_key) DO UPDATE SET
                city_name=excluded.city_name,
                lat=excluded.lat,
                lon=excluded.lon,
                payload=excluded.payload,
                updated_at=excluded.updated_at
            """,
            (
                city_key,
                fields.get("city_name"),
                fields.get("lat"),
                fields.get("lon"),
                fields.get("payload"),
                time.time(),
            ),
        )
    else:
        conn.execute(
            """
            INSERT INTO geo_cache (city_key, query, lat, lon, display_name, geojson, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(city_key) DO UPDATE SET
                query=excluded.query,
                lat=excluded.lat,
                lon=excluded.lon,
                display_name=excluded.display_name,
                geojson=excluded.geojson,
                updated_at=excluded.updated_at
            """,
            (
                city_key,
                fields.get("query"),
                fields.get("lat"),
                fields.get("lon"),
                fields.get("display_name"),
                fields.get("geojson"),
                time.time(),
            ),
        )
    conn.commit()
    conn.close()


def parse_payload(row: Optional[dict]) -> Optional[dict]:
    if not row:
        return None
    try:
        payload = json.loads(row["payload"])
        payload["_cached_at"] = row["updated_at"]
        payload["_stale"] = row.get("_stale", False)
        return payload
    except (TypeError, json.JSONDecodeError):
        return None
