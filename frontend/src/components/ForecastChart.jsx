import {
  Area,
  AreaChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowDownRight, ArrowUpRight, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { aqiCategory, aqiColor } from '../aqi';

export default function ForecastChart({ city, current, forecast }) {
  const currentVal = Number(current) || 0;
  const h6 = Number(forecast?.['6h']) || currentVal;
  const h24 = Number(forecast?.['24h']) || currentVal;
  const h48 = Number(forecast?.['48h']) || currentVal;

  const data = [
    { label: 'Current', sub: 'Observed Now', aqi: currentVal, category: aqiCategory(currentVal) },
    { label: '+6 Hours', sub: 'Short-term', aqi: h6, category: aqiCategory(h6) },
    { label: '+24 Hours', sub: 'Tomorrow', aqi: h24, category: aqiCategory(h24) },
    { label: '+48 Hours', sub: 'Day After', aqi: h48, category: aqiCategory(h48) },
  ];

  const trend = h48 - currentVal;
  const strokeColor = aqiColor(currentVal);
  const endColor = aqiColor(h48);

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      const color = aqiColor(d.aqi);
      return (
        <div className="rounded-xl border border-slate-700 bg-slate-950/95 p-3 shadow-2xl backdrop-blur-xl">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{d.label} · {d.sub}</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-black" style={{ color }}>
              {d.aqi}
            </span>
            <span className="text-xs font-semibold text-slate-300">AQI ({d.category})</span>
          </div>
          <p className="mt-1 text-[10px] text-slate-500">XGBoost machine learning forecast</p>
        </div>
      );
    }
    return null;
  };

  const renderCustomDot = (props) => {
    const { cx, cy, payload } = props;
    const dotColor = aqiColor(payload.aqi);
    return (
      <g key={`dot-${payload.label}`}>
        <circle cx={cx} cy={cy} r={6} fill="#0f172a" stroke={dotColor} strokeWidth={3} />
        <circle cx={cx} cy={cy} r={2.5} fill={dotColor} />
      </g>
    );
  };

  return (
    <div className="flex flex-col justify-between h-full space-y-4">
      {/* Trend Summary Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div>
          <p className="text-xs text-slate-400">48-Hour ML Horizon</p>
          <p className="text-sm font-semibold text-white">
            {city ? `${city} Air Quality Trajectory` : 'Air Quality Trajectory'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {trend > 0 ? (
            <span className="flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/15 px-3 py-1 text-xs font-bold text-red-400 shadow-sm">
              <TrendingUp size={14} /> Rising (+{trend} AQI)
            </span>
          ) : trend < 0 ? (
            <span className="flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-400 shadow-sm">
              <TrendingDown size={14} /> Improving ({trend} AQI)
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-bold text-slate-300 shadow-sm">
              <Minus size={14} /> Stable (0 change)
            </span>
          )}
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 28, right: 28, left: -10, bottom: 4 }}>
            <defs>
              <linearGradient id="aqiForecastArea" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={strokeColor} stopOpacity={0.4} />
                <stop offset="100%" stopColor={endColor} stopOpacity={0.2} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="#64748b"
              fontSize={12}
              tickLine={false}
              axisLine={{ stroke: '#334155' }}
            />
            <YAxis
              stroke="#64748b"
              fontSize={11}
              domain={['dataMin - 15', 'dataMax + 25']}
              tickLine={false}
              axisLine={{ stroke: '#334155' }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="aqi"
              stroke={strokeColor}
              strokeWidth={3.5}
              fill="url(#aqiForecastArea)"
              dot={renderCustomDot}
              activeDot={{ r: 8, stroke: '#ffffff', strokeWidth: 2 }}
            >
              <LabelList
                dataKey="aqi"
                position="top"
                offset={12}
                fill="#f8fafc"
                fontSize={12}
                fontWeight="bold"
                formatter={(val) => `${val}`}
              />
            </Area>
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Point details breakdown row */}
      <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-800/80 text-center">
        {data.map((item) => (
          <div key={item.label} className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-2">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{item.label}</p>
            <p className="text-base font-black" style={{ color: aqiColor(item.aqi) }}>
              {item.aqi}
            </p>
            <p className="text-[10px] text-slate-400">{item.category}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
