import { useCallback, useEffect, useState } from 'react';
import { Activity, Bell, Globe, Maximize2, RefreshCw, Sparkles, TrendingUp, History } from 'lucide-react';
import SearchBar from './components/SearchBar';
import CityMap from './components/CityMap';
import CurrentAQIPanel from './components/CurrentAQIPanel';
import PollutantGrid from './components/PollutantGrid';
import ForecastChart from './components/ForecastChart';
import HistoryChart from './components/HistoryChart';
import Leaderboard from './components/Leaderboard';
import FullscreenMap from './components/FullscreenMap';
import NotificationModal, { shouldShowModal } from './components/NotificationModal';
import { fetchCity, fetchLeaderboard, fetchMapCities, fetchCityHistory } from './api';
import { aqiCategory, aqiColor, aqiTextColor } from './aqi';

const QUICK_CITIES = ['Delhi', 'Mumbai', 'Nagpur', 'Bengaluru', 'Kolkata', 'Pune', 'Hyderabad', 'Jaipur'];

export default function App() {
  const [query, setQuery] = useState('Delhi');
  const [selected, setSelected] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [mapCities, setMapCities] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [error, setError] = useState('');
  const [loadingCity, setLoadingCity] = useState(false);
  const [loadingMap, setLoadingMap] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [showNotifModal, setShowNotifModal] = useState(false);

  const loadCity = useCallback(async (name) => {
    setLoadingCity(true);
    setError('');
    try {
      const data = await fetchCity(name);
      setSelected(data);
      setQuery(data.city);
      
      // Load history
      try {
        const hData = await fetchCityHistory(name);
        setHistoryData(hData.hourly || []);
      } catch (err) {
        console.error('Failed to load history', err);
        setHistoryData([]);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch city data');
    } finally {
      setLoadingCity(false);
    }
  }, []);

  const loadNetwork = useCallback(async () => {
    setRefreshing(true);
    try {
      const [mapData, board] = await Promise.all([fetchMapCities(), fetchLeaderboard()]);
      setMapCities(mapData);
      setLeaderboard(board);
    } catch (err) {
      console.error('Failed to load network data:', err);
    } finally {
      setLoadingMap(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadCity('Delhi');
    loadNetwork();
    // Show notification modal on first visit (after a short delay)
    if (shouldShowModal()) {
      setTimeout(() => setShowNotifModal(true), 1500);
    }
    // 30 seconds auto-refresh as requested
    const timer = setInterval(() => {
      loadNetwork();
      if (selected) loadCity(selected.city);
    }, 30_000);
    return () => clearInterval(timer);
  }, [loadCity, loadNetwork]);

  return (
    <div className="min-h-screen bg-[#030712] text-slate-100 selection:bg-cyan-500/30">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/25">
              <Activity size={22} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black tracking-tight text-white">Smart AQI Network</h1>
                <span className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-bold text-cyan-400">
                  ML v2.0
                </span>
              </div>
              <p className="flex items-center gap-1.5 text-xs text-slate-400">
                <Globe size={11} className="text-cyan-400" /> Real Open-Meteo Data · XGBoost 6h/24h/48h Forecasts
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (selected) loadCity(selected.city);
                loadNetwork();
              }}
              disabled={refreshing || loadingCity}
              className="hidden sm:flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-slate-700 hover:bg-slate-800 transition cursor-pointer disabled:opacity-50"
              title="Refresh live data"
            >
              <RefreshCw size={13} className={refreshing || loadingCity ? 'animate-spin text-cyan-400' : ''} />
              <span>{refreshing || loadingCity ? 'Updating…' : 'Refresh'}</span>
            </button>

            {selected && (
              <div
                className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-1.5 shadow-lg backdrop-blur-md"
                style={{ borderLeft: `4px solid ${aqiColor(selected.current_aqi)}` }}
              >
                <div>
                  <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">{selected.city}</p>
                  <p className="text-[11px] font-semibold" style={{ color: aqiTextColor(selected.current_aqi) }}>
                    {selected.category || aqiCategory(selected.current_aqi)}
                  </p>
                </div>
                <p className="text-2xl font-black leading-none" style={{ color: aqiColor(selected.current_aqi) }}>
                  {selected.current_aqi}
                </p>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Fullscreen Map Overlay */}
      {showFullscreen && (
        <FullscreenMap
          cities={mapCities}
          selectedCity={selected}
          onSelectCity={loadCity}
          historyData={historyData}
          onClose={() => setShowFullscreen(false)}
          onSearch={loadCity}
        />
      )}

      {/* Notification Modal */}
      {showNotifModal && (
        <NotificationModal onClose={() => setShowNotifModal(false)} />
      )}

      {/* Map Section */}
      <div className="relative h-[45vh] min-h-[350px] w-full border-b border-slate-800/80">
        {loadingMap && mapCities.length === 0 ? (
          <div className="flex h-full items-center justify-center text-slate-400">
            <div className="flex items-center gap-3">
              <RefreshCw size={18} className="animate-spin text-cyan-400" />
              <span>Loading live city polygon map…</span>
            </div>
          </div>
        ) : (
          <CityMap cities={mapCities} selectedCity={selected} onSelectCity={loadCity} />
        )}

        {/* Fullscreen button — top-right of map */}
        <button
          type="button"
          onClick={() => setShowFullscreen(true)}
          className="absolute right-3 top-3 z-[500] flex items-center gap-1.5 rounded-xl border border-slate-700/60 bg-slate-900/85 px-2.5 py-1.5 text-xs font-semibold text-slate-300 shadow-lg backdrop-blur-sm hover:bg-slate-800 hover:text-white transition"
          title="Open fullscreen map"
        >
          <Maximize2 size={13} />
          <span className="hidden sm:inline">Fullscreen</span>
        </button>
      </div>

      {/* Main Dashboard Section */}
      <main className="mx-auto max-w-7xl space-y-6 px-4 sm:px-6 py-8">
        
        {/* Search Bar - Moved to regular document flow */}
        <div className="relative z-50 mx-auto max-w-3xl rounded-3xl border border-slate-700/60 bg-slate-900/50 p-4 shadow-xl backdrop-blur-sm">
          <SearchBar value={query} onChange={setQuery} onSelect={loadCity} loading={loadingCity} />
          
          <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mr-1 flex items-center gap-1">
              <Sparkles size={11} className="text-amber-400" /> Quick:
            </span>
            {QUICK_CITIES.map((c) => {
              const isActive = selected?.city?.toLowerCase() === c.toLowerCase();
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => loadCity(c)}
                  className={`rounded-xl px-2.5 py-1 font-medium transition cursor-pointer flex-shrink-0 ${
                    isActive
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                      : 'bg-slate-900/80 text-slate-400 border border-slate-800/80 hover:border-slate-700 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {c}
                </button>
              );
            })}
          </div>
          {error && <p className="mt-2 text-xs font-semibold text-red-400">{error}</p>}
        </div>

        {/* Row 1: Current AQI Panel & Pollutants Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-5 flex flex-col">
            <CurrentAQIPanel city={selected} />
          </div>
          <div className="lg:col-span-7 flex flex-col rounded-2xl border border-slate-800 bg-slate-900/50 p-6 shadow-xl backdrop-blur-md">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-400">
                  <Bell size={15} />
                </div>
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-white">Major Pollutants</h3>
                  <p className="text-[11px] text-slate-400">Real-time concentration & CPCB sub-index breakdown</p>
                </div>
              </div>
              <span className="text-[11px] text-slate-500 uppercase tracking-widest font-mono">µg/m³</span>
            </div>
            <PollutantGrid pollutants={selected?.pollutants} />
          </div>
        </div>

        {/* Row 2: Charts (History & Forecast) */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          
          {/* History Chart */}
          <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/50 p-6 shadow-xl backdrop-blur-md">
            <HistoryChart city={selected?.city} data={historyData} />
          </div>

          {/* Forecast Chart */}
          <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/50 p-6 shadow-xl backdrop-blur-md">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/15 text-blue-400">
                  <TrendingUp size={15} />
                </div>
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                    XGBoost Forecast
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Multi-step prediction for {selected?.city || 'Selected City'}
                  </p>
                </div>
              </div>
              <span className="rounded-full border border-slate-700 bg-slate-800/60 px-2.5 py-0.5 text-[10px] font-semibold text-slate-300">
                xgb_6h/24h/48h
              </span>
            </div>
            {selected ? (
              <ForecastChart city={selected.city} current={selected.current_aqi} forecast={selected.forecast} />
            ) : (
              <div className="flex h-64 items-center justify-center text-slate-500">
                Select a city to render prediction graph.
              </div>
            )}
          </div>

        </div>

        {/* Row 3: Most Polluted Leaderboard */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 shadow-xl backdrop-blur-md">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-white">Most Polluted Cities</h3>
              <p className="text-[11px] text-slate-400">Live rankings across monitored Indian urban regions</p>
            </div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              {leaderboard.length} Cities
            </span>
          </div>
          <Leaderboard cities={leaderboard} selectedCity={selected?.city} onSelect={loadCity} />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950/80 py-6 text-center text-xs text-slate-500">
        <p>Smart AQI Network · Powered by Open-Meteo Real-Time Weather & Air Quality APIs + XGBoost ML Models</p>
      </footer>
    </div>
  );
}
