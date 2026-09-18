import { useEffect, useMemo } from 'react';
import { Circle, MapContainer, TileLayer, Tooltip, ZoomControl, useMap } from 'react-leaflet';
import { aqiCategory, aqiColor } from '../aqi';

/* ── India-centric bounds ─────────────────────────────────── */
const INDIA_CENTER = [22.5, 78.5];
const INDIA_BOUNDS = [
  [6.0, 67.5],
  [37.5, 98.0],
];

/* ── Haversine distance (km) between two lat/lon points ────── */
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ── Compute non-overlapping radii (in metres) ─────────────── */
function computeRadii(items, defaultRadiusKm = 20) {
  const radii = {};
  items.forEach((item) => { radii[item.city] = defaultRadiusKm; });

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      if (!a.lat || !a.lon || !b.lat || !b.lon) continue;
      const dist = haversine(a.lat, a.lon, b.lat, b.lon);
      const maxR = dist / 2 - 2; // each circle gets half the gap minus 2km margin
      if (maxR < radii[a.city]) radii[a.city] = Math.max(5, maxR);
      if (maxR < radii[b.city]) radii[b.city] = Math.max(5, maxR);
    }
  }

  return Object.fromEntries(
    Object.entries(radii).map(([city, km]) => [city, km * 1000]) // km → metres
  );
}

/* ── Fly to selected city ─────────────────────────────────── */
function FlyToSelection({ city }) {
  const map = useMap();
  useEffect(() => {
    if (city && city.lat && city.lon) {
      map.flyTo([city.lat, city.lon], 9, { duration: 1.2 });
    } else {
      map.flyToBounds(INDIA_BOUNDS, { padding: [20, 20], duration: 1.2 });
    }
  }, [city, map]);
  return null;
}

/* ── Single city circle ───────────────────────────────────── */
function CityCircle({ item, selected, onSelect, radius }) {
  const color = aqiColor(item.current_aqi);
  const category = item.category || aqiCategory(item.current_aqi);

  if (!item.lat || !item.lon) return null;

  return (
    <Circle
      center={[item.lat, item.lon]}
      radius={selected ? radius * 1.2 : radius}
      pathOptions={{
        color: selected ? '#ffffff' : color,
        weight: selected ? 2.5 : 1.5,
        fillColor: color,
        fillOpacity: selected ? 0.45 : 0.2,  // glass: semi-transparent
        opacity: selected ? 1 : 0.85,
      }}
      eventHandlers={{ click: () => onSelect(item.city) }}
    >
      <Tooltip className="aqi-map-tooltip" sticky direction="top" opacity={1}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>{item.city}</div>
            <div style={{ fontSize: 11, color }}>{category}</div>
          </div>
          <div
            style={{
              width: 30, height: 30, borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 900,
              background: color,
              color: item.current_aqi > 200 ? '#fff' : '#0f172a',
            }}
          >
            {item.current_aqi ?? '—'}
          </div>
        </div>
      </Tooltip>
    </Circle>
  );
}

/* ── Legend ────────────────────────────────────────────────── */
const LEGEND = [
  { range: '0–50', color: '#22c55e' },
  { range: '51–100', color: '#eab308' },
  { range: '101–200', color: '#f97316' },
  { range: '201–300', color: '#ef4444' },
  { range: '301+', color: '#7f1d1d' },
];

export default function CityMap({ cities, selectedCity, onSelectCity }) {
  const layers = useMemo(() => {
    const byName = new Map(cities.map((c) => [c.city, c]));
    if (selectedCity?.city) {
      byName.set(selectedCity.city, {
        ...byName.get(selectedCity.city),
        ...selectedCity,
      });
    }
    return Array.from(byName.values());
  }, [cities, selectedCity]);

  // Compute non-overlapping radii for all cities
  const radii = useMemo(() => computeRadii(layers, 20), [layers]);

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={INDIA_CENTER}
        zoom={5}
        minZoom={4}
        maxZoom={10}
        maxBounds={INDIA_BOUNDS}
        maxBoundsViscosity={1.0}
        style={{ height: '100%', width: '100%', background: '#0a0f1e' }}
        zoomControl={false}
      >
        <ZoomControl position="bottomright" />

        {/* CARTO dark with API key — no watermark */}
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png?key=cb1_3pnv_1_4f48a70818caf27cfe058ee8"
          noWrap={true}
        />

        {/* AQI City Circles */}
        {layers.map((item) => (
          <CityCircle
            key={item.city}
            item={item}
            selected={selectedCity?.city === item.city}
            onSelect={onSelectCity}
            radius={radii[item.city] ?? 20000}
          />
        ))}

        <FlyToSelection city={selectedCity} />
      </MapContainer>

      {/* Compact legend — bottom-left */}
      <div className="absolute bottom-3 left-3 z-[500] flex flex-wrap items-center gap-2 rounded-xl border border-slate-700/60 bg-slate-950/85 px-3 py-2 backdrop-blur-lg shadow-xl">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">AQI</span>
        {LEGEND.map((t) => (
          <div key={t.range} className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.color }} />
            <span className="text-[10px] text-slate-400">{t.range}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
