const AUTH_STORAGE_KEY = 'adminFirebaseSession';

let currentSession = null;

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function durationLabel(minutes) {
  const total = Number(minutes || 0);
  if (!Number.isFinite(total) || total <= 0) return '-';
  if (total < 60) return `${total}min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}

function initials(name) {
  return String(name || 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'U';
}

function buildAvatarDataUri(name) {
  const text = encodeURIComponent(initials(name));
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><rect width='100%' height='100%' rx='40' fill='#0f172a'/><text x='50%' y='55%' dominant-baseline='middle' text-anchor='middle' font-family='Segoe UI, Arial, sans-serif' font-size='30' font-weight='700' fill='#f8fafc'>${text}</text></svg>`;
  return `data:image/svg+xml;utf8,${svg}`;
}

function applyProfileAvatar(profile) {
  const avatar = document.getElementById('profileAvatar');
  if (!avatar) return;
  const name = String(profile?.displayName || profile?.email || 'U').trim();
  const photoUrl = String(profile?.photoUrl || '').trim();
  avatar.src = photoUrl || buildAvatarDataUri(name);
}

function getStoredSession() {
  const localRaw = localStorage.getItem(AUTH_STORAGE_KEY);
  if (localRaw) {
    try {
      return { data: JSON.parse(localRaw), storage: localStorage };
    } catch {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }

  const sessionRaw = sessionStorage.getItem(AUTH_STORAGE_KEY);
  if (sessionRaw) {
    try {
      return { data: JSON.parse(sessionRaw), storage: sessionStorage };
    } catch {
      sessionStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }

  return null;
}

function saveStoredSession(session, storage) {
  storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

function setFeedback(message, isError = false) {
  const el = document.getElementById('profileFeedback');
  if (!el) return;
  el.textContent = message || '';
  el.classList.toggle('error', Boolean(isError));
}

function isAdminRole(value) {
  if (value === true) return true;
  if (value === 1) return true;
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'admin';
}

function renderAdminShortcut(profile) {
  const adminLink = document.getElementById('profileAdminLink');
  if (!adminLink) return;
  adminLink.hidden = !isAdminRole(profile?.isAdmin);
}

async function fetchFirebaseApiKey() {
  const res = await fetch('/api/firebase/config');
  const cfg = await res.json().catch(() => ({}));
  return String(cfg.apiKey || '');
}

async function refreshTokenIfNeeded(session, storage) {
  const expiresAt = Number(session?.expiresAt || 0);
  if (expiresAt - Date.now() > 60 * 1000) {
    return session;
  }

  const apiKey = await fetchFirebaseApiKey();
  if (!apiKey || !session?.refreshToken) {
    return session;
  }

  const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(String(session.refreshToken || ''))}`
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    return session;
  }

  const updated = {
    idToken: String(body.id_token || session.idToken || ''),
    refreshToken: String(body.refresh_token || session.refreshToken || ''),
    expiresAt: Date.now() + Number(body.expires_in || 3600) * 1000
  };

  saveStoredSession(updated, storage);
  return updated;
}

async function authFetch(url, options = {}) {
  const stored = getStoredSession();
  if (!stored?.data?.idToken) {
    throw new Error('Sessao nao encontrada. Faca login novamente.');
  }

  currentSession = await refreshTokenIfNeeded(stored.data, stored.storage);
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${currentSession.idToken}`);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, { ...options, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.message || 'Falha na operacao.');
  }

  return body;
}

function statusLabel(status) {
  const map = { confirmed: 'Confirmado', cancelled: 'Cancelado', pending: 'Pendente', done: 'Concluído' };
  return map[String(status || '')] || String(status || 'confirmed');
}

async function cancelAppointment(id, cardEl) {
  if (!confirm('Deseja cancelar este agendamento?')) return;

  const btn = cardEl.querySelector('.appt-cancel-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Cancelando...';
  }

  try {
    await authFetch(`/api/auth/appointments/${id}/cancel`, { method: 'PATCH' });
    const statusEl = cardEl.querySelector('.appt-status');
    if (statusEl) {
      statusEl.textContent = 'Cancelado';
      statusEl.classList.add('appt-status--cancelled');
    }
    if (btn) btn.remove();
    cardEl.classList.add('appointment-card--cancelled');
  } catch (error) {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Cancelar agendamento';
    }
    setFeedback(error.message || 'Erro ao cancelar agendamento.', true);
  }
}

