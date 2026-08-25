const toast = document.querySelector('.toast');
const authDialog = document.querySelector('#auth-dialog');
const authForm = document.querySelector('#auth-form');
const authStatus = document.querySelector('#auth-status');
const userChip = document.querySelector('#user-chip');
const founderPanel = document.querySelector('#founder-panel');
const quickReport = document.querySelector('#quick-report');
const moderationPanel = document.querySelector('#moderation-panel');
const locationForm = document.querySelector('#location-form');
const locationStatus = document.querySelector('#location-status');
const locationInput = document.querySelector('#location-input');
const joinButton = document.querySelector('#join-button');
let authMode = 'login';
let toastTimer;
let activeSession = null;
let selectedLocation = JSON.parse(localStorage.getItem('pulsoclima_location') || 'null') || { name: 'San Martín, Mendoza', latitude: -33.0834, longitude: -68.4731 };
let communityMap;
let reportLayer;
let communityReports = [];
let activeMapCategory = 'Todos';
let confirmationsAvailable = true;
let activeProfile = null;
let leaderboardRows = [];
let photoPreviewUrl = '';

const config = window.PULSOCLIMA_CONFIG;
const client = window.supabase?.createClient(config.supabaseUrl, config.supabasePublishableKey);

function showMessage(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3000);
}

function setAuthMode(mode) {
  authMode = mode;
  const signup = mode === 'signup';
  document.querySelector('#auth-title').textContent = signup ? 'Crear cuenta' : 'Ingresar';
  document.querySelector('#auth-subtitle').textContent = signup ? 'Sumate a quienes cuentan el tiempo desde cada lugar.' : 'Volvé a conectarte con tu comunidad.';
  document.querySelector('#auth-submit').textContent = signup ? 'Crear mi cuenta' : 'Ingresar';
  document.querySelector('#auth-switch').textContent = signup ? 'Ya tengo cuenta' : '¿No tenés cuenta? Registrate';
  document.querySelector('#auth-name').closest('label').hidden = !signup;
  document.querySelector('#auth-locality-wrap').hidden = !signup;
  authStatus.textContent = '';
}

function openAuth(mode) {
  setAuthMode(mode);
  authDialog.showModal();
}

async function updateSession(session) {
  activeSession = session;
  if (!session?.user) {
    activeProfile = null;
    userChip.hidden = true;
    founderPanel.hidden = true;
    moderationPanel.hidden = true;
    quickReport.hidden = true;
    document.querySelector('#login-open').hidden = false;
    document.querySelector('#signup-open').hidden = false;
    joinButton.textContent = 'Quiero ser parte';
    joinButton.classList.remove('joined');
    if (communityReports.length) loadCommunityData();
    return;
  }
  const { data: profile } = await client.from('profiles').select('*').eq('id', session.user.id).single();
  activeProfile = profile;
  userChip.textContent = `${profile?.display_name || session.user.email} · Mi perfil`;
  userChip.hidden = false;
  document.querySelector('#login-open').hidden = true;
  document.querySelector('#signup-open').hidden = true;
  quickReport.hidden = false;
  founderPanel.hidden = profile?.role !== 'founder';
  moderationPanel.hidden = !['founder', 'moderator'].includes(profile?.role);
  if (!moderationPanel.hidden) loadModerationData();
  joinButton.textContent = '✓ Ya sos parte';
  joinButton.classList.add('joined');
  const reportLocality = document.querySelector('#report-locality');
  if (reportLocality && !reportLocality.value) reportLocality.value = profile?.locality || selectedLocation.name;
  if (communityReports.length) loadCommunityData();
}

