import os
import sqlite3
import pickle
import pandas as pd
from flask import Flask, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

DB_FILE = 'delhi_aqi.db'
# Make sure your new 0.98 accuracy files are in this 'models' folder!
MODEL_PATH = os.path.join('models', 'aqi_model.pkl')
COLS_PATH = os.path.join('models', 'model_columns.pkl')

model = None
model_columns = []

# ==========================================
# 1. LOAD ML MODEL
# ==========================================
def load_model():
    global model, model_columns
    try:
        with open(MODEL_PATH, 'rb') as f:
            model = pickle.load(f)
        with open(COLS_PATH, 'rb') as f:
            model_columns = pickle.load(f)
        print("✅ High-Accuracy ML Engine Loaded Successfully!")
    except Exception as e:
        print(f"❌ Error loading model: {e}")

def get_db_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

# ==========================================
# 2. MAP ENDPOINT (Macro Level - Areas)
# ==========================================
@app.route('/api/areas', methods=['GET'])
def get_areas():
    """Returns all Delhi areas and their average AQI for the Map"""
    conn = get_db_connection()
    areas = conn.execute('SELECT * FROM areas').fetchall()
    conn.close()
    return jsonify([dict(ix) for ix in areas])

# ==========================================
# 3. STREET ENDPOINT + ML PREDICTION (Micro Level)
# ==========================================
@app.route('/api/street/<string:street_name>', methods=['GET'])
def get_street(street_name):
    """Searches for a street, gets live data, and predicts future AQI"""
    conn = get_db_connection()
    # Case-insensitive search using LIKE
    street = conn.execute('SELECT * FROM streets WHERE name LIKE ?', (f'%{street_name}%',)).fetchone()
    conn.close()
    
    if not street:
        return jsonify({'error': 'Street not found'}), 404
        
    street_data = dict(street)
    
    # Run ML Prediction for this specific street using the New 0.98 R2 Model
    if model and model_columns:
        try:
            # Construct input matching the exact 7 features the new model expects
            input_data = {
                'pm25': street_data['pm2_5'],
                'pm10': street_data['pm10'],
                'no2': 25.0,  # Baseline approximation
                'so2': 10.0,  # Baseline approximation
                'o3': 30.0,   # Baseline approximation
                'co': 1.0,    # Baseline approximation
                'aqi': street_data['aqi']
            }
            
            # Format for Scikit-Learn
            input_df = pd.DataFrame([input_data])
            final_input = pd.DataFrame()
            
            # Ensure columns are in the exact order the model was trained on
            for col in model_columns:
                final_input[col] = input_df.get(col, 0)
                
            # Execute Prediction
            pred = model.predict(final_input)[0] 
            
            street_data['forecast'] = {
                '6h': int(round(pred[0])),
                '24h': int(round(pred[1])),
                '48h': int(round(pred[2]))
            }
        except Exception as e:
            print(f"ML Prediction Error: {e}")
            street_data['forecast'] = None
    else:
        street_data['forecast'] = None

    return jsonify(street_data)

if __name__ == '__main__':
    load_model()
    print("🚀 Main API Engine running on http://localhost:5000")
    app.run(port=5000, debug=True)