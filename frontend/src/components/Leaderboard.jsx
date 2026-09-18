import { ChevronRight, Flame } from 'lucide-react';
import { aqiCategory, aqiColor } from '../aqi';

export default function Leaderboard({ cities, selectedCity, onSelect }) {
  // Sort descending by current_aqi
  const sorted = [...(cities || [])].sort((a, b) => (Number(b.current_aqi) || 0) - (Number(a.current_aqi) || 0));

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 shadow-xl">
      {/* Table Header */}
      <div className="grid grid-cols-12 gap-2 border-b border-slate-800 bg-slate-950/80 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
        <div className="col-span-2">Rank</div>
        <div className="col-span-5">City</div>
        <div className="col-span-2 text-center">AQI</div>
        <div className="col-span-3 text-right pr-2">Category</div>
      </div>

      {/* Rows Container */}
      <div className="max-h-[380px] divide-y divide-slate-800/60 overflow-y-auto">
        {sorted.map((row, idx) => {
          const rank = idx + 1;
          const active = selectedCity?.toLowerCase() === row.city.toLowerCase();
          const color = aqiColor(row.current_aqi);
          const category = row.category || aqiCategory(row.current_aqi);

          let badge = '';
          let rowBg = 'hover:bg-slate-800/50';

          if (rank === 1) {
            badge = '🔥';
            rowBg = active ? 'bg-red-950/40' : 'bg-gradient-to-r from-red-950/30 via-slate-900/40 to-transparent hover:from-red-950/50';
          } else if (rank === 2) {
            badge = '⚠️';
            rowBg = active ? 'bg-amber-950/40' : 'bg-gradient-to-r from-amber-950/20 via-slate-900/40 to-transparent hover:from-amber-950/40';
          } else if (rank === 3) {
            badge = '🟥';
            rowBg = active ? 'bg-orange-950/40' : 'bg-gradient-to-r from-orange-950/15 via-slate-900/40 to-transparent hover:from-orange-950/30';
          } else if (active) {
            rowBg = 'bg-cyan-950/30';
          }

          return (
            <button
              key={`${row.city}-${rank}`}
              type="button"
              onClick={() => onSelect(row.city)}
              className={`group grid w-full grid-cols-12 items-center gap-2 px-4 py-3 text-left transition-all duration-200 ${rowBg} ${
                active ? 'border-l-4 border-cyan-400 pl-3' : 'border-l-4 border-transparent'
              }`}
            >
              {/* Rank + Badge */}
              <div className="col-span-2 flex items-center gap-1">
                {badge && <span className="text-sm">{badge}</span>}
                <span className={`text-xs font-black ${rank <= 3 ? 'text-white' : 'text-slate-400'}`}>
                  #{rank}
                </span>
              </div>

              {/* City Name */}
              <div className="col-span-5 flex items-center gap-1.5 font-semibold text-slate-100 group-hover:text-cyan-300">
                <span className="truncate">{row.city}</span>
                {active && <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 flex-shrink-0" />}
              </div>

              {/* AQI Badge */}
              <div className="col-span-2 flex justify-center">
                <span
                  className="rounded-lg px-2 py-0.5 text-xs font-black shadow-sm"
                  style={{
                    backgroundColor: `${color}25`,
                    color: color,
                    border: `1px solid ${color}50`,
                  }}
                >
                  {row.current_aqi}
                </span>
              </div>

              {/* Category */}
              <div className="col-span-3 flex items-center justify-end gap-1 text-right text-xs">
                <span className="truncate text-slate-400 font-medium">{category}</span>
                <ChevronRight size={14} className="text-slate-600 opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
