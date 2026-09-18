import { useEffect, useMemo, useState } from 'react';
import { Circle, MapContainer, TileLayer, Tooltip, ZoomControl, useMap } from 'react-leaflet';
import { AreaChart, Area, ResponsiveContainer, XAxis, Tooltip as ReTooltip } from 'recharts';
import { X, Search, Layers, MapPin, Navigation, ZoomIn, ZoomOut, Wind } from 'lucide-react';
import { aqiCategory, aqiColor } from '../aqi';

const CARTO_DARK = 'https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png?key=cb1_3pnv_1_4f48a70818caf27cfe058ee8';
const INDIA_CENTER = [22.5, 78.5];
const INDIA_BOUNDS = [[6.0, 67.5], [37.5, 98.0]];

const AQI_LEGEND = [
  { label: '0–50', color: '#22c55e' },
  { label: '51–100', color: '#a3e635' },
  { label: '101–150', color: '#eab308' },
  { label: '151–200', color: '#f97316' },
  { label: '201–300', color: '#ef4444' },
  { label: '301+', color: '#7f1d1d' },
];

const LAYERS = ['AQI', 'Weather', 'Sensors'];

/* ── haversine + radii same logic as CityMap ────────────────── */
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function computeRadii(items, def = 22) {
  const r = {};
  items.forEach((i) => { r[i.city] = def; });
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      if (!a.lat || !b.lat) continue;
      const maxR = haversine(a.lat, a.lon, b.lat, b.lon) / 2 - 2;
      if (maxR < r[a.city]) r[a.city] = Math.max(5, maxR);
      if (maxR < r[b.city]) r[b.city] = Math.max(5, maxR);
    }
  }
  return Object.fromEntries(Object.entries(r).map(([c, km]) => [c, km * 1000]));
}

/* ── Fly helper ─────────────────────────────────────────────── */
function FlyTo({ city }) {
  const map = useMap();
  useEffect(() => {
    if (city?.lat && city?.lon) map.flyTo([city.lat, city.lon], 9, { duration: 1.1 });
    else map.flyToBounds(INDIA_BOUNDS, { padding: [30, 30], duration: 1.1 });
  }, [city, map]);
  return null;
}

/* ── Map zoom controls (imperative) ─────────────────────────── */
function MapZoomButtons() {
  const map = useMap();
  return (
    <div className="absolute bottom-28 right-3 z-[500] flex flex-col gap-1">
      <button
        onClick={() => map.zoomIn()}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/90 text-slate-200 shadow-lg hover:bg-slate-800 transition"
      >
        <ZoomIn size={16} />
      </button>
      <button
        onClick={() => map.zoomOut()}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/90 text-slate-200 shadow-lg hover:bg-slate-800 transition"
      >
        <ZoomOut size={16} />
      </button>
      <button
        onClick={() => map.flyToBounds(INDIA_BOUNDS, { padding: [30, 30] })}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/90 text-slate-300 shadow-lg hover:bg-slate-800 transition"
        title="Zoom to India"
      >
        <Navigation size={14} />
      </button>
    </div>
  );
}