async function loadCommunityData() {
  if (!client) return;
  const { data: forecast } = await client.from('forecasts').select('*').order('published_at', { ascending: false }).limit(1).maybeSingle();
  if (forecast) {
    document.querySelector('.temperature>span:first-child').textContent = `${forecast.temperature ?? '--'}°`;
    document.querySelector('.weather-copy h2').textContent = forecast.conditions;
    document.querySelector('.founder-card p').textContent = `“${forecast.summary}”`;
    document.querySelector('.founder-card small').textContent = `Actualizado ${new Date(forecast.published_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}`;
  }
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: reports } = await client.from('reports').select('*').eq('status', 'active').gte('created_at', since).order('created_at', { ascending: false }).limit(50);
  const reportIds = (reports || []).map((report) => report.id);
  let confirmations = [];
  if (reportIds.length) {
    const confirmationResult = await client.from('report_confirmations').select('report_id,user_id').in('report_id', reportIds);
    confirmationsAvailable = !confirmationResult.error;
    confirmations = confirmationResult.data || [];
  }
  const { data: { user } } = await client.auth.getUser();
  const enrichedReports = (reports || []).map((report) => ({
    ...report,
    confirmation_count: confirmations.filter((item) => item.report_id === report.id).length,
    confirmed_by_me: Boolean(user && confirmations.some((item) => item.report_id === report.id && item.user_id === user.id))
  }));
  const authorIds = [...new Set(enrichedReports.map((report) => report.user_id))];
  let profiles = [];
  if (authorIds.length) {
    const profileResult = await client.from('profiles').select('id,display_name,locality,created_at').in('id', authorIds);
    profiles = profileResult.data || [];
  }
  enrichedReports.forEach((report) => {
    const author = profiles.find((profile) => profile.id === report.user_id);
    report.author_name = author?.display_name || 'Miembro de PulsoClima';
  });
  if (reports?.length) {
    const icons = { Lluvia: '🌧️', Viento: '💨', Granizo: '🧊', Niebla: '🌫️', Calor: '☀️', Otro: '🌤️' };
    document.querySelector('.reports').innerHTML = enrichedReports.slice(0, 3).map((report) => `<article class="report-card">${report.photo_path ? `<img class="report-photo" src="${reportPhotoUrl(report.photo_path)}" alt="Foto del reporte: ${escapeHtml(report.title)}" loading="lazy">` : ''}<span class="report-icon">${icons[report.category] || '🌤️'}</span><div><strong>${escapeHtml(report.title)}</strong><p>${escapeHtml(report.locality)}</p><span class="report-author">Por ${escapeHtml(report.author_name)}</span><small>${new Date(report.created_at).toLocaleString('es-AR')}</small>${reportActions(report)}</div></article>`).join('');
  } else {
    document.querySelector('.reports').innerHTML = `<article class="report-card empty-report"><span class="report-icon">🌤️</span><div><strong>Todavía no hay reportes comunitarios</strong><p>El primer reporte real publicado aparecerá acá y en el mapa.</p></div></article>`;
  }
  communityReports = await addMissingCoordinates(enrichedReports);
  renderCommunityMap();
  loadRealStats();
  loadLeaderboard();
}

function confirmationButton(report, map = false) {
  if (!confirmationsAvailable) return '';
  const ownReport = activeSession?.user?.id === report.user_id;
  const label = report.confirmed_by_me ? `✓ Confirmado · ${report.confirmation_count}` : `Confirmar · ${report.confirmation_count}`;
  return `<button class="${map ? 'map-confirm' : 'confirm-button'}${report.confirmed_by_me ? ' confirmed' : ''}" data-confirm-report="${report.id}" ${ownReport ? 'disabled title="No podés confirmar tu propio reporte"' : ''}>${label}</button>`;
}

function reportActions(report, map = false) {
  const ownReport = activeSession?.user?.id === report.user_id;
  return `<div class="report-actions">${confirmationButton(report, map)}${ownReport ? '' : `<button class="${map ? 'map-confirm' : 'flag-button'}" data-flag-report="${report.id}">⚑ Denunciar</button>`}</div>`;
}

function reputationBadge(points, confirmations) {
  if (points >= 25 && confirmations >= 10) return '🏅 Fuente confiable';
  if (points >= 8) return '🌦️ Observador frecuente';
  return '🌱 Nuevo observador';
}

