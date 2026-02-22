import sqlite3

def init_db():
    conn = sqlite3.connect('delhi_aqi.db')
    c = conn.cursor()
    
    c.execute('DROP TABLE IF EXISTS streets')
    c.execute('DROP TABLE IF EXISTS areas')
    
    # Added status, battery, and signal columns!
    c.execute('''CREATE TABLE areas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT, lat REAL, lon REAL, avg_aqi REAL,
        status TEXT DEFAULT 'online',
        battery INTEGER DEFAULT 98,
        signal TEXT DEFAULT 'strong'
    )''')
    
    c.execute('''CREATE TABLE streets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        area_id INTEGER, name TEXT, aqi REAL, pm2_5 REAL, pm10 REAL, humidity REAL,
        FOREIGN KEY(area_id) REFERENCES areas(id)
    )''')
    
    areas = [
        ("Connaught Place", 28.6304, 77.2177), ("Hauz Khas", 28.5494, 77.2001),
        ("Dwarka", 28.5882, 77.0494), ("Rohini", 28.7011, 77.1025), ("Anand Vihar", 28.6445, 77.3160)
    ]
    
    for area in areas:
        c.execute("INSERT INTO areas (name, lat, lon, avg_aqi) VALUES (?, ?, ?, 100)", area)
        area_id = c.lastrowid
        streets = [f"{area[0]} Main Road", f"{area[0]} Market", f"{area[0]} Metro Station"]
        for street in streets:
            c.execute('''INSERT INTO streets (area_id, name, aqi, pm2_5, pm10, humidity) 
                         VALUES (?, ?, 100, 50, 100, 55)''', (area_id, street))

    conn.commit()
    conn.close()
    print("✅ Database upgraded with IoT Sensor Controls!")

if __name__ == '__main__':
    init_db()