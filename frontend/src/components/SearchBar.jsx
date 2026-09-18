import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { searchCities } from '../api';

export default function SearchBar({ value, onChange, onSelect, loading }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = value.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return undefined;
    }
    timer.current = setTimeout(async () => {
      try {
        const results = await searchCities(q);
        setSuggestions(results);
        setOpen(results.length > 0);
      } catch {
        setSuggestions([]);
      }
    }, 320);
    return () => clearTimeout(timer.current);
  }, [value]);

  const hint = useMemo(
    () => (suggestions.length ? 'Select a city' : 'Try Delhi, Mumbai, Nagpur…'),
    [suggestions.length]
  );

  const submit = (event) => {
    event.preventDefault();
    if (!value.trim()) return;
    setOpen(false);
    onSelect(value.trim());
  };

  return (
    <form onSubmit={submit} className="relative">
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => suggestions.length && setOpen(true)}
            placeholder="Search any Indian city (Delhi, Mumbai, Nagpur…)"
            className="w-full bg-slate-800/70 border border-slate-700 rounded-2xl pl-11 pr-4 py-3.5 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40"
            autoComplete="off"
          />
          {open && suggestions.length > 0 && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setOpen(false)}
              />
              <div className="absolute z-40 mt-2 w-full overflow-hidden rounded-xl border border-slate-700 bg-slate-900/95 shadow-2xl backdrop-blur-xl divide-y divide-slate-800/60">
                {suggestions.map((item) => (
                  <button
                    type="button"
                    key={`${item.name}-${item.lat}`}
                    className="block w-full px-4 py-2.5 text-left text-sm text-slate-200 hover:bg-slate-800 transition"
                    onClick={() => {
                      onChange(item.name);
                      setOpen(false);
                      onSelect(item.name);
                    }}
                  >
                    <div className="font-semibold text-white">{item.name}</div>
                    <div className="text-[11px] text-slate-400">{item.label}</div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-3 rounded-2xl bg-gradient-to-r from-cyan-600 to-blue-600 font-semibold text-white shadow-lg shadow-cyan-600/25 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-60 transition cursor-pointer"
        >
          {loading ? 'Fetching…' : 'View AQI'}
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500">{hint}</p>
    </form>
  );
}