function initials(name) {
  return String(name || 'PC').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

async function loadLeaderboard() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: reports, error } = await client.from('reports').select('id,user_id').eq('status', 'active').gte('created_at', since).limit(500);
  if (error || !reports?.length) {
    leaderboardRows = [];
    document.querySelector('#ranking-list').innerHTML = '<p class="ranking-empty">Todavía no hay actividad suficiente para formar el ranking.</p>';
    return;
  }
  const ids = reports.map((report) => report.id);
  const users = [...new Set(reports.map((report) => report.user_id))];
  const [confirmationResult, profileResult] = await Promise.all([
    client.from('report_confirmations').select('report_id').in('report_id', ids),
    client.from('profiles').select('id,display_name,locality,created_at').in('id', users)
  ]);
  const confirmations = confirmationResult.data || [];
  const receivedByUser = new Map();
  confirmations.forEach((confirmation) => {
    const report = reports.find((item) => item.id === confirmation.report_id);
    if (report) receivedByUser.set(report.user_id, (receivedByUser.get(report.user_id) || 0) + 1);
  });
  leaderboardRows = (profileResult.data || []).map((profile) => {
    const reportCount = reports.filter((report) => report.user_id === profile.id).length;
    const confirmationCount = receivedByUser.get(profile.id) || 0;
    return { ...profile, reportCount, confirmationCount, points: reportCount * 2 + confirmationCount };
  }).sort((a, b) => b.points - a.points || b.confirmationCount - a.confirmationCount).slice(0, 5);
  document.querySelector('#ranking-list').innerHTML = leaderboardRows.map((row, index) => `<div class="ranking-row"><span class="ranking-position">${index + 1}</span><span class="ranking-avatar">${escapeHtml(initials(row.display_name))}</span><div><strong>${escapeHtml(row.display_name)}</strong><small>${escapeHtml(row.locality || 'Localidad no indicada')} · ${reputationBadge(row.points, row.confirmationCount)}</small></div><span class="ranking-points">${row.points} pts<small>${row.reportCount} reportes</small></span></div>`).join('');
}

async function loadRealStats() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const [membersResult, reportsResult] = await Promise.all([
    client.from('profiles').select('*', { count: 'exact', head: true }),
    client.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'active').gte('created_at', startOfToday.toISOString())
  ]);
  const format = new Intl.NumberFormat('es-AR');
  document.querySelector('#member-count').textContent = membersResult.error ? '—' : format.format(membersResult.count || 0);
  document.querySelector('#today-report-count').textContent = reportsResult.error ? '—' : format.format(reportsResult.count || 0);
}

async function loadModerationData() {
  const list = document.querySelector('#moderation-list');
  list.innerHTML = '<p class="moderation-empty">Buscando denuncias pendientes…</p>';
  const { data: flags, error } = await client.from('report_flags').select('report_id,user_id,reason,created_at').order('created_at', { ascending: false }).limit(100);
  if (error) { list.innerHTML = '<p class="moderation-empty">Actualizá la base de datos con el archivo SQL incluido para habilitar la moderación.</p>'; return; }
  if (!flags?.length) { list.innerHTML = '<p class="moderation-empty">✅ No hay denuncias pendientes.</p>'; return; }
  const reportIds = [...new Set(flags.map((flag) => flag.report_id))];
  const { data: reports } = await client.from('reports').select('*').in('id', reportIds);
  const authorIds = [...new Set((reports || []).map((report) => report.user_id))];
  let profiles = [];
  if (authorIds.length) {
    const result = await client.from('profiles').select('id,display_name').in('id', authorIds);
    profiles = result.data || [];
  }
  list.innerHTML = (reports || []).map((report) => {
    const reportFlags = flags.filter((flag) => flag.report_id === report.id);
    const reasons = [...new Set(reportFlags.map((flag) => flag.reason))].join(' · ');
    const author = profiles.find((profile) => profile.id === report.user_id)?.display_name || 'Miembro';
    const media = report.photo_path ? `<img class="moderation-photo" src="${reportPhotoUrl(report.photo_path)}" alt="Foto denunciada">` : '<span class="moderation-photo moderation-placeholder">🌦️</span>';
    return `<article class="moderation-item">${media}<div><strong>${escapeHtml(report.title)}</strong><p>${escapeHtml(report.locality)} · Por ${escapeHtml(author)}</p><small>${reportFlags.length} ${reportFlags.length === 1 ? 'denuncia' : 'denuncias'}: ${escapeHtml(reasons)}</small></div><div class="moderation-actions"><button class="dismiss-flags" data-moderate="dismiss" data-report-id="${report.id}">Descartar</button><button class="hide-report" data-moderate="hide" data-report-id="${report.id}">Ocultar reporte</button></div></article>`;
  }).join('');
}

function escapeHtml(value) {
  const element = document.createElement('div');
  element.textContent = value ?? '';
  return element.innerHTML;
}

