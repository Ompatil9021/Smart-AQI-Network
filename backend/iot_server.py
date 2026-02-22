from flask import Flask, render_template, request, redirect, jsonify
import sqlite3

app = Flask(__name__)
DB_FILE = 'delhi_aqi.db'

def get_db_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

@app.route('/')
def index():
    conn = get_db_connection()
    areas = conn.execute('SELECT * FROM areas').fetchall()
    
    # Get all streets grouped by area
    area_data = {}
    for area in areas:
        streets = conn.execute('SELECT * FROM streets WHERE area_id = ?', (area['id'],)).fetchall()
        area_data[area] = streets
        
    conn.close()
    return render_template('iot_dashboard.html', area_data=area_data)

@app.route('/update_street', methods=['POST'])
def update_street():
    street_id = request.form['street_id']
    new_aqi = float(request.form['aqi'])
    
    # Simulate Physics: PM2.5 is usually half of AQI roughly
    pm2_5 = new_aqi / 2
    pm10 = new_aqi
    
    conn = get_db_connection()
    
    # 1. Update the Street Sensor
    conn.execute('UPDATE streets SET aqi = ?, pm2_5 = ?, pm10 = ? WHERE id = ?', 
                 (new_aqi, pm2_5, pm10, street_id))
    
    # 2. Trigger: Recalculate Area Average automatically
    # (Get the area_id for this street)
    street = conn.execute('SELECT area_id FROM streets WHERE id = ?', (street_id,)).fetchone()
    area_id = street['area_id']
    
    # (Calculate avg of all streets in this area)
    avg_aqi = conn.execute('SELECT AVG(aqi) FROM streets WHERE area_id = ?', (area_id,)).fetchone()[0]
    
    # (Update Area Table)
    conn.execute('UPDATE areas SET avg_aqi = ? WHERE id = ?', (avg_aqi, area_id))
    
    conn.commit()
    conn.close()
    
    return redirect('/')
@app.route('/toggle_sensor', methods=['POST'])
def toggle_sensor():
    area_id = request.form['area_id']
    current_status = request.form['current_status']
    # Toggle between online and offline
    new_status = 'offline' if current_status == 'online' else 'online'
    
    conn = get_db_connection()
    conn.execute('UPDATE areas SET status = ? WHERE id = ?', (new_status, area_id))
    conn.commit()
    conn.close()
    return redirect('/')

if __name__ == '__main__':
    print("🎛️ IoT Controller running on http://localhost:5001")
    app.run(port=5001, debug=True)