export function aqiColor(aqi) {
  if (aqi == null) return '#64748b';
  if (aqi <= 50) return '#22c55e'; // Green
  if (aqi <= 100) return '#eab308'; // Yellow
  if (aqi <= 200) return '#f97316'; // Orange
  if (aqi <= 300) return '#ef4444'; // Red
  return '#7f1d1d'; // Dark Red / Maroon
}

export function aqiTextColor(aqi) {
  if (aqi == null) return '#94a3b8';
  if (aqi <= 50) return '#4ade80';
  if (aqi <= 100) return '#facc15';
  if (aqi <= 200) return '#fb923c';
  if (aqi <= 300) return '#f87171';
  return '#fda4af';
}

export function aqiCategory(aqi) {
  if (aqi == null) return 'Unknown';
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Satisfactory';
  if (aqi <= 200) return 'Moderate';
  if (aqi <= 300) return 'Poor';
  if (aqi <= 400) return 'Very Poor';
  return 'Severe';
}

export function aqiAdvice(aqi) {
  if (aqi == null) {
    return { title: 'No Data', text: 'Select a city to view current atmospheric health advice.' };
  }
  if (aqi <= 50) {
    return {
      title: 'Good Air',
      text: 'Air quality is considered satisfactory, and air pollution poses little or no risk. Ideal for outdoor recreation.',
      action: 'Enjoy outdoor activities',
      mask: false,
    };
  }
  if (aqi <= 100) {
    return {
      title: 'Satisfactory',
      text: 'Air quality is acceptable. A very small number of people who are unusually sensitive to air pollution should limit prolonged outdoor exertion.',
      action: 'Sensitive groups monitor exertion',
      mask: false,
    };
  }
  if (aqi <= 200) {
    return {
      title: 'Moderate',
      text: 'Breathing discomfort to people with lungs, asthma and heart diseases. Children and the elderly should reduce prolonged outdoor activities.',
      action: 'Reduce strenuous outdoor activity',
      mask: false,
    };
  }
  if (aqi <= 300) {
    return {
      title: 'Poor Air Quality',
      text: 'Breathing discomfort to most people on prolonged exposure. Sensitive groups should stay indoors and wear an N95 mask if going outside.',
      action: 'Wear an N95 mask outdoors',
      mask: true,
    };
  }
  if (aqi <= 400) {
    return {
      title: 'Very Poor',
      text: 'Respiratory illness to the people on prolonged exposure. Avoid going out, keep indoor air purifiers running, and keep windows sealed.',
      action: 'Avoid outdoor activities',
      mask: true,
    };
  }
  return {
    title: 'Severe / Hazardous',
    text: 'Health alert: serious risk of respiratory impact on healthy individuals. Remain indoors, avoid physical exertion, and run HEPA air filtration.',
    action: 'Strictly remain indoors',
    mask: true,
  };
}

export function pollutantAssessment(key, val) {
  if (val == null) return { category: '—', color: '#64748b' };
  const v = Number(val);
  if (isNaN(v)) return { category: '—', color: '#64748b' };

  switch (key) {
    case 'pm2_5':
      if (v <= 30) return { category: 'Good', color: '#22c55e' };
      if (v <= 60) return { category: 'Satisfactory', color: '#eab308' };
      if (v <= 90) return { category: 'Moderate', color: '#f97316' };
      if (v <= 120) return { category: 'Poor', color: '#ef4444' };
      return { category: 'Severe', color: '#7f1d1d' };
    case 'pm10':
      if (v <= 50) return { category: 'Good', color: '#22c55e' };
      if (v <= 100) return { category: 'Satisfactory', color: '#eab308' };
      if (v <= 250) return { category: 'Moderate', color: '#f97316' };
      if (v <= 350) return { category: 'Poor', color: '#ef4444' };
      return { category: 'Severe', color: '#7f1d1d' };
    case 'no2':
      if (v <= 40) return { category: 'Good', color: '#22c55e' };
      if (v <= 80) return { category: 'Satisfactory', color: '#eab308' };
      if (v <= 180) return { category: 'Moderate', color: '#f97316' };
      return { category: 'High', color: '#ef4444' };
    case 'so2':
      if (v <= 40) return { category: 'Good', color: '#22c55e' };
      if (v <= 80) return { category: 'Satisfactory', color: '#eab308' };
      if (v <= 380) return { category: 'Moderate', color: '#f97316' };
      return { category: 'High', color: '#ef4444' };
    case 'co':
      // Open-Meteo CO is in ug/m3. 1000 ug/m3 = 1 mg/m3
      const mg = v / 1000;
      if (mg <= 1.0) return { category: 'Good', color: '#22c55e' };
      if (mg <= 2.0) return { category: 'Satisfactory', color: '#eab308' };
      if (mg <= 10.0) return { category: 'Moderate', color: '#f97316' };
      return { category: 'High', color: '#ef4444' };
    case 'o3':
      if (v <= 50) return { category: 'Good', color: '#22c55e' };
      if (v <= 100) return { category: 'Satisfactory', color: '#eab308' };
      if (v <= 168) return { category: 'Moderate', color: '#f97316' };
      return { category: 'High', color: '#ef4444' };
    default:
      return { category: 'Normal', color: '#38bdf8' };
  }
}
