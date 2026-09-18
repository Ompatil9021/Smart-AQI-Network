import { Cloud, Droplets, Factory, Flame, Leaf, Wind } from 'lucide-react';
import { pollutantAssessment } from '../aqi';

const POLLUTANTS = [
  { key: 'pm2_5', formula: 'PM2.5', name: 'Fine Particulates', unit: 'µg/m³', icon: Leaf },
  { key: 'pm10', formula: 'PM10', name: 'Coarse Dust', unit: 'µg/m³', icon: Cloud },
  { key: 'co', formula: 'CO', name: 'Carbon Monoxide', unit: 'µg/m³', icon: Flame },
  { key: 'so2', formula: 'SO₂', name: 'Sulfur Dioxide', unit: 'µg/m³', icon: Factory },
  { key: 'no2', formula: 'NO₂', name: 'Nitrogen Dioxide', unit: 'µg/m³', icon: Wind },
  { key: 'o3', formula: 'O₃', name: 'Ozone', unit: 'µg/m³', icon: Droplets },
];

export default function PollutantGrid({ pollutants = {} }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {POLLUTANTS.map(({ key, formula, name, unit, icon: Icon }) => {
        const rawValue = pollutants[key];
        const { category, color } = pollutantAssessment(key, rawValue);

        return (
          <div
            key={key}
            className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 p-4 transition-all duration-300 hover:-translate-y-1 hover:border-slate-700 hover:bg-slate-800/80 hover:shadow-xl"
            style={{
              boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.4)',
            }}
          >
            {/* Ambient hover top border glow */}
            <div
              className="absolute left-0 top-0 h-[2px] w-full opacity-60 transition-opacity duration-300 group-hover:opacity-100"
              style={{ backgroundColor: color }}
            />

            {/* Top row: Icon + Sub-index pill */}
            <div className="mb-3 flex items-center justify-between">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110"
                style={{ backgroundColor: `${color}20`, color }}
              >
                <Icon size={18} />
              </div>
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase shadow-sm"
                style={{
                  backgroundColor: `${color}18`,
                  color: color,
                  border: `1px solid ${color}40`,
                }}
              >
                {category}
              </span>
            </div>

            {/* Value & Formula */}
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black tracking-tight text-white">
                {rawValue != null ? rawValue : '—'}
              </span>
              <span className="text-[11px] font-medium text-slate-500">{unit}</span>
            </div>

            {/* Names */}
            <div className="mt-1">
              <p className="text-xs font-bold text-slate-300">{formula}</p>
              <p className="text-[10px] text-slate-500 line-clamp-1">{name}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