function reportPhotoUrl(path) {
  if (!path) return '';
  return client.storage.from('report-photos').getPublicUrl(path).data.publicUrl;
}

async function prepareReportPhoto(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', .86));
  if (!blob) throw new Error('No se pudo preparar la fotografía');
  return new File([blob], 'reporte.jpg', { type: 'image/jpeg' });
}

function clearPhotoPreview() {
  if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
  photoPreviewUrl = '';
  document.querySelector('#report-photo').value = '';
  document.querySelector('#photo-preview').hidden = true;
  document.querySelector('#photo-preview img').removeAttribute('src');
}

function initCommunityMap() {
  if (!window.L || communityMap) return;
  communityMap = L.map('community-map', { scrollWheelZoom: false }).setView([-32.8, -66.5], 5);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(communityMap);
  reportLayer = L.layerGroup().addTo(communityMap);
}

async function addMissingCoordinates(reports) {
  const cache = JSON.parse(localStorage.getItem('pulsoclima_geocodes') || '{}');
  const localities = [...new Set(reports.filter((report) => report.latitude == null || report.longitude == null).map((report) => report.locality).filter(Boolean))].slice(0, 15);
  await Promise.all(localities.map(async (locality) => {
    if (cache[locality]) return;
    try {
      const place = await searchLocation(locality);
      cache[locality] = { latitude: place.latitude, longitude: place.longitude };
    } catch (_) { /* El reporte sigue visible en la lista aunque no pueda ubicarse. */ }
  }));
  localStorage.setItem('pulsoclima_geocodes', JSON.stringify(cache));
  return reports.map((report) => ({ ...report, ...(report.latitude != null && report.longitude != null ? {} : cache[report.locality]) }));
}

function renderCommunityMap() {
  initCommunityMap();
  if (!communityMap || !reportLayer) return;
  reportLayer.clearLayers();
  const icons = { Lluvia: '🌧️', Viento: '💨', Granizo: '🧊', Niebla: '🌫️', Calor: '☀️', Otro: '🌤️' };
  const visible = communityReports.filter((report) => (activeMapCategory === 'Todos' || report.category === activeMapCategory) && Number.isFinite(Number(report.latitude)) && Number.isFinite(Number(report.longitude)));
  visible.forEach((report) => {
    const category = icons[report.category] ? report.category : 'Otro';
    const icon = L.divIcon({ className: `weather-marker ${category.toLowerCase()}`, html: `<span>${icons[category]}</span>`, iconSize: [38, 38], iconAnchor: [19, 37], popupAnchor: [0, -34] });
    L.marker([Number(report.latitude), Number(report.longitude)], { icon }).bindPopup(`<div class="map-popup">${report.photo_path ? `<img class="map-report-photo" src="${reportPhotoUrl(report.photo_path)}" alt="Foto del reporte" loading="lazy">` : ''}<strong>${escapeHtml(report.title)}</strong><span>${escapeHtml(report.locality)}</span><span class="report-author">Por ${escapeHtml(report.author_name)}</span><small>${new Date(report.created_at).toLocaleString('es-AR')}</small>${reportActions(report, true)}</div>`).addTo(reportLayer);
  });
  document.querySelector('#map-count').textContent = `${visible.length} ${visible.length === 1 ? 'reporte visible' : 'reportes visibles'}`;
  if (visible.length) {
    const bounds = L.latLngBounds(visible.map((report) => [Number(report.latitude), Number(report.longitude)]));
    communityMap.fitBounds(bounds.pad(.2), { maxZoom: 10 });
  } else {
    communityMap.setView([selectedLocation.latitude, selectedLocation.longitude], 8);
    document.querySelector('#map-count').textContent = activeMapCategory === 'Todos' ? 'Todavía no hay reportes publicados' : `No hay reportes de ${activeMapCategory.toLowerCase()}`;
  }
}

