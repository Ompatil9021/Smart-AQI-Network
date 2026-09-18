import { useEffect, useRef, useState } from 'react';
import { Bell, BellOff, CheckCircle, X, MapPin, Clock } from 'lucide-react';

const STORAGE_KEY = 'aqi_notification_prefs';
const SLOTS = [
  { id: 'morning',   label: 'Morning',   time: '6:00 AM',  icon: '🌅' },
  { id: 'afternoon', label: 'Afternoon', time: '12:00 PM', icon: '☀️' },
  { id: 'evening',   label: 'Evening',   time: '6:00 PM',  icon: '🌆' },
  { id: 'night',     label: 'Night',     time: '10:00 PM', icon: '🌙' },
];

export function shouldShowModal() {
  try {
    const prefs = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return !prefs; // show if never answered
  } catch {
    return true;
  }
}

export default function NotificationModal({ onClose }) {
  const [city, setCity] = useState('');
  const [slots, setSlots] = useState({ morning: true, afternoon: false, evening: true, night: false });
  const [step, setStep] = useState('form'); // 'form' | 'success' | 'denied'
  const [permStatus, setPermStatus] = useState(Notification.permission);
  const inputRef = useRef(null);

  useEffect(() => {
    // Focus the city input when modal opens
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const toggleSlot = (id) => setSlots((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleConfirm = async () => {
    if (!city.trim()) {
      inputRef.current?.focus();
      return;
    }

    let permission = permStatus;
    if (permission === 'default') {
      try {
        permission = await Notification.requestPermission();
        setPermStatus(permission);
      } catch {
        permission = 'denied';
      }
    }

    const prefs = {
      city: city.trim(),
      slots,
      permission,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));

    if (permission === 'granted') {
      // Show immediate confirmation notification
      new Notification('Smart AQI Network', {
        body: `You'll receive AQI alerts for ${city.trim()} at your selected times.`,
        icon: '/favicon.ico',
      });
      setStep('success');
    } else {
      setStep('denied');
    }

    setTimeout(() => onClose(), 2200);
  };

  const handleSkip = () => {
    // Save a "skipped" marker so the modal never shows again
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ skipped: true, savedAt: new Date().toISOString() }));
    onClose();
  };

  return (
    <>
      {/* Backdrop with blur */}
      <div
        className="fixed inset-0 z-[2000] bg-slate-950/70 backdrop-blur-md"
        onClick={handleSkip}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Notification preferences"
        className="fixed inset-0 z-[2001] flex items-center justify-center p-4"
      >
        <div
          className="w-full max-w-md rounded-3xl border border-slate-700/60 bg-slate-900/95 shadow-2xl backdrop-blur-xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {step === 'success' && (
            <div className="flex flex-col items-center gap-3 p-10 text-center">
              <CheckCircle size={48} className="text-green-400" />
              <p className="text-lg font-bold text-white">All set!</p>
              <p className="text-sm text-slate-400">AQI alerts enabled for <strong className="text-cyan-400">{city}</strong></p>
            </div>
          )}

          {step === 'denied' && (
            <div className="flex flex-col items-center gap-3 p-10 text-center">
              <BellOff size={48} className="text-amber-400" />
              <p className="text-lg font-bold text-white">Preferences saved</p>
              <p className="text-sm text-slate-400">Browser notifications were blocked. You can enable them in browser settings.</p>
            </div>
          )}

          {step === 'form' && (
            <>
              {/* Header */}
              <div className="relative flex items-center gap-3 border-b border-slate-800 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 px-6 py-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-500/20 text-cyan-400">
                  <Bell size={22} />
                </div>
                <div>
                  <h2 className="text-base font-black text-white">Stay AQI Informed</h2>
                  <p className="text-xs text-slate-400">Get daily air quality alerts for your city</p>
                </div>
                <button
                  onClick={handleSkip}
                  className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-6 space-y-5">
                {/* City input */}
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    <MapPin size={11} /> Your City
                  </label>
                  <input
                    ref={inputRef}
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); }}
                    placeholder="e.g. Delhi, Mumbai, Pune…"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 transition"
                  />
                </div>

                {/* Schedule slots */}
                <div>
                  <label className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    <Clock size={11} /> Notification Schedule
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {SLOTS.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggleSlot(s.id)}
                        className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                          slots[s.id]
                            ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300'
                            : 'border-slate-700 bg-slate-800/60 text-slate-400 hover:border-slate-600'
                        }`}
                      >
                        <span className="text-lg">{s.icon}</span>
                        <div>
                          <p className="text-xs font-semibold leading-tight">{s.label}</p>
                          <p className="text-[10px] opacity-70">{s.time}</p>
                        </div>
                        <div className={`ml-auto h-4 w-4 rounded-full border-2 flex-shrink-0 ${slots[s.id] ? 'border-cyan-400 bg-cyan-400' : 'border-slate-600'}`} />
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[10px] text-slate-500">
                    In-app alerts will show when the dashboard is open at selected times.
                  </p>
                </div>

                {/* Permission note */}
                {permStatus === 'denied' && (
                  <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                    Browser notifications are currently blocked. Preferences will still be saved.
                  </p>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={handleSkip}
                    className="flex-1 rounded-xl border border-slate-700 bg-slate-800/60 py-2.5 text-sm font-semibold text-slate-400 hover:text-slate-200 hover:border-slate-600 transition"
                  >
                    Skip for now
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={!city.trim()}
                    className="flex-1 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 py-2.5 text-sm font-bold text-white shadow-lg shadow-cyan-500/25 hover:from-cyan-400 hover:to-blue-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Enable Alerts
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
