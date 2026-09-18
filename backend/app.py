import logging
from urllib.parse import unquote

from flask import Flask, jsonify, request
from flask_cors import CORS

from city_service import get_city_data, get_leaderboard, get_map_cities, start_warmup
from db import init_db
from ml_models import load_models
from providers import search_cities, fetch_hourly_aqi, geocode_city

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)


@app.get("/api/health")
def health():
    return jsonify({"ok": True, "service": "smart-aqi-network"})


@app.get("/api/search")
def search():
    query = (request.args.get("q") or "").strip()
    return jsonify({"results": search_cities(query)})


@app.get("/api/city/<path:city_name>")
def city(city_name: str):
    name = unquote(city_name).strip()
    if not name:
        return jsonify({"error": "City name is required"}), 400
    data = get_city_data(name)
    if not data:
        return jsonify({"error": f'City "{name}" not found or air-quality APIs are unavailable'}), 404

    return jsonify(
        {
            "city": data["city"],
            "current_aqi": data["current_aqi"],
            "forecast": data.get("forecast") or {"6h": None, "24h": None, "48h": None},
            "pollutants": data.get("pollutants") or {},
            "category": data.get("category"),
            "color": data.get("color"),
            "lat": data.get("lat"),
            "lon": data.get("lon"),
            "weather": data.get("weather"),
            "geojson": data.get("geojson"),
            "source": data.get("source"),
            "stale": data.get("stale", False),
            "updated_at": data.get("updated_at"),
        }
    )


@app.get("/api/leaderboard")
def leaderboard():
    return jsonify({"cities": get_leaderboard()})


@app.get("/api/map")
def map_cities():
    return jsonify({"cities": get_map_cities()})


@app.get("/api/city/<path:city_name>/history")
def city_history(city_name: str):
    name = unquote(city_name).strip()
    if not name:
        return jsonify({"error": "City name is required"}), 400
    geo = geocode_city(name)
    if not geo:
        return jsonify({"error": f'City "{name}" not found'}), 404
    try:
        hourly = fetch_hourly_aqi(geo["lat"], geo["lon"], hours=24)
        return jsonify({"city": geo["name"], "hourly": hourly})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


if __name__ == "__main__":
    init_db()
    load_models()
    start_warmup()
    logger.info("API running on http://localhost:5000")
    app.run(port=5000, debug=True, use_reloader=False)