const weatherCodes = {
  0: ['Despejado', '☀️'], 1: ['Mayormente despejado', '🌤️'], 2: ['Parcialmente nublado', '⛅'], 3: ['Nublado', '☁️'],
  45: ['Niebla', '🌫️'], 48: ['Niebla con escarcha', '🌫️'], 51: ['Llovizna leve', '🌦️'], 53: ['Llovizna', '🌦️'],
  55: ['Llovizna intensa', '🌧️'], 61: ['Lluvia leve', '🌦️'], 63: ['Lluvia', '🌧️'], 65: ['Lluvia intensa', '🌧️'],
  71: ['Nevada leve', '🌨️'], 73: ['Nevada', '🌨️'], 75: ['Nevada intensa', '🌨️'], 80: ['Chaparrones leves', '🌦️'],
  81: ['Chaparrones', '🌧️'], 82: ['Chaparrones intensos', '⛈️'], 95: ['Tormenta', '⛈️'], 96: ['Tormenta con granizo', '⛈️'], 99: ['Tormenta fuerte con granizo', '⛈️']
};

function weatherLabel(code, isDay = 1) {
  const result = weatherCodes[code] || ['Condiciones variables', '🌤️'];
  if (!isDay && code <= 1) return [code === 0 ? 'Despejado' : 'Mayormente despejado', '🌙'];
  return result;
}

function updatePreventiveAlert(weather) {
  const current = weather.current;
  const maxTemperature = Math.max(...weather.daily.temperature_2m_max);
  const minTemperature = Math.min(...weather.daily.temperature_2m_min);
  const rainChance = Math.max(...(weather.daily.precipitation_probability_max || [0]));
  const gust = current.wind_gusts_10m || 0;
  const storm = weather.daily.weather_code.some((code) => code >= 95);
  let level = 'none';
  let title = 'Sin fenómenos relevantes';
  let copy = 'Las condiciones previstas no muestran señales destacadas para las próximas horas.';
  let symbol = '✓';

  if (gust >= 80 || maxTemperature >= 40) {
    level = 'red'; symbol = '!';
    title = gust >= 80 ? 'Ráfagas muy intensas previstas' : 'Temperaturas extremadamente altas';
    copy = gust >= 80 ? `Se estiman ráfagas cercanas a ${Math.round(gust)} km/h. Evitá actividades al aire libre y asegurá objetos sueltos.` : `La máxima prevista alcanza ${Math.round(maxTemperature)}°. Hidratate y evitá la exposición en las horas centrales.`;
  } else if (gust >= 60 || storm || rainChance >= 80) {
    level = 'orange'; symbol = '!';
    title = gust >= 60 ? 'Viento fuerte previsto' : storm ? 'Posibles tormentas' : 'Alta probabilidad de precipitaciones';
    copy = gust >= 60 ? `Podrían registrarse ráfagas de hasta ${Math.round(gust)} km/h.` : storm ? 'El pronóstico automático detecta condiciones compatibles con tormentas.' : `La probabilidad máxima de lluvia alcanza el ${Math.round(rainChance)}%.`;
  } else if (gust >= 40 || maxTemperature >= 35 || minTemperature <= 0 || rainChance >= 60) {
    level = 'yellow'; symbol = '!';
    if (gust >= 40) { title = 'Atención por viento'; copy = `Se esperan ráfagas cercanas a ${Math.round(gust)} km/h.`; }
    else if (maxTemperature >= 35) { title = 'Jornada calurosa'; copy = `La máxima prevista alcanza ${Math.round(maxTemperature)}°. Recordá hidratarte.`; }
    else if (minTemperature <= 0) { title = 'Posibles heladas'; copy = `La mínima prevista desciende hasta ${Math.round(minTemperature)}°.`; }
    else { title = 'Posibles precipitaciones'; copy = `La probabilidad máxima de lluvia alcanza el ${Math.round(rainChance)}%.`; }
  }

  const alert = document.querySelector('#weather-alert');
  alert.dataset.level = level;
  alert.querySelector('.alert-symbol').textContent = symbol;
  document.querySelector('#alert-title').textContent = title;
  document.querySelector('#alert-copy').textContent = copy;
}

