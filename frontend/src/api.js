const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000/api';

export async function fetchCity(cityName) {
  const res = await fetch(`${API_URL}/city/${encodeURIComponent(cityName)}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'City not found');
  }
  return data;
}

export async function searchCities(query) {
  const res = await fetch(`${API_URL}/search?q=${encodeURIComponent(query)}`);
  const data = await res.json();
  return data.results || [];
}

export async function fetchMapCities() {
  const res = await fetch(`${API_URL}/map`);
  const data = await res.json();
  return data.cities || [];
}

export async function fetchLeaderboard() {
  const res = await fetch(`${API_URL}/leaderboard`);
  const data = await res.json();
  return data.cities || [];
}

export async function fetchCityHistory(cityName) {
  const res = await fetch(`${API_URL}/city/${encodeURIComponent(cityName)}/history`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'History not found');
  }
  return data;
}
