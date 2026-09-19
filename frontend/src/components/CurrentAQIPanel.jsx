import { Activity, AlertTriangle, Compass, Droplets, Gauge, MapPin, ShieldCheck, Thermometer, Wind } from 'lucide-react';
import { aqiAdvice, aqiCategory, aqiColor, aqiTextColor } from '../aqi';

export default function CurrentAQIPanel({ city }) {
  if (!city) {
    return (
      <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center text-slate-400">
        <Activity size={36} className="mb-3 text-cyan-400 opacity-60 animate-pulse" />
        <p className="text-base font-medium text-slate-300">Select or search any city</p>
        <p className="text-xs text-slate-500 mt-1">Real-time AQI, atmospheric parameters, and ML forecasts will appear here.</p>
      </div>
    );
  }

  const aqi = Number(city.current_aqi) || 0;
  const color = aqiColor(aqi);
  const textColor = aqiTextColor(aqi);
  const category = city.category || aqiCategory(aqi);
  const advice = aqiAdvice(aqi);
  const weather = city.weather || {};

  // Percentage for the meter (clamped 0 to 500)
  const meterPercent = Math.min(100, Math.max(2, (aqi / 500) * 100));

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl backdrop-blur-md">
      {/* Dynamic atmospheric radial glow */}
      <div
        className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full opacity-20 blur-3xl transition-colors duration-500"
        style={{ backgroundColor: color }}
      />

      <div className="relative z-10 flex flex-col justify-between h-full space-y-5">
        {/* Top bar: City info & live source indicator */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-800 text-cyan-400 shadow">
              <MapPin size={16} />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight text-white">{city.city}</h2>
              <p className="text-[11px] text-slate-400">India · Real-time Air Quality</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="flex items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-800/70 px-3 py-1 text-[11px] font-medium text-slate-300 shadow-inner"
            >
              <span className={`h-2 w-2 rounded-full ${city.stale ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'}`} />
              {city.stale ? 'Cached Fallback' : city.source === 'waqi-cpcb' ? 'Live CPCB Station' : 'Live Open-Meteo'}
            </span>
          </div>
        </div>

        {/* Main AQI Display */}
        <div className="flex flex-wrap items-end justify-between gap-4 py-1">
          <div className="flex items-baseline gap-4">
            <span className="text-7xl font-black tracking-tighter" style={{ color }}>
              {aqi}
            </span>
            <div>
              <span
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold uppercase tracking-wider shadow-sm"
                style={{ backgroundColor: `${color}25`, color: textColor, border: `1px solid ${color}60` }}
              >
                {category}
              </span>
              <p className="mt-1 text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
                India CPCB AQI Scale
              </p>
            </div>
          </div>

          {/* Quick Health Callout */}
          <div className="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-950/60 px-3.5 py-2">
            {advice.mask ? (
              <AlertTriangle size={18} className="text-amber-400 flex-shrink-0" />
            ) : (
              <ShieldCheck size={18} className="text-emerald-400 flex-shrink-0" />
            )}
            <div className="text-left">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Action Recommended</p>
              <p className="text-xs font-semibold text-slate-200">{advice.action}</p>
            </div>
          </div>
        </div>

        {/* Visual Segmented AQI Meter Bar */}
        <div>
          <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
            {/* Color spectrum gradient */}
            <div
              className="h-full w-full"
              style={{
                background: 'linear-gradient(to right, #22c55e 0%, #eab308 20%, #f97316 40%, #ef4444 60%, #7f1d1d 80%, #450a0a 100%)',
              }}
            />
          </div>
          {/* Needle / Indicator indicator */}
          <div className="relative h-3 w-full">
            <div
              className="absolute top-0 -translate-x-1/2 flex flex-col items-center transition-all duration-500"
              style={{ left: `${meterPercent}%` }}
            >
              <div className="h-2 w-2 rotate-45 border-t-2 border-l-2 border-white bg-slate-900 shadow" />
            </div>
          </div>
          <div className="flex justify-between text-[10px] text-slate-500 font-medium px-0.5">
            <span>0 Good</span>
            <span>100 Satisfactory</span>
            <span>200 Moderate</span>
            <span>300 Poor</span>
            <span>400+ Severe</span>
          </div>
        </div>

        {/* Health Advisory Text */}
        <p className="text-xs leading-relaxed text-slate-300 border-t border-slate-800/80 pt-3">
          {advice.text}
        </p>

        {/* Atmospheric & Weather Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-slate-800/80">
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-2.5">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <Thermometer size={14} className="text-rose-400" /> Temp
            </div>
            <p className="mt-1 text-sm font-bold text-white">
              {weather.temperature != null ? `${weather.temperature} °C` : '—'}
            </p>
          </div>
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-2.5">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <Droplets size={14} className="text-cyan-400" /> Humidity
            </div>
            <p className="mt-1 text-sm font-bold text-white">
              {weather.humidity != null ? `${weather.humidity} %` : '—'}
            </p>
          </div>
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-2.5">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <Wind size={14} className="text-teal-400" /> Wind Gusts
            </div>
            <p className="mt-1 text-sm font-bold text-white">
              {weather.wind_gusts != null ? `${weather.wind_gusts} km/h` : '—'}
            </p>
          </div>
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-2.5">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <Gauge size={14} className="text-indigo-400" /> Pressure
            </div>
            <p className="mt-1 text-sm font-bold text-white">
              {weather.pressure != null ? `${weather.pressure} hPa` : '—'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