async function loadAutomaticWeather(location = selectedLocation) {
  const params = new URLSearchParams({
    latitude: location.latitude,
    longitude: location.longitude,
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,wind_gusts_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'auto',
    forecast_days: '5'
  });
  const endpoint = `https://api.open-meteo.com/v1/forecast?${params}`;
  try {
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error('Datos meteorológicos no disponibles');
    const weather = await response.json();
    const [description, icon] = weatherLabel(weather.current.weather_code, weather.current.is_day);
    document.querySelector('.temperature>span:first-child').textContent = `${Math.round(weather.current.temperature_2m)}°`;
    document.querySelector('.weather-icon').textContent = icon;
    document.querySelector('.weather-copy h2').textContent = description;
    document.querySelector('.location').innerHTML = `<span>●</span> ${escapeHtml(location.name)}`;
    document.querySelector('.weather-copy>p').textContent = `Sensación térmica ${Math.round(weather.current.apparent_temperature)}° · Humedad ${weather.current.relative_humidity_2m}% · Viento ${Math.round(weather.current.wind_speed_10m)} km/h`;

    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    document.querySelectorAll('.forecast-day').forEach((element, index) => {
      if (!weather.daily.time[index]) return;
      const date = new Date(`${weather.daily.time[index]}T12:00:00`);
      const [, dayIcon] = weatherLabel(weather.daily.weather_code[index]);
      element.querySelector('strong').textContent = index === 0 ? 'Hoy' : dayNames[date.getDay()];
      element.querySelector('.day-icon').textContent = dayIcon;
      element.querySelector('span:last-child').innerHTML = `${Math.round(weather.daily.temperature_2m_max[index])}° <small>${Math.round(weather.daily.temperature_2m_min[index])}°</small>`;
    });
    updatePreventiveAlert(weather);
    locationInput.value = location.name;
    locationStatus.textContent = `Pronóstico actualizado para ${location.name}.`;
    const reportLocality = document.querySelector('#report-locality');
    if (reportLocality && !reportLocality.value) reportLocality.value = location.name;
  } catch (error) {
    console.warn('PulsoClima conserva el último pronóstico disponible.', error);
    locationStatus.textContent = 'No pudimos actualizar el pronóstico. Intentá nuevamente.';
  }
}

