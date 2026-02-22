# 🌍 Yukti Smart City AQI Network

An AI-powered, hyperlocal Air Quality Monitoring system featuring a real-time digital twin map, IoT sensor simulation, and advanced Machine Learning forecasting.

## 🚀 Features
* **Live Digital Twin Map**: Built with React and Leaflet, displaying a dark-mode command center of Delhi's active sensor zones.
* **IoT God Mode**: A Flask-based simulation panel to manually trigger AQI spikes, simulate power cuts, and test real-time system responses.
* **AI Forecasting (0.98 R²)**: Uses a heavily tuned Random Forest Regressor trained on 2019-2024 Delhi NCR data to predict 6h, 24h, and 48h pollution trends.
* **Smart Emergency Alerts**: Browser push notifications that instantly warn users when local sensors cross hazardous thresholds.

## 🛠️ Tech Stack
* **Frontend**: React.js, Tailwind CSS, Recharts, Leaflet
* **Backend**: Python, Flask, SQLite
* **Machine Learning**: Scikit-Learn, Pandas, Numpy

## ⚡ How to Run
1. **Backend**: `cd backend` -> `pip install -r requirements.txt` -> `python app.py`
2. **IoT Controller**: `cd backend` -> `python iot_server.py` (Runs on port 5001)
3. **Frontend**: `cd frontend` -> `npm install` -> `npm run dev`