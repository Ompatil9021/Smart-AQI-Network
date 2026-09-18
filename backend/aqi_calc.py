"""India CPCB AQI sub-index helpers used for current AQI and UI categories."""

from typing import Optional

# (conc_low, conc_high, aqi_low, aqi_high)
PM25_BREAKS = [
    (0, 30, 0, 50),
    (31, 60, 51, 100),
    (61, 90, 101, 200),
    (91, 120, 201, 300),
    (121, 250, 301, 400),
    (251, 380, 401, 500),
]
PM10_BREAKS = [
    (0, 50, 0, 50),
    (51, 100, 51, 100),
    (101, 250, 101, 200),
    (251, 350, 201, 300),
    (351, 430, 301, 400),
    (431, 600, 401, 500),
]
NO2_BREAKS = [
    (0, 40, 0, 50),
    (41, 80, 51, 100),
    (81, 180, 101, 200),
    (181, 280, 201, 300),
    (281, 400, 301, 400),
    (401, 800, 401, 500),
]
SO2_BREAKS = [
    (0, 40, 0, 50),
    (41, 80, 51, 100),
    (81, 380, 101, 200),
    (381, 800, 201, 300),
    (801, 1600, 301, 400),
    (1601, 2620, 401, 500),
]
O3_BREAKS = [
    (0, 50, 0, 50),
    (51, 100, 51, 100),
    (101, 168, 101, 200),
    (169, 208, 201, 300),
    (209, 748, 301, 400),
    (749, 1000, 401, 500),
]
CO_BREAKS_MGM3 = [
    (0, 1.0, 0, 50),
    (1.1, 2.0, 51, 100),
    (2.1, 10.0, 101, 200),
    (10.1, 17.0, 201, 300),
    (17.1, 34.0, 301, 400),
    (34.1, 50.0, 401, 500),
]


def _sub_index(value: Optional[float], breaks) -> Optional[float]:
    if value is None:
        return None
    try:
        conc = float(value)
    except (TypeError, ValueError):
        return None
    if conc < 0:
        conc = 0
    for c_low, c_high, i_low, i_high in breaks:
        if conc <= c_high or (c_low, c_high) == breaks[-1]:
            if conc > c_high:
                conc = c_high
            span_c = c_high - c_low or 1
            span_i = i_high - i_low
            return ((span_i / span_c) * (conc - c_low)) + i_low
    return None


def compute_cpcb_aqi(pollutants: dict) -> int:
    pm25 = _sub_index(pollutants.get("pm2_5"), PM25_BREAKS)
    pm10 = _sub_index(pollutants.get("pm10"), PM10_BREAKS)
    no2 = _sub_index(pollutants.get("no2"), NO2_BREAKS)
    so2 = _sub_index(pollutants.get("so2"), SO2_BREAKS)
    o3 = _sub_index(pollutants.get("o3"), O3_BREAKS)
    co_ug = pollutants.get("co")
    co_mg = None if co_ug is None else float(co_ug) / 1000.0
    co = _sub_index(co_mg, CO_BREAKS_MGM3)

    values = [v for v in (pm25, pm10, no2, so2, o3, co) if v is not None]
    if not values:
        return 0
    return int(round(max(values)))


def aqi_category(aqi: Optional[float]) -> str:
    if aqi is None:
        return "Unknown"
    aqi = float(aqi)
    if aqi <= 50:
        return "Good"
    if aqi <= 100:
        return "Satisfactory"
    if aqi <= 200:
        return "Moderate"
    if aqi <= 300:
        return "Poor"
    if aqi <= 400:
        return "Very Poor"
    return "Severe"


def aqi_color(aqi: Optional[float]) -> str:
    if aqi is None:
        return "#64748b"
    aqi = float(aqi)
    if aqi <= 50:
        return "#22c55e"
    if aqi <= 100:
        return "#eab308"
    if aqi <= 200:
        return "#f97316"
    if aqi <= 300:
        return "#ef4444"
    return "#7f1d1d"


def clamp_aqi(value: float) -> int:
    return int(max(0, min(500, round(float(value)))))