/* ── Sparkline for AQI history ──────────────────────────────── */
function AQISparkline({ data }) {
  if (!data || data.length === 0) return <div className="h-16 flex items-center justify-center text-xs text-slate-500">No history data</div>;
  const chartData = data.slice(-24).map((d) => ({
    t: d.time ? d.time.slice(11, 16) : '',
    v: d.us_aqi ?? 0,
  }));
  const last = chartData[chartData.length - 1]?.v ?? 0;
  const color = aqiColor(last);
  return (
    <ResponsiveContainer width="100%" height={60}>
      <AreaChart data={chartData} margin={{ top: 2, right: 2, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.4} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="t" hide />
        <ReTooltip
          contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }}
          labelStyle={{ color: '#94a3b8' }}
          itemStyle={{ color }}
          formatter={(v) => [v, 'AQI']}
        />
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill="url(#sparkGrad)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ── Left side panel ─────────────────────────────────────────── */
function SidePanel({ city, historyData }) {
  if (!city) return (
    <div className="absolute left-4 top-20 z-[600] w-72 rounded-2xl border border-slate-700/60 bg-slate-900/80 p-5 backdrop-blur-xl shadow-2xl">
      <div className="flex items-center gap-2 text-slate-400">
        <MapPin size={14} />
        <span className="text-xs">Select a city on the map</span>
      </div>
    </div>
  );

  const color = aqiColor(city.current_aqi);
  const category = city.category || aqiCategory(city.current_aqi);
  const p = city.pollutants || {};

  const metrics = [
    { label: 'PM₂.₅', value: p.pm2_5, unit: 'µg/m³', limit: 60 },
    { label: 'PM₁₀', value: p.pm10, unit: 'µg/m³', limit: 100 },
    { label: 'CO', value: p.co, unit: 'µg/m³', limit: 4000 },
    { label: 'NO₂', value: p.no2, unit: 'µg/m³', limit: 80 },
    { label: 'SO₂', value: p.so2, unit: 'µg/m³', limit: 80 },
    { label: 'O₃', value: p.o3, unit: 'µg/m³', limit: 180 },
  ];

  return (
    <div className="absolute left-4 top-20 z-[600] w-72 rounded-2xl border border-slate-700/50 bg-slate-950/85 backdrop-blur-xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2 mb-0.5">
          <MapPin size={13} className="text-cyan-400 flex-shrink-0" />
          <p className="text-xs text-slate-400 leading-tight">{city.city}, India</p>
        </div>
        <p className="text-[10px] text-slate-500">Live Open-Meteo · Real-time</p>
      </div>

      {/* AQI card */}
      <div className="px-4 py-3 border-b border-slate-800" style={{ background: `${color}12` }}>
        <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">Air Quality Index</p>
        <div className="flex items-center justify-between">
          <span className="text-5xl font-black leading-none" style={{ color }}>{city.current_aqi}</span>
          <span
            className="rounded-lg px-2.5 py-1 text-xs font-bold"
            style={{ background: `${color}25`, color, border: `1px solid ${color}50` }}
          >
            {category}
          </span>
        </div>
      </div>

      {/* Pollutant metrics */}
      <div className="px-4 py-3 border-b border-slate-800 space-y-2">
        {metrics.map((m) => {
          if (m.value == null) return null;
          const pct = Math.min(100, (m.value / m.limit) * 100);
          const barColor = pct > 80 ? '#ef4444' : pct > 50 ? '#f97316' : '#22c55e';
          return (
            <div key={m.label}>
              <div className="flex justify-between text-[11px] mb-0.5">
                <span className="text-slate-400 font-medium">{m.label}</span>
                <span className="text-slate-300 font-semibold">{m.value.toFixed(1)} <span className="text-slate-500 font-normal">{m.unit}</span></span>
              </div>
              <div className="h-1 w-full rounded-full bg-slate-800">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Sparkline */}
      <div className="px-4 pt-3 pb-2 border-b border-slate-800">
        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">AQI — Last 24 Hours</p>
        <AQISparkline data={historyData} />
      </div>

      {/* Legend */}
      <div className="px-4 py-3">
        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">AQI Scale</p>
        <div className="flex gap-1">
          {AQI_LEGEND.map((l) => (
            <div key={l.label} className="flex-1 text-center">
              <div className="h-2 rounded-sm mb-1" style={{ background: l.color }} />
              <span className="text-[8px] text-slate-500 leading-none">{l.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Main fullscreen map component ──────────────────────────── */
export default function FullscreenMap({ cities, selectedCity, onSelectCity, historyData, onClose, onSearch }) {
  const [activeLayer, setActiveLayer] = useState('AQI');
  const [searchQ, setSearchQ] = useState('');

  const layers = useMemo(() => {
    const byName = new Map(cities.map((c) => [c.city, c]));
    if (selectedCity?.city) {
      byName.set(selectedCity.city, { ...byName.get(selectedCity.city), ...selectedCity });
    }
    return Array.from(byName.values());
  }, [cities, selectedCity]);

  const radii = useMemo(() => computeRadii(layers, 22), [layers]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQ.trim()) { onSearch(searchQ.trim()); setSearchQ(''); }
  };

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[1000] flex flex-col bg-slate-950">
      {/* Top nav bar */}
      <div className="relative z-[700] flex items-center gap-3 border-b border-slate-800 bg-slate-950/95 px-4 py-2.5 backdrop-blur-xl">
        {/* Logo */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Wind size={18} className="text-cyan-400" />
          <span className="text-sm font-black text-white tracking-tight hidden sm:block">Smart AQI</span>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex-1 max-w-md">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Search city…"
              className="w-full rounded-xl border border-slate-700 bg-slate-800/80 pl-8 pr-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-cyan-500 transition"
            />
          </div>
        </form>

        {/* Layer toggle */}
        <div className="hidden sm:flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800/60 p-0.5">
          <Layers size={13} className="text-slate-400 ml-2" />
          {LAYERS.map((l) => (
            <button
              key={l}
              onClick={() => setActiveLayer(l)}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${activeLayer === l ? 'bg-cyan-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-700 transition flex-shrink-0"
          title="Close fullscreen (Esc)"
        >
          <X size={18} />
        </button>
      </div>

      {/* Map area */}
      <div className="relative flex-1">
        <MapContainer
          center={INDIA_CENTER}
          zoom={5}
          minZoom={4}
          maxZoom={10}
          maxBounds={INDIA_BOUNDS}
          maxBoundsViscosity={1.0}
          style={{ height: '100%', width: '100%', background: '#020617' }}
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            url={CARTO_DARK}
            noWrap={true}
          />

          {layers.map((item) => {
            const color = aqiColor(item.current_aqi);
            const category = item.category || aqiCategory(item.current_aqi);
            const isSel = selectedCity?.city === item.city;
            const radius = radii[item.city] ?? 22000;
            if (!item.lat || !item.lon) return null;
            return (
              <Circle
                key={item.city}
                center={[item.lat, item.lon]}
                radius={isSel ? radius * 1.2 : radius}
                pathOptions={{
                  color: isSel ? '#ffffff' : color,
                  weight: isSel ? 2.5 : 1.5,
                  fillColor: color,
                  fillOpacity: isSel ? 0.45 : 0.2,
                  opacity: isSel ? 1 : 0.85,
                }}
                eventHandlers={{ click: () => onSelectCity(item.city) }}
              >
                <Tooltip className="aqi-map-tooltip" sticky direction="top" opacity={1}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>{item.city}</div>
                      <div style={{ fontSize: 11, color }}>{category}</div>
                    </div>
                    <div style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, background: color, color: item.current_aqi > 200 ? '#fff' : '#0f172a' }}>
                      {item.current_aqi ?? '—'}
                    </div>
                  </div>
                </Tooltip>
              </Circle>
            );
          })}

          <FlyTo city={selectedCity} />
          <MapZoomButtons />
        </MapContainer>

        {/* Left side panel */}
        <SidePanel city={selectedCity} historyData={historyData} />
      </div>
    </div>
  );
}
