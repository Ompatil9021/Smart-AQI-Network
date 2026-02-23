import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer, Circle, Popup } from 'react-leaflet';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { 
  AlertTriangle, Activity, Wind, ShieldAlert, Settings, HeartPulse, 
  MapPin, Battery, Wifi, Search, TrendingUp, Gauge, CloudRain, 
  Sun, Factory, Car, Building2, Radio, Cpu, Zap, Eye, Users,
  ArrowUp, ArrowDown, Bell, Clock, Calendar, Globe, Layers,
  Thermometer, Droplets, Navigation, Power
} from 'lucide-react';

const API_URL = 'http://127.0.0.1:5000/api';

const App = () => {
  const [areas, setAreas] = useState([]);
  const [cityAvgAQI, setCityAvgAQI] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [streetData, setStreetData] = useState(null);
  const [error, setError] = useState('');
  const [selectedTimeRange, setSelectedTimeRange] = useState('24h');
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [graphView, setGraphView] = useState('All');
  const [dataPoints, setDataPoints] = useState(12500);
  
  const [trendData, setTrendData] = useState([
    { time: '00:00', aqi: 100, pm25: 50 } // Starting baseline
  
  ]);

  // --- NEW: ONBOARDING & NOTIFICATION STATE ---
  const [showOnboarding, setShowOnboarding] = useState(false);
  const lastKnownAqi = useRef(null);
  const [setupLocation, setSetupLocation] = useState('');
  const [setupError, setSetupError] = useState('');

  // Check if it's the user's first time visiting
  useEffect(() => {
    const hasSetup = localStorage.getItem('AQI SmartGuard');
    if (!hasSetup) {
      // Small delay so the map loads in the background before blurring
      setTimeout(() => setShowOnboarding(true), 1000); 
    }
  }, []);

  const handleNotificationSetup = async (e) => {
    e.preventDefault();
    setSetupError('');

    // Check if the area exists in our database
    const availableZones = areas.map(a => a.name.toLowerCase());
    const isAvailable = availableZones.some(zone => setupLocation.toLowerCase().includes(zone));

    if (!isAvailable) {
      setSetupError(`We currently don't have sensors in "${setupLocation}". Try "Connaught Place" or "Dwarka".`);
      return;
    }

    // Ask browser for Notification Permission
    if ("Notification" in window) {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        new Notification("Yukti Smart Alerts Enabled! 🌍", {
          body: `You will now receive morning summaries and critical AQI alerts for ${setupLocation}.`,
          icon: "https://cdn-icons-png.flaticon.com/512/3208/3208975.png"
        });
      }
    }

    // Close modal and save to local storage so it doesn't show again
    // NEW: Save the location so we can monitor it in the background!
    localStorage.setItem('yukti_subscribed_location', setupLocation);
    localStorage.setItem('yukti_setup_done', 'true');
    setShowOnboarding(false);
  };

  const closeOnboarding = () => {
    localStorage.setItem('yukti_setup_done', 'true');
    setShowOnboarding(false);
  };
  

  // Fetch Live Data
  useEffect(() => {
    const fetchAreas = async () => {
      try {
        setIsLoading(true);
        const res = await axios.get(`${API_URL}/areas`);
        setAreas(res.data);
        if (res.data.length > 0) {
            const total = res.data.reduce((sum, area) => sum + area.avg_aqi, 0);
            const currentAvg = total / res.data.length;
            setCityAvgAQI(currentAvg);
            
            // Push new live data to the graph
            const now = new Date();
            const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            
            setTrendData(prevData => {
                const newData = [...prevData, { 
                    time: timeStr, 
                    aqi: Math.round(currentAvg), 
                    pm25: Math.round(currentAvg / 2.1) // Simulating PM2.5 based on AQI
                }];
                // Keep only the last 15 data points so it scrolls smoothly left-to-right
                return newData.length > 15 ? newData.slice(newData.length - 15) : newData;
            });

            // --- NEW: LIVE NOTIFICATION TRIGGER ---
            const savedLocation = localStorage.getItem('yukti_subscribed_location');
            if (savedLocation && Notification.permission === "granted") {
                // Find the user's saved area in the live data
                const myArea = res.data.find(a => savedLocation.toLowerCase().includes(a.name.toLowerCase()));
                
                if (myArea) {
                    const currentAqi = myArea.avg_aqi;
                    const prevAqi = lastKnownAqi.current;

                    if (prevAqi !== null) {
                        // If AQI jumps from below 300 to over 300 (SEVERE)
                        if (prevAqi < 300 && currentAqi >= 300) {
                            new Notification("🚨 CRITICAL EMERGENCY", {
                                body: `AQI in ${myArea.name} has spiked to ${Math.round(currentAqi)}! Stay indoors immediately.`,
                                icon: "https://cdn-icons-png.flaticon.com/512/3208/3208975.png"
                            });
                        } 
                        // If AQI jumps from below 200 to over 200 (VERY POOR)
                        else if (prevAqi < 200 && currentAqi >= 200 && currentAqi < 300) {
                            new Notification("⚠️ Air Quality Warning", {
                                body: `AQI in ${myArea.name} has worsened to ${Math.round(currentAqi)}. Limit outdoor activities.`,
                                icon: "https://cdn-icons-png.flaticon.com/512/3208/3208975.png"
                            });
                        }
                    }
                    // Update tracker so we don't spam notifications every 5 seconds
                    lastKnownAqi.current = currentAqi;
                }
            }
        }
        
        // Simulate notifications for high AQI areas
        const highAQIAreas = res.data.filter(area => area.avg_aqi > 200);
        if (highAQIAreas.length > 0) {
          setNotifications(prev => [
            ...prev,
            {
              id: Date.now(),
              message: `${highAQIAreas.length} area(s) exceed critical AQI levels`,
              time: 'Just now',
              type: 'warning'
            }
          ].slice(-5));
        }
      } catch (err) {
        console.error("Error fetching areas", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAreas();
    const interval = setInterval(fetchAreas, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    setError('');
    setStreetData(null);
    setIsLoading(true);
    try {
      const res = await axios.get(`${API_URL}/street/${searchQuery}`);
      setStreetData(res.data);
      setNotifications(prev => [
        {
          id: Date.now(),
          message: `Analyzed ${res.data.name} - AQI: ${Math.round(res.data.aqi)}`,
          time: 'Just now',
          type: 'info'
        },
        ...prev
      ].slice(0, 5));
    } catch (err) {
      setError('Street not found. Try "Connaught Place Main Road".');
    } finally {
      setIsLoading(false);
    }
  };

  const getAQIColor = (aqi) => {
    if (aqi <= 50) return '#10b981'; 
    if (aqi <= 100) return '#f59e0b'; 
    if (aqi <= 200) return '#f97316'; 
    if (aqi <= 300) return '#ef4444'; 
    return '#8b5cf6'; 
  };

  const getAQIGradient = (aqi) => {
    if (aqi <= 50) return 'from-emerald-500 to-green-400';
    if (aqi <= 100) return 'from-yellow-500 to-amber-400';
    if (aqi <= 200) return 'from-orange-500 to-red-400';
    if (aqi <= 300) return 'from-red-600 to-rose-500';
    return 'from-purple-600 to-violet-500';
  };

  const getHealthAdvisory = (aqi) => {
    if (aqi <= 50) return { 
      title: "Excellent", 
      text: "Air quality is satisfactory. Perfect for outdoor activities.", 
      icon: Sun,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/30"
    };
    if (aqi <= 100) return { 
      title: "Moderate", 
      text: "Acceptable air quality. Sensitive individuals should limit prolonged exposure.", 
      icon: Users,
      color: "text-yellow-400",
      bg: "bg-yellow-500/10",
      border: "border-yellow-500/30"
    };
    if (aqi <= 200) return { 
      title: "Poor", 
      text: "Health effects possible for everyone. Reduce outdoor activities.", 
      icon: AlertTriangle,
      color: "text-orange-400",
      bg: "bg-orange-500/10",
      border: "border-orange-500/30"
    };
    if (aqi <= 300) return { 
      title: "Very Poor", 
      text: "Health alert: everyone may experience serious health effects.", 
      icon: ShieldAlert,
      color: "text-red-400",
      bg: "bg-red-500/10",
      border: "border-red-500/30"
    };
    return { 
      title: "Hazardous", 
      text: "Emergency conditions. Stay indoors with air purifiers.", 
      icon: Factory,
      color: "text-purple-400",
      bg: "bg-purple-500/10",
      border: "border-purple-500/30"
    };
  };
  
  const advisory = getHealthAdvisory(cityAvgAQI);
  const AdvisoryIcon = advisory.icon;

  // Enhanced data with trends
  const correlationData = [
    { time: '00:00', aqi: 95, wind: 15, temperature: 18, humidity: 65 },
    { time: '04:00', aqi: 85, wind: 12, temperature: 16, humidity: 70 },
    { time: '08:00', aqi: 110, wind: 10, temperature: 20, humidity: 62 },
    { time: '12:00', aqi: 160, wind: 8, temperature: 26, humidity: 55 },
    { time: '16:00', aqi: 240, wind: 5, temperature: 28, humidity: 50 },
    { time: '20:00', aqi: 180, wind: 9, temperature: 23, humidity: 58 },
  ];

  const hotspots = [...areas].sort((a, b) => b.avg_aqi - a.avg_aqi).slice(0, 5);

  // --- NEW: DYNAMIC SENSOR CALCULATIONS ---
  // 5 Areas * 3 Streets each = 15 Total Sensors
  const totalSensors = areas.length * 3; 
  // Count how many areas are 'online' and multiply by 3
  const activeSensors = areas.filter(area => area.status === 'online').length * 3;
  // Calculate network coverage percentage
  const coveragePercent = totalSensors > 0 ? Math.round((activeSensors / totalSensors) * 100) : 0;

  const stats = [
    { label: 'Active Sensors', value: `${activeSensors}/${totalSensors}`, icon: Radio, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Data Points', value: dataPoints.toLocaleString(), icon: Cpu, color: 'text-purple-400', bg: 'bg-purple-500/10' },
    { label: 'Avg Response', value: '2.3s', icon: Zap, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
    { label: 'Coverage', value: `${coveragePercent}%`, icon: Globe, color: 'text-green-400', bg: 'bg-green-500/10' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100 font-sans">

      {/* --- ONBOARDING MODAL --- */}
      {showOnboarding && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Blurred Backdrop */}
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={closeOnboarding} />
          
          {/* Modal Card */}
          <div className="relative z-10 w-full max-w-md bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl border border-slate-700/50 shadow-2xl shadow-blue-500/10 p-8 animate-fadeIn">
            {/* Close Button */}
            <button
              onClick={closeOnboarding}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 transition-colors text-xl font-bold"
            >
              ✕
            </button>

            {/* Icon & Title */}
            <div className="flex flex-col items-center text-center mb-6">
              <div className="p-4 bg-blue-500/20 rounded-full mb-4">
                <Bell size={32} className="text-blue-400" />
              </div>
              <h2 className="text-2xl font-black text-white mb-2">
                Welcome to Yukti 🌍
              </h2>
              <p className="text-slate-400 text-sm leading-relaxed">
                Stay ahead of air pollution. Set up smart alerts and get morning AQI summaries delivered right to your device.
              </p>
            </div>

            {/* Features List */}
            <div className="space-y-3 mb-6">
              {[
                { icon: '🔔', text: 'Critical AQI alerts when levels spike' },
                { icon: '🌅', text: 'Morning air quality briefings' },
                { icon: '📍', text: 'Hyperlocal data for your area' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                  <span className="text-lg">{item.icon}</span>
                  <span className="text-sm text-slate-300">{item.text}</span>
                </div>
              ))}
            </div>

            {/* Location Form */}
            <form onSubmit={handleNotificationSetup} className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 uppercase tracking-wider mb-2 font-semibold">
                  Your Area / Neighbourhood
                </label>
                <input
                  type="text"
                  value={setupLocation}
                  onChange={(e) => setSetupLocation(e.target.value)}
                  placeholder='e.g. Connaught Place, Dwarka...'
                  required
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all text-sm"
                />
                {setupError && (
                  <p className="mt-2 text-xs text-red-400">{setupError}</p>
                )}
              </div>
              <button
                type="submit"
                className="w-full py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2"
              >
                <Bell size={16} /> Enable Smart Alerts
              </button>
              <button
                type="button"
                onClick={closeOnboarding}
                className="w-full py-2 text-sm text-slate-500 hover:text-slate-300 transition-colors"
              >
                Skip for now
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Animated Background Grid */}
{/* Animated Background Grid */}
      <div className="fixed inset-0 bg-[url('data:image/svg+xml,%3Csvg width=%2260%22 height=%2260%22 viewBox=%220 0 60 60%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cg fill=%22none%22 fill-rule=%22evenodd%22%3E%3Cg fill=%22%239C92AC%22 fill-opacity=%220.05%22%3E%3Cpath d=%22M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-20 pointer-events-none" />      {/* Loading Overlay */}
      {isLoading && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="relative">
            <div className="w-20 h-20 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Activity className="w-8 h-8 text-blue-400 animate-pulse" />
            </div>
          </div>
        </div>
      )}

      {/* Header with Glass Effect */}
      <div className="sticky top-0 z-30 backdrop-blur-xl bg-slate-950/70 border-b border-slate-800/50">
        {cityAvgAQI > 150 && (
          <div className="bg-gradient-to-r from-red-600/90 to-rose-600/90 text-white p-3 flex items-center justify-between shadow-2xl relative overflow-hidden">
            <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.1)_50%,transparent_75%)] animate-shimmer" />
            <div className="flex items-center gap-3 font-bold relative z-10">
              <ShieldAlert className="animate-pulse" size={20} />
              <span>⚠️ CRITICAL ALERT: City AQI has reached hazardous levels. Emergency protocols activated.</span>
            </div>
            <button className="bg-white/20 hover:bg-white/30 backdrop-blur px-4 py-1.5 rounded-lg transition-all flex items-center gap-2 text-sm font-medium relative z-10">
              <Bell size={16} /> Broadcast Alert
            </button>
          </div>
        )}

        <header className="px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl shadow-lg shadow-blue-500/30">
                  <Activity size={24} className="text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                    Yukti Smart City
                  </h1>
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <Navigation size={10} /> Hyperlocal Sensor Network • Delhi NCT
                  </p>
                </div>
              </div>
              
              {/* Quick Stats */}
              <div className="hidden lg:flex items-center gap-4">
                {stats.map((stat, idx) => {
                  const Icon = stat.icon;
                  return (
                    <div key={idx} className={`px-3 py-1.5 rounded-lg ${stat.bg} border border-slate-800/50`}>
                      <div className="flex items-center gap-2">
                        <Icon size={14} className={stat.color} />
                        <div>
                          <p className="text-xs text-slate-400">{stat.label}</p>
                          <p className="text-sm font-bold text-white">{stat.value}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Notifications */}
              <div className="relative">
                <button className="p-2 hover:bg-slate-800 rounded-lg transition-colors relative">
                  <Bell size={20} className="text-slate-400" />
                  {notifications.length > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-ping" />
                  )}
                </button>
              </div>

              {/* City AQI Display */}
              {/* City AQI Display */}
              <div 
                className="px-5 py-2 rounded-xl bg-slate-900/90 shadow-lg backdrop-blur-md border-l-4"
                style={{ borderColor: getAQIColor(cityAvgAQI) }}
              >
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-1 font-semibold">City Average</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black drop-shadow-md" style={{color: getAQIColor(cityAvgAQI)}}>
                    {Math.round(cityAvgAQI)}
                  </span>
                  <span className="text-sm text-slate-300 font-bold">AQI</span>
                </div>
              </div>
            </div>
          </div>
        </header>
      </div>

      {/* Main Content */}
      <div className="relative z-10">
        {/* Hero Map Section */}
        <div className="h-[50vh] relative group">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-slate-950 z-10 pointer-events-none" />
          <MapContainer 
            center={[28.6139, 77.2090]} 
            zoom={11} 
            minZoom={10} 
            maxBounds={[
              [28.40, 76.83], // South-West boundary of Delhi
              [28.88, 77.34]  // North-East boundary of Delhi
            ]}
            maxBoundsViscosity={1.0} // Makes it strictly bounce back if dragged away
            style={{ height: '100%', width: '100%' }} 
            zoomControl={false}
            className="z-0"
          >
            {/* Removed the dark-map-tiles class so it stops inverting the colors! */}
            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
            
            {areas.filter(area => area.status === 'online').map((area) => (
              <Circle 
                key={area.id} 
                center={[area.lat, area.lon]} 
                radius={4500} // This is exactly 4.5 Kilometers in real life
                pathOptions={{ 
                  color: getAQIColor(area.avg_aqi),
                  fillColor: getAQIColor(area.avg_aqi),
                  fillOpacity: 0.5,
                  weight: 2
                }}
              >
                <Popup className="custom-popup">
                  <div className="bg-slate-900 p-3 rounded-lg border border-slate-700">
                    <h3 className="font-bold text-white">{area.name}</h3>
                    <p className="text-2xl font-black" style={{color: getAQIColor(area.avg_aqi)}}>
                      {Math.round(area.avg_aqi)} AQI
                    </p>
                    <p className="text-xs text-slate-400">Last updated: Just now</p>
                  </div>
                </Popup>
              </Circle>
            ))}
          </MapContainer>
          
          {/* Map Overlay Controls */}
          <div className="absolute bottom-4 right-4 z-20 flex gap-2">
            <button className="p-2 bg-slate-900/90 backdrop-blur rounded-lg border border-slate-700 hover:bg-slate-800 transition-colors">
              <Layers size={18} />
            </button>
            <button className="p-2 bg-slate-900/90 backdrop-blur rounded-lg border border-slate-700 hover:bg-slate-800 transition-colors">
              <Radio size={18} />
            </button>
          </div>
        </div>

        {/* Content Overlay */}
        <div className="max-w-7xl mx-auto px-6 -mt+4 relative z-20 pb-10">
          {/* Search Card */}
          <div className="backdrop-blur-xl bg-slate-900/70 rounded-2xl border border-slate-800/50 shadow-2xl p-6 mb-8">
            <form onSubmit={handleSearch} className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input 
                  type="text" 
                  placeholder="Search street for AI-powered forecast (e.g., Connaught Place Main Road)..." 
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <button 
                type="submit" 
                className="px-8 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-xl hover:from-blue-500 hover:to-cyan-500 transition-all font-bold flex items-center gap-2 shadow-lg shadow-blue-600/30"
              >
                <Search size={18} /> Analyze with AI
              </button>
            </form>

            {error && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            {streetData && (
              <div className="mt-6 animate-fadeIn">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Street Info */}
                  <div className="lg:col-span-1 bg-gradient-to-br from-slate-800/50 to-slate-900/50 rounded-xl p-5 border border-slate-700/50">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                          <MapPin className="text-blue-400" size={18} />
                          {streetData.name}
                        </h3>
                        <p className="text-sm text-slate-400">Real-time hyperlocal data</p>
                      </div>
                      <div className="px-3 py-1 bg-blue-500/20 rounded-full text-xs text-blue-300 border border-blue-500/30">
                        Live
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg">
                        <span className="text-slate-400">Current AQI</span>
                        <span className="text-2xl font-black" style={{color: getAQIColor(streetData.aqi)}}>
                          {Math.round(streetData.aqi)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg">
                        <span className="text-slate-400">PM 2.5</span>
                        <span className="font-bold text-white">{streetData.pm2_5?.toFixed(1)} µg/m³</span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg">
                        <span className="text-slate-400">PM 10</span>
                        <span className="font-bold text-white">{streetData.pm10?.toFixed(1) || '--'} µg/m³</span>
                      </div>
                    </div>
                  </div>

                  {/* ML Forecast */}
                  {streetData.forecast && (
                    <div className="lg:col-span-2 bg-gradient-to-br from-blue-900/20 to-purple-900/20 rounded-xl p-5 border border-blue-500/30">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-500/20 rounded-lg">
                            <TrendingUp size={18} className="text-blue-400" />
                          </div>
                          <div>
                            <h4 className="font-bold text-white">ML Forecast (Random Forest)</h4>
                            <p className="text-xs text-slate-400">AI-powered predictions with 94% accuracy</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {['6h', '24h', '48h'].map((range) => (
                            <button
                              key={range}
                              onClick={() => setSelectedTimeRange(range)}
                              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                                selectedTimeRange === range 
                                  ? 'bg-blue-500 text-white' 
                                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                              }`}
                            >
                              {range}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4 mt-4">
                        {Object.entries(streetData.forecast).map(([period, value]) => (
                          <div key={period} className="text-center p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
                            <p className="text-xs text-slate-400 mb-2 uppercase tracking-wider">
                              {period === '6h' ? 'Next 6 Hours' : period === '24h' ? 'Tomorrow' : 'Day After'}
                            </p>
                            <p className="text-3xl font-black mb-1" style={{color: getAQIColor(value)}}>
                              {value}
                            </p>
                            <p className="text-xs text-slate-400">AQI</p>
                            <div className="mt-2 flex items-center justify-center gap-1 text-xs">
                              {value > streetData.aqi ? (
                                <>
                                  <ArrowUp size={12} className="text-red-400" />
                                  <span className="text-red-400">+{Math.abs(value - streetData.aqi)}</span>
                                </>
                              ) : (
                                <>
                                  <ArrowDown size={12} className="text-green-400" />
                                  <span className="text-green-400">-{Math.abs(value - streetData.aqi)}</span>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Dashboard Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Health Advisory Card */}
            <div className={`lg:col-span-1 ${advisory.bg} ${advisory.border} rounded-2xl border p-6 backdrop-blur-sm`}>
              <div className="flex items-center gap-3 mb-4">
                <div className={`p-2 rounded-lg ${advisory.bg}`}>
                  <AdvisoryIcon size={20} className={advisory.color} />
                </div>
                <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Health Advisory</h2>
              </div>
              <p className={`text-3xl font-black ${advisory.color} mb-2`}>{advisory.title}</p>
              <p className="text-sm text-slate-300 leading-relaxed">{advisory.text}</p>
              
              {/* Additional metrics */}
              <div className="mt-6 pt-4 border-t border-white/10">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Sensitive Groups</span>
                  <span className="text-white font-medium">Avoid outdoors</span>
                </div>
                <div className="flex justify-between text-sm mt-2">
                  <span className="text-slate-400">Mask Required</span>
                  <span className="text-white font-medium">N95 recommended</span>
                </div>
              </div>
            </div>

            {/* AQI Trend Chart */}
            {/* REAL-TIME LIVE TREND CHART */}
            <div className="lg:col-span-2 bg-slate-900/50 backdrop-blur-sm rounded-2xl border border-slate-800/50 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/20 rounded-lg">
                    <TrendingUp size={18} className="text-blue-400" />
                  </div>
                  <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Live AQI GRAPH</h2>
                </div>
                {/* Working Toggle Buttons */}
                <div className="flex gap-2">
                  <button onClick={() => setGraphView('AQI')} className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${graphView === 'AQI' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>AQI</button>
                  <button onClick={() => setGraphView('PM2.5')} className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${graphView === 'PM2.5' ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-500/30' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>PM2.5</button>
                  <button onClick={() => setGraphView('All')} className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${graphView === 'All' ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/30' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>Compare</button>
                </div>
              </div>
              
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData}>
                    <defs>
                      <linearGradient id="aqiGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="pmGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickMargin={10} />
                    {/* Dynamic Y-Axis that scales with the data automatically */}
                    <YAxis stroke="#64748b" fontSize={11} domain={['dataMin - 10', 'dataMax + 20']} />
                    <RechartsTooltip 
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.5rem', color: '#fff' }} 
                    />
                    
                    {/* Conditionally Render Graph Lines based on button clicked */}
                    {(graphView === 'All' || graphView === 'AQI') && (
                      <Area type="monotone" dataKey="aqi" stroke="#ef4444" strokeWidth={3} fill="url(#aqiGradient)" name="Live City AQI" animationDuration={500} />
                    )}
                    {(graphView === 'All' || graphView === 'PM2.5') && (
                      <Area type="monotone" dataKey="pm25" stroke="#06b6d4" strokeWidth={3} fill="url(#pmGradient)" name="PM 2.5 Level" animationDuration={500} />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Hotspots */}
            <div className="bg-slate-900/50 backdrop-blur-sm rounded-2xl border border-slate-800/50 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-red-500/20 rounded-lg">
                  <AlertTriangle size={18} className="text-red-400" />
                </div>
                <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Critical Zones</h2>
              </div>
              
              <div className="space-y-3">
                {hotspots.map((zone, idx) => (
                  <div key={idx} className="group relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -skew-x-12 translate-x-[-100%] group-hover:translate-x-[200%] transition-transform duration-1000" />
                    <div className="relative flex items-center justify-between p-3 bg-slate-800/30 rounded-lg border border-slate-700/50 hover:border-slate-600 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-1 h-8 rounded-full" style={{backgroundColor: getAQIColor(zone.avg_aqi)}} />
                        <span className="text-sm font-medium">{zone.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">AQI</span>
                        <span className="font-bold px-2 py-1 rounded text-xs" style={{
                          backgroundColor: getAQIColor(zone.avg_aqi),
                          color: zone.avg_aqi > 200 ? 'white' : 'black'
                        }}>
                          {Math.round(zone.avg_aqi)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button className="w-full mt-4 p-2 text-sm text-blue-400 hover:text-blue-300 transition-colors border border-blue-500/30 rounded-lg hover:bg-blue-500/10">
                View All Zones
              </button>
            </div>

            {/* IoT Sensor Network */}
            {/* LIVE DYNAMIC IOT SENSOR NETWORK */}
            <div className="lg:col-span-4 bg-gradient-to-br from-slate-900/50 to-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-800/50 p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-500/20 rounded-lg">
                    <Radio size={18} className="text-green-400" />
                  </div>
                  <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">IoT Sensor Network Status</h2>
                </div>
                <div className="flex gap-2">
                  <button className="px-3 py-1 bg-green-500/20 text-green-400 rounded-lg text-xs font-medium flex items-center gap-1">
                    <Power size={12} /> All Sensors
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {areas.map((node, idx) => (
                  <div 
                    key={idx} 
                    className={`relative p-4 rounded-xl border transition-all ${
                      node.status === 'online' 
                        ? 'bg-slate-800/50 border-slate-700 hover:border-slate-600' 
                        : 'bg-red-900/10 border-red-900/50 hover:border-red-800/50'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="text-sm font-bold text-white">{node.name}</p>
                        <p className="text-xs text-slate-400">Node 0{idx + 1}</p>
                      </div>
                      <div className={`px-2 py-1 rounded text-xs font-medium ${
                        node.status === 'online' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {node.status === 'online' ? '● Online' : '○ Offline'}
                      </div>
                    </div>

                    {node.status === 'online' ? (
                      <>
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          <div>
                            <p className="text-xs text-slate-400">AQI</p>
                            <p className="text-lg font-bold" style={{color: getAQIColor(node.avg_aqi)}}>
                              {Math.round(node.avg_aqi)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-400">PM2.5</p>
                            <p className="text-sm font-bold text-white">
                              {Math.round(node.avg_aqi / 2.1)} µg
                            </p>
                          </div>
                        </div>

                        <div className="flex justify-between items-center text-xs">
                          <div className="flex items-center gap-1">
                            <Battery size={12} className={node.battery > 20 ? 'text-green-400' : 'text-red-400'} />
                            <span className={node.battery > 20 ? 'text-green-400' : 'text-red-400'}>{node.battery}%</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Wifi size={12} className={
                              node.signal === 'strong' ? 'text-green-400' :
                              node.signal === 'medium' ? 'text-yellow-400' : 'text-red-400'
                            } />
                            <span className="text-slate-400 capitalize">{node.signal}</span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="py-4 text-center text-sm text-red-400">
                        Sensor offline - Power cut
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.5s ease-out;
        }
      `}</style>
    </div>
  );
};

export default App;