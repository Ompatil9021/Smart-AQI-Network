import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, "models")
DB_PATH = os.path.join(BASE_DIR, "aqi_cache.db")

MODEL_PATHS = {
    "6h": os.path.join(MODELS_DIR, "xgb_6h.json"),
    "24h": os.path.join(MODELS_DIR, "xgb_24h.json"),
    "48h": os.path.join(MODELS_DIR, "xgb_48h.json"),
}

# Live AQI cache: 90s keeps map/search snappy while staying near real-time.
AQI_CACHE_TTL_SECONDS = 90
GEO_CACHE_TTL_SECONDS = 60 * 60 * 24 * 30
MEMORY_CACHE_TTL_SECONDS = 60

REQUEST_TIMEOUT = 8
NOMINATIM_MIN_INTERVAL = 1.1

USER_AGENT = "SmartAQINetwork/1.0 (air-quality-dashboard)"

OPEN_METEO_GEOCODE = "https://geocoding-api.open-meteo.com/v1/search"
OPEN_METEO_AIR = "https://air-quality-api.open-meteo.com/v1/air-quality"
OPEN_METEO_WEATHER = "https://api.open-meteo.com/v1/forecast"
NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search"

CITY_ALIASES = {
    "bangalore": "Bengaluru",
    "bengalooru": "Bengaluru",
    "bombay": "Mumbai",
    "calcutta": "Kolkata",
    "madras": "Chennai",
    "gurgaon": "Gurugram",
    "new delhi": "Delhi",
    "ncr": "Delhi",
    "benares": "Varanasi",
    "trivandrum": "Thiruvananthapuram",
    "baroda": "Vadodara",
}

# west, south, east, north — used until OSM city polygons are cached
CITY_BBOXES = {
    "delhi": (76.838, 28.404, 77.348, 28.883),
    "mumbai": (72.776, 18.892, 72.986, 19.272),
    "kolkata": (88.240, 22.450, 88.460, 22.650),
    "chennai": (80.160, 12.950, 80.330, 13.200),
    "bengaluru": (77.460, 12.830, 77.780, 13.150),
    "hyderabad": (78.300, 17.240, 78.600, 17.560),
    "pune": (73.730, 18.430, 73.980, 18.630),
    "ahmedabad": (72.480, 22.940, 72.700, 23.140),
    "jaipur": (75.700, 26.800, 75.900, 27.000),
    "lucknow": (80.850, 26.760, 81.050, 26.950),
    "kanpur": (80.220, 26.380, 80.460, 26.550),
    "nagpur": (79.000, 21.050, 79.180, 21.220),
    "patna": (85.050, 25.550, 85.250, 25.680),
    "bhopal": (77.300, 23.160, 77.520, 23.320),
    "indore": (75.780, 22.640, 75.950, 22.800),
    "chandigarh": (76.720, 30.680, 76.840, 30.780),
    "surat": (72.740, 21.120, 72.900, 21.260),
    "visakhapatnam": (83.200, 17.650, 83.400, 17.800),
    "kochi": (76.230, 9.900, 76.360, 10.050),
    "guwahati": (91.630, 26.100, 91.850, 26.220),
    "varanasi": (82.920, 25.250, 83.050, 25.370),
    "ludhiana": (75.780, 30.850, 75.950, 31.000),
    "agra": (77.940, 27.140, 78.100, 27.240),
    "nashik": (73.720, 19.940, 73.850, 20.060),
    "ranchi": (85.250, 23.300, 85.400, 23.430),
    "raipur": (81.580, 21.180, 81.720, 21.300),
    "amritsar": (74.800, 31.580, 74.950, 31.700),
    "noida": (77.300, 28.470, 77.520, 28.640),
    "gurugram": (76.950, 28.360, 77.120, 28.520),
    "faridabad": (77.260, 28.340, 77.380, 28.470),
    "thiruvananthapuram": (76.880, 8.450, 77.050, 8.600),
    "vadodara": (73.120, 22.250, 73.250, 22.370),
}

TRACKED_CITIES = [
    {"name": "Delhi", "lat": 28.6139, "lon": 77.2090},
    {"name": "Mumbai", "lat": 19.0760, "lon": 72.8777},
    {"name": "Kolkata", "lat": 22.5726, "lon": 88.3639},
    {"name": "Chennai", "lat": 13.0827, "lon": 80.2707},
    {"name": "Bengaluru", "lat": 12.9716, "lon": 77.5946},
    {"name": "Hyderabad", "lat": 17.3850, "lon": 78.4867},
    {"name": "Pune", "lat": 18.5204, "lon": 73.8567},
    {"name": "Ahmedabad", "lat": 23.0225, "lon": 72.5714},
    {"name": "Jaipur", "lat": 26.9124, "lon": 75.7873},
    {"name": "Lucknow", "lat": 26.8467, "lon": 80.9462},
    {"name": "Kanpur", "lat": 26.4499, "lon": 80.3319},
    {"name": "Nagpur", "lat": 21.1458, "lon": 79.0882},
    {"name": "Patna", "lat": 25.5941, "lon": 85.1376},
    {"name": "Bhopal", "lat": 23.2599, "lon": 77.4126},
    {"name": "Indore", "lat": 22.7196, "lon": 75.8577},
    {"name": "Chandigarh", "lat": 30.7333, "lon": 76.7794},
    {"name": "Surat", "lat": 21.1702, "lon": 72.8311},
    {"name": "Visakhapatnam", "lat": 17.6868, "lon": 83.2185},
    {"name": "Kochi", "lat": 9.9312, "lon": 76.2673},
    {"name": "Guwahati", "lat": 26.1445, "lon": 91.7362},
    {"name": "Varanasi", "lat": 25.3176, "lon": 82.9739},
    {"name": "Noida", "lat": 28.5355, "lon": 77.3910},
    {"name": "Gurugram", "lat": 28.4595, "lon": 77.0266},
    {"name": "Faridabad", "lat": 28.4089, "lon": 77.3178},
]
