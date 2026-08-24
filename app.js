const toast = document.querySelector('.toast');
const authDialog = document.querySelector('#auth-dialog');
const authForm = document.querySelector('#auth-form');
const authStatus = document.querySelector('#auth-status');
const userChip = document.querySelector('#user-chip');
const founderPanel = document.querySelector('#founder-panel');
const quickReport = document.querySelector('#quick-report');
let authMode = 'login';
let toastTimer;

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
  if (!session?.user) {
    userChip.hidden = true;
    founderPanel.hidden = true;
    quickReport.hidden = true;
    document.querySelector('#login-open').hidden = false;
    document.querySelector('#signup-open').hidden = false;
    return;
  }
  const { data: profile } = await client.from('profiles').select('*').eq('id', session.user.id).single();
  userChip.textContent = `${profile?.display_name || session.user.email} · Salir`;
  userChip.hidden = false;
  document.querySelector('#login-open').hidden = true;
  document.querySelector('#signup-open').hidden = true;
  quickReport.hidden = false;
  founderPanel.hidden = profile?.role !== 'founder';
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
  const { data: reports } = await client.from('reports').select('*').order('created_at', { ascending: false }).limit(3);
  if (reports?.length) {
    const icons = { Lluvia: '🌧️', Viento: '💨', Granizo: '🧊', Niebla: '🌫️', Calor: '☀️', Otro: '🌤️' };
    document.querySelector('.reports').innerHTML = reports.map((report) => `<article class="report-card"><span class="report-icon">${icons[report.category] || '🌤️'}</span><div><strong>${escapeHtml(report.title)}</strong><p>${escapeHtml(report.locality)}</p><small>${new Date(report.created_at).toLocaleString('es-AR')}</small></div></article>`).join('');
  }
}

function escapeHtml(value) {
  const element = document.createElement('div');
  element.textContent = value ?? '';
  return element.innerHTML;
}

document.querySelector('#login-open').addEventListener('click', () => openAuth('login'));
document.querySelector('#signup-open').addEventListener('click', () => openAuth('signup'));
document.querySelector('#dialog-close').addEventListener('click', () => authDialog.close());
document.querySelector('#auth-switch').addEventListener('click', () => setAuthMode(authMode === 'login' ? 'signup' : 'login'));
document.querySelectorAll('[data-message]').forEach((button) => button.addEventListener('click', () => showMessage(button.dataset.message)));

userChip.addEventListener('click', async () => { await client.auth.signOut(); showMessage('Sesión cerrada'); });

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
  const { error } = await client.from('reports').insert({ user_id: user.id, category: values.category, title: values.title, locality: values.locality, country: 'Argentina' });
  if (error) return showMessage(`No se pudo publicar: ${error.message}`);
  form.reset(); showMessage('Reporte publicado'); loadCommunityData();
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
loadCommunityData();
