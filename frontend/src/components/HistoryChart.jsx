import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { History, Clock } from 'lucide-react';
import { aqiCategory, aqiColor } from '../aqi';

export default function HistoryChart({ city, data }) {
  const chartData = (data || []).map((d) => {
    const timeLabel = new Date(d.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const aqi = d.us_aqi || 0;
    return {
      time: timeLabel,
      fullTime: new Date(d.time).toLocaleString(),
      aqi,
      pm25: d.pm2_5,
      pm10: d.pm10,
      category: aqiCategory(aqi)
    };
  });

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      const color = aqiColor(d.aqi);
      return (
        <div className="rounded-xl border border-slate-700 bg-slate-950/95 p-3 shadow-2xl backdrop-blur-xl">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{d.fullTime}</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-black" style={{ color }}>
              {d.aqi}
            </span>
            <span className="text-xs font-semibold text-slate-300">AQI ({d.category})</span>
          </div>
          <p className="mt-1 flex gap-3 text-[11px] text-slate-400">
            <span>PM2.5: {d.pm25}</span>
            <span>PM10: {d.pm10}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  const renderCustomDot = (props) => {
    const { cx, cy, payload, index } = props;
    if (index % 3 !== 0 && index !== chartData.length - 1) return null; // Show fewer dots
    const dotColor = aqiColor(payload.aqi);
    return (
      <g key={`dot-${index}`}>
        <circle cx={cx} cy={cy} r={4} fill="#0f172a" stroke={dotColor} strokeWidth={2} />
        <circle cx={cx} cy={cy} r={2} fill={dotColor} />
      </g>
    );
  };

  return (
    <div className="flex flex-col justify-between h-full space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-400">
            <History size={15} />
          </div>
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">
              AQI — Last 24 Hours
            </h3>
            <p className="text-[11px] text-slate-400">
              Live Open-Meteo hourly observations
            </p>
          </div>
        </div>
        <span className="rounded-full border border-slate-700 bg-slate-800/60 px-2.5 py-0.5 text-[10px] font-semibold text-slate-300 flex items-center gap-1.5">
          <Clock size={11} className="text-indigo-400" /> Past 24h
        </span>
      </div>

      {/* Chart Canvas */}
      <div className="h-64 w-full">
        {!chartData.length ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            Loading 24h history...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="historyGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis
                dataKey="time"
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                minTickGap={30}
              />
              <YAxis
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="aqi"
                stroke="#818cf8"
                strokeWidth={2}
                fill="url(#historyGradient)"
                dot={renderCustomDot}
                activeDot={{ r: 6, fill: '#818cf8', stroke: '#fff', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