async function searchLocation(query) {
  const endpoint = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=es&format=json`;
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error('No se pudo buscar la localidad');
  const data = await response.json();
  const place = data.results?.[0];
  if (!place) throw new Error('No encontramos esa localidad');
  return {
    name: [place.name, place.admin1, place.country].filter(Boolean).filter((value, index, list) => list.indexOf(value) === index).join(', '),
    latitude: place.latitude,
    longitude: place.longitude
  };
}

locationForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  locationStatus.textContent = 'Buscando localidad…';
  try {
    selectedLocation = await searchLocation(locationInput.value.trim());
    localStorage.setItem('pulsoclima_location', JSON.stringify(selectedLocation));
    await loadAutomaticWeather(selectedLocation);
  } catch (error) {
    locationStatus.textContent = `${error.message}. Probá agregando la provincia o el país.`;
  }
});

document.querySelector('#use-location').addEventListener('click', () => {
  if (!navigator.geolocation) return showMessage('Tu navegador no permite usar la ubicación.');
  locationStatus.textContent = 'Obteniendo tu ubicación…';
  navigator.geolocation.getCurrentPosition(async ({ coords }) => {
    selectedLocation = { name: 'Tu ubicación actual', latitude: coords.latitude, longitude: coords.longitude };
    localStorage.setItem('pulsoclima_location', JSON.stringify(selectedLocation));
    await loadAutomaticWeather(selectedLocation);
  }, () => { locationStatus.textContent = 'No pudimos acceder a tu ubicación. Podés buscarla escribiendo su nombre.'; }, { enableHighAccuracy: false, timeout: 10000 });
});

document.querySelector('#map-filters').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-category]');
  if (!button) return;
  activeMapCategory = button.dataset.category;
  document.querySelectorAll('#map-filters button').forEach((item) => item.classList.toggle('active', item === button));
  renderCommunityMap();
});

document.querySelector('#refresh-moderation').addEventListener('click', loadModerationData);
document.querySelector('#moderation-list').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-moderate]');
  if (!button) return;
  const action = button.dataset.moderate;
  const reportId = Number(button.dataset.reportId);
  if (action === 'hide' && !confirm('¿Ocultar este reporte de la comunidad? Podrás conservarlo para revisión.')) return;
  button.disabled = true;
  const { error } = await client.rpc('moderate_report', { p_report_id: reportId, p_action: action, p_reason: action === 'hide' ? 'Contenido denunciado y revisado' : null });
  if (error) { button.disabled = false; return showMessage('No se pudo moderar. Ejecutá el archivo SQL actualizado.'); }
  showMessage(action === 'hide' ? 'Reporte ocultado' : 'Denuncias descartadas');
  await loadModerationData();
  loadCommunityData();
});

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-confirm-report]');
  if (!button || button.disabled) return;
  if (!activeSession?.user) return openAuth('login');
  const reportId = Number(button.dataset.confirmReport);
  const report = communityReports.find((item) => item.id === reportId);
  if (!report) return;
  if (report.user_id === activeSession.user.id) return showMessage('No podés confirmar tu propio reporte.');
  button.disabled = true;
  const query = client.from('report_confirmations');
  const { error } = report.confirmed_by_me
    ? await query.delete().eq('report_id', reportId).eq('user_id', activeSession.user.id)
    : await query.insert({ report_id: reportId, user_id: activeSession.user.id });
  if (error) { button.disabled = false; return showMessage('Primero actualizá la base de datos con el archivo SQL incluido.'); }
  showMessage(report.confirmed_by_me ? 'Confirmación retirada' : 'Reporte confirmado');
  loadCommunityData();
});

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-flag-report]');
  if (!button) return;
  if (!activeSession?.user) return openAuth('login');
  const reportId = Number(button.dataset.flagReport);
  const report = communityReports.find((item) => item.id === reportId);
  if (!report || report.user_id === activeSession.user.id) return showMessage('No podés denunciar tu propio reporte.');
  document.querySelector('#flag-form [name="report_id"]').value = reportId;
  document.querySelector('#flag-status').textContent = '';
  document.querySelector('#flag-dialog').showModal();
});

document.querySelector('#login-open').addEventListener('click', () => openAuth('login'));
document.querySelector('#signup-open').addEventListener('click', () => openAuth('signup'));
document.querySelector('#dialog-close').addEventListener('click', () => authDialog.close());
document.querySelector('#auth-switch').addEventListener('click', () => setAuthMode(authMode === 'login' ? 'signup' : 'login'));
document.querySelectorAll('[data-message]').forEach((button) => button.addEventListener('click', () => showMessage(button.dataset.message)));
document.querySelector('#main-report-button').addEventListener('click', () => {
  if (!activeSession?.user) return openAuth('login');
  quickReport.scrollIntoView({ behavior: 'smooth', block: 'center' });
  document.querySelector('#report-form input[name="title"]').focus();
});
joinButton.addEventListener('click', () => {
  if (!activeSession?.user) return openAuth('signup');
  showMessage('¡Ya sos parte de PulsoClima!');
});

function openProfileDialog() {
  if (!activeProfile) return;
  const stats = leaderboardRows.find((row) => row.id === activeProfile.id) || { reportCount: 0, confirmationCount: 0, points: 0 };
  const joined = activeProfile.created_at ? new Date(activeProfile.created_at).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }) : 'recientemente';
  document.querySelector('#profile-content').innerHTML = `<div class="profile-hero"><div class="profile-avatar">${escapeHtml(initials(activeProfile.display_name))}</div><h2>${escapeHtml(activeProfile.display_name)}</h2><p>${escapeHtml(activeProfile.locality || 'Localidad no indicada')} · Miembro desde ${joined}</p><span class="profile-badge">${reputationBadge(stats.points, stats.confirmationCount)}</span></div><div class="profile-stats"><div><strong>${stats.reportCount}</strong><span>REPORTES 30 DÍAS</span></div><div><strong>${stats.confirmationCount}</strong><span>CONFIRMACIONES</span></div><div><strong>${stats.points}</strong><span>PUNTOS</span></div></div>`;
  document.querySelector('#profile-dialog').showModal();
}

userChip.addEventListener('click', openProfileDialog);
document.querySelector('#signout-button').addEventListener('click', async () => { document.querySelector('#profile-dialog').close(); await client.auth.signOut(); showMessage('Sesión cerrada'); });
document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => document.querySelector(`#${button.dataset.closeDialog}`).close()));

document.querySelector('#flag-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  const status = document.querySelector('#flag-status');
  status.textContent = 'Enviando…';
  const { error } = await client.from('report_flags').insert({ report_id: Number(values.report_id), user_id: activeSession.user.id, reason: values.reason });
  if (error) { status.textContent = error.code === '23505' ? 'Ya denunciaste este reporte.' : 'No se pudo enviar. Actualizá la base de datos con el archivo SQL incluido.'; return; }
  status.textContent = 'Denuncia enviada. Gracias por ayudar a cuidar la comunidad.';
  window.setTimeout(() => document.querySelector('#flag-dialog').close(), 900);
});

