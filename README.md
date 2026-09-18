# Smart AQI Network

City-level air quality dashboard using live Open-Meteo air/weather data, OpenStreetMap city boundaries, and XGBoost 6h / 24h / 48h forecasts.

## Stack
- **Frontend**: React, Leaflet, Recharts, Tailwind
- **Backend**: Flask, SQLite cache, XGBoost
- **Live data**: Open-Meteo Air Quality + Weather (free, no API key). City outlines from Nominatim, cached locally.

The previous IoT / digital-twin simulator is no longer used by the dashboard.

## Run
1. Backend: `cd backend` → `pip install -r requirements.txt` → `python app.py`
2. Frontend: `cd frontend` → `npm install` → `npm run dev`

API: `http://localhost:5000`  
UI: `http://localhost:5173`

## API
- `GET /api/city/<city_name>` — current AQI, pollutants, 6h/24h/48h forecast, city polygon
- `GET /api/search?q=` — city autocomplete
- `GET /api/map` — tracked Indian cities with AQI-colored polygons
- `GET /api/leaderboard` — cities sorted by AQI
- `GET /api/health`

Live results are cached ~90 seconds. If Open-Meteo is unreachable, the last stored city payload is returned.