function renderAppointments(items = []) {
  const root = document.getElementById('appointmentsList');
  if (!root) return;

  root.innerHTML = '';
  if (!items.length) {
    root.innerHTML = '<p class="muted">Voce ainda nao possui agendamentos vinculados a esta conta.</p>';
    return;
  }

  items.forEach((appt) => {
    const isCancelled = String(appt.status || '') === 'cancelled';
    const card = document.createElement('article');
    card.className = `appointment-card${isCancelled ? ' appointment-card--cancelled' : ''}`;
    card.innerHTML = `
      <div class="appointment-head">
        <strong>${appt.serviceName || 'Servico'}</strong>
        <span>${money(appt.servicePrice || 0)}</span>
      </div>
      <p><strong>Profissional:</strong> ${appt.teamName || 'Profissional'}</p>
      <p><strong>Data:</strong> ${String(appt.date || '')} às ${String(appt.time || '')}</p>
      <p><strong>Duração:</strong> ${durationLabel(appt.serviceDuration || 0)}</p>
      <p><strong>Status:</strong> <span class="appt-status${isCancelled ? ' appt-status--cancelled' : ''}">${statusLabel(appt.status)}</span></p>
      ${!isCancelled ? `<div class="appt-actions"><button class="appt-cancel-btn" type="button">Cancelar agendamento</button></div>` : ''}
    `;
    if (!isCancelled) {
      card.querySelector('.appt-cancel-btn').addEventListener('click', () => cancelAppointment(appt.id, card));
    }
    root.appendChild(card);
  });
}

async function loadProfileAndAppointments() {
  const profile = await authFetch('/api/auth/profile');
  renderAdminShortcut(profile);

  document.getElementById('profileName').value = String(profile?.displayName || '');
  document.getElementById('profileEmail').value = String(profile?.email || '');
  document.getElementById('profilePhone').value = String(profile?.phone || '');
  applyProfileAvatar(profile);

  try {
    const appts = await authFetch('/api/auth/appointments');
    renderAppointments(Array.isArray(appts?.appointments) ? appts.appointments : []);
  } catch {
    renderAppointments([]);
    const root = document.getElementById('appointmentsList');
    if (root) {
      const warn = document.createElement('p');
      warn.className = 'muted';
      warn.textContent = 'Nao foi possivel carregar seus agendamentos agora.';
      root.prepend(warn);
    }
  }
}

function hasSessionToken() {
  const stored = getStoredSession();
  return Boolean(stored?.data?.idToken);
}

function clearAllStoredSessions() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  sessionStorage.removeItem(AUTH_STORAGE_KEY);
  currentSession = null;
}

function redirectToLogin() {
  window.location.href = '/login.html';
}

async function bootstrapProfilePage() {
  if (!hasSessionToken()) {
    redirectToLogin();
    return;
  }

  try {
    await loadProfileAndAppointments();
  } catch (error) {
    const message = String(error?.message || '');
    if (/Sessao nao encontrada|Token invalido|Faca login novamente|401|403/i.test(message)) {
      redirectToLogin();
      return;
    }

    setFeedback('Nao foi possivel carregar seus dados agora.', true);
  }
}

function wireForm() {
  const form = document.getElementById('profileForm');
  const saveButton = document.getElementById('profileSaveButton');
  const logoutButton = document.getElementById('profileLogoutButton');

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const displayName = String(document.getElementById('profileName')?.value || '').trim();
    const phone = String(document.getElementById('profilePhone')?.value || '').trim();

    try {
      saveButton.disabled = true;
      setFeedback('Salvando dados...');
      await authFetch('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ displayName, phone })
      });
      applyProfileAvatar({ displayName });
      setFeedback('Perfil atualizado com sucesso.');
    } catch (error) {
      setFeedback(error.message || 'Erro ao atualizar perfil.', true);
    } finally {
      saveButton.disabled = false;
    }
  });

  logoutButton?.addEventListener('click', () => {
    clearAllStoredSessions();
    redirectToLogin();
  });
}

async function init() {
  wireForm();
  await bootstrapProfilePage();
}

init();