document.querySelector('#report-photo').addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (!file) return clearPhotoPreview();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { clearPhotoPreview(); return showMessage('Elegí una imagen JPG, PNG o WebP.'); }
  if (file.size > 5 * 1024 * 1024) { clearPhotoPreview(); return showMessage('La fotografía no puede superar los 5 MB.'); }
  if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
  photoPreviewUrl = URL.createObjectURL(file);
  document.querySelector('#photo-preview img').src = photoPreviewUrl;
  document.querySelector('#photo-preview').hidden = false;
});
document.querySelector('#remove-photo').addEventListener('click', clearPhotoPreview);

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  authStatus.textContent = 'Procesando…';
  const values = Object.fromEntries(new FormData(authForm));
  const result = authMode === 'signup'
    ? await client.auth.signUp({ email: values.email, password: values.password, options: { data: { display_name: values.name, locality: values.locality, country: 'Argentina' }, emailRedirectTo: window.location.href } })
    : await client.auth.signInWithPassword({ email: values.email, password: values.password });
  if (result.error) { authStatus.textContent = result.error.message; return; }
  authStatus.textContent = authMode === 'signup' && !result.data.session ? 'Revisá tu correo para confirmar la cuenta.' : '¡Listo! Ya ingresaste.';
  if (result.data.session) window.setTimeout(() => authDialog.close(), 700);
});

document.querySelector('#report-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  const { data: { user } } = await client.auth.getUser();
  if (!user) return openAuth('login');
  const originalPhoto = values.photo instanceof File && values.photo.size ? values.photo : null;
  if (originalPhoto && (!['image/jpeg', 'image/png', 'image/webp'].includes(originalPhoto.type) || originalPhoto.size > 5 * 1024 * 1024)) return showMessage('Revisá el formato o tamaño de la fotografía.');
  let coordinates = {};
  try {
    const place = await searchLocation(values.locality);
    coordinates = { latitude: place.latitude, longitude: place.longitude };
  } catch (_) { /* Se publica igualmente y podrá localizarse más adelante. */ }
  let photoPath = null;
  if (originalPhoto) {
    try {
      const photo = await prepareReportPhoto(originalPhoto);
      photoPath = `${user.id}/${Date.now()}-${crypto.randomUUID()}.jpg`;
      const { error: uploadError } = await client.storage.from('report-photos').upload(photoPath, photo, { contentType: 'image/jpeg', upsert: false });
      if (uploadError) throw uploadError;
    } catch (error) {
      return showMessage('No se pudo subir la foto. Ejecutá el archivo SQL actualizado y volvé a intentar.');
    }
  }
  const reportData = { user_id: user.id, category: values.category, title: values.title, locality: values.locality, country: 'Argentina', ...(photoPath ? { photo_path: photoPath } : {}) };
  let { error } = await client.from('reports').insert({ ...reportData, ...coordinates });
  if (error && Object.keys(coordinates).length) ({ error } = await client.from('reports').insert(reportData));
  if (error) {
    if (photoPath) await client.storage.from('report-photos').remove([photoPath]);
    return showMessage(`No se pudo publicar: ${error.message}`);
  }
  form.reset(); clearPhotoPreview(); showMessage('Reporte publicado'); loadCommunityData();
});

document.querySelector('#forecast-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  const { data: { user } } = await client.auth.getUser();
  if (!user) return openAuth('login');
  const { error } = await client.rpc('publish_forecast', { p_conditions: values.conditions, p_temperature: Number(values.temperature), p_summary: values.summary });
  if (error) return showMessage(`No se pudo publicar: ${error.message}`);
  form.reset(); showMessage('Pronóstico oficial publicado'); loadCommunityData();
});

client.auth.onAuthStateChange((_event, session) => updateSession(session));
client.auth.getSession().then(({ data }) => updateSession(data.session));
initCommunityMap();
loadCommunityData().finally(() => loadAutomaticWeather(selectedLocation));
window.setInterval(() => loadAutomaticWeather(selectedLocation), 15 * 60 * 1000);
