const days = [
  { id: 0, name: 'Domingo' },
  { id: 1, name: 'Segunda-feira' },
  { id: 2, name: 'Terça-feira' },
  { id: 3, name: 'Quarta-feira' },
  { id: 4, name: 'Quinta-feira' },
  { id: 5, name: 'Sexta-feira' },
  { id: 6, name: 'Sábado' }
];

const state = {
  data: {
    settings: {},
    services: [],
    mostBooked: [],
    catalog: [],
    team: [],
    reviews: [],
    appointments: [],
    users: []
  },
  ui: {
    activeTab: 'dashboard',
    selectedDate: getLocalIsoDate(),
    dashboardMemberId: 'all',
    selectedMemberId: 'all',
    selectedScheduleMemberId: '',
    selectedScheduleNoGap: true,
    financeMemberId: 'all',
    financeAnchorDate: getLocalIsoDate(),
    financeChartRange: 'day',
    serviceCategoryFilter: 'all',
    searchQuery: '',
    sidebarOpen: false,
    lastProfitKey: null
  }
};

let appointmentsPollTimer = null;
const AUTH_STORAGE_KEY = 'adminFirebaseSession';
const authState = {
  enabled: false,
  apiKey: '',
  idToken: '',
  refreshToken: '',
  expiresAt: 0,
  panelReady: false
};

function normalizeScheduleNoGap(value) {
  return String(value || '').toLowerCase() !== 'fixed';
}

function updateScheduleStepToggle() {
  const button = document.getElementById('scheduleStepToggle');
  if (!button) return;
  button.textContent = `Sem horas vagas: ${state.ui.selectedScheduleNoGap ? 'ON' : 'OFF'}`;
}

function getNotificationAppointments() {
  return getFilteredAppointments({ startDate: state.ui.selectedDate, endDate: state.ui.selectedDate })
    .slice()
    .sort(sortAppointments);
}

function closeNotificationsPanel() {
  const panel = document.getElementById('notificationsPanel');
  const toggle = document.getElementById('notificationsToggle');
  if (panel) panel.hidden = true;
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
}

function openNotificationsPanel() {
  const panel = document.getElementById('notificationsPanel');
  const toggle = document.getElementById('notificationsToggle');
  if (!panel || !toggle) return;
  renderNotificationsPanel();
  panel.hidden = false;
  toggle.setAttribute('aria-expanded', 'true');
}

function toggleNotificationsPanel() {
  const panel = document.getElementById('notificationsPanel');
  if (!panel) return;
  if (panel.hidden) {
    openNotificationsPanel();
    return;
  }
  closeNotificationsPanel();
}

function renderNotificationsPanel() {
  const list = document.getElementById('notificationsList');
  const dateLabel = document.getElementById('notificationsDateLabel');
  if (!list || !dateLabel) return;

  const appointments = getNotificationAppointments();
  dateLabel.textContent = formatWeekday(state.ui.selectedDate);

  if (!appointments.length) {
    list.innerHTML = '<div class="notifications-empty">Nenhum agendamento para este dia.</div>';
    return;
  }

  list.innerHTML = appointments
    .map((appointment) => `
      <article class="notification-item">
        <div class="notification-item__top">
          <span class="notification-item__time">${appointment.time || '--:--'}</span>
          <span class="status-badge status-${normalizeText(getAppointmentStatus(appointment))} notification-item__status">${statusLabel(getAppointmentStatus(appointment))}</span>
        </div>
        <div class="notification-item__client">${appointment.clientName || 'Cliente'}</div>
        <div class="notification-item__meta">
          <span>Serviço: ${byName(state.data.services, appointment.serviceId, 'Serviço removido')}</span>
          <span>Profissional: ${byName(state.data.team, appointment.teamId, 'Sem profissional')}</span>
        </div>
      </article>
    `)
    .join('');
}

function getLocalIsoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseIsoDate(value) {
  return new Date(`${value}T00:00:00`);
}

function shiftIsoDate(value, deltaDays) {
  const date = parseIsoDate(value);
  date.setDate(date.getDate() + deltaDays);
  return getLocalIsoDate(date);
}

function formatDate(value) {
  if (!value) return '-';
  return parseIsoDate(value).toLocaleDateString('pt-BR');
}

function formatWeekday(value) {
  if (!value) return '-';
  return parseIsoDate(value).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
}

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function compactNumber(value) {
  return Number(value || 0).toLocaleString('pt-BR');
}

function toCents(value) {
  return Math.round(Number(value || 0) * 100);
}

function fromCents(value) {
  return Number(value || 0) / 100;
}

function moneyFromCents(value) {
  return money(fromCents(value));
}

function durationLabel(minutes) {
  const total = Number(minutes || 0);
  if (!Number.isFinite(total) || total <= 0) return '-';
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return mins ? `${hours}h ${mins}min` : `${hours}h`;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function matchesSearch(...values) {
  const query = normalizeText(state.ui.searchQuery);
  if (!query) return true;
  return normalizeText(values.join(' ')).includes(query);
}

function lockAdminUi() {
  document.body.classList.add('admin-auth-locked');
}

function unlockAdminUi() {
  document.body.classList.remove('admin-auth-locked');
}

function setAuthFeedback(message, isError = false) {
  const el = document.getElementById('adminLoginFeedback');
  if (!el) return;
  el.textContent = message || '';
  el.classList.toggle('error', Boolean(isError));
}

function saveAuthSession() {
  if (!authState.enabled) return;
  const payload = {
    idToken: authState.idToken,
    refreshToken: authState.refreshToken,
    expiresAt: authState.expiresAt
  };
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
}

function clearAuthSession() {
  authState.idToken = '';
  authState.refreshToken = '';
  authState.expiresAt = 0;
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

function loadAuthSession() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    authState.idToken = parsed.idToken || '';
    authState.refreshToken = parsed.refreshToken || '';
    authState.expiresAt = Number(parsed.expiresAt || 0);
  } catch {
    clearAuthSession();
  }
}

async function fetchFirebaseConfig() {
  const response = await fetch('/api/firebase/config');
  const config = await response.json().catch(() => ({}));
  authState.enabled = Boolean(config.authEnabled && config.apiKey);
  authState.apiKey = String(config.apiKey || '');
}

async function signInWithFirebase(email, password) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${authState.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    }
  );

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error?.message || 'Falha ao autenticar no Firebase.';
    throw new Error(message.replace(/_/g, ' '));
  }

  authState.idToken = String(body.idToken || '');
  authState.refreshToken = String(body.refreshToken || '');
  authState.expiresAt = Date.now() + Number(body.expiresIn || 3600) * 1000;
  saveAuthSession();
}

async function refreshFirebaseToken() {
  if (!authState.refreshToken) {
    throw new Error('Sessao expirada. Faca login novamente.');
  }

  const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${authState.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(authState.refreshToken)}`
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error('Nao foi possivel renovar a sessao.');
  }

  authState.idToken = String(body.id_token || '');
  authState.refreshToken = String(body.refresh_token || authState.refreshToken || '');
  authState.expiresAt = Date.now() + Number(body.expires_in || 3600) * 1000;
  saveAuthSession();
}

async function ensureAuthToken() {
  if (!authState.enabled) return '';
  if (!authState.idToken) {
    throw new Error('Login necessario para acessar o admin.');
  }

  const hasBufferTime = authState.expiresAt - Date.now() > 60 * 1000;
  if (hasBufferTime) {
    return authState.idToken;
  }

  await refreshFirebaseToken();
  return authState.idToken;
}

async function api(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (authState.enabled) {
    const token = await ensureAuthToken();
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, {
    ...options,
    headers
  });

  if (res.status === 401 && authState.enabled) {
    clearAuthSession();
    lockAdminUi();
    throw new Error('Sessao expirada. Faca login novamente.');
  }

  if (res.status === 204) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || 'Erro na API');
  return body;
}

function formToJson(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function byId(arr, id) {
  return arr.find((item) => item.id === id) || null;
}

function byName(arr, id, fallback = '-') {
  return byId(arr, id)?.name || fallback;
}

function setFeedback(id, text, isError = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('error', Boolean(isError));
}

function initials(name) {
  const letters = String(name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
  return letters.toUpperCase() || '?';
}

function getSafePhotoUrl(value) {
  const raw = String(value || '').trim();
  if (!raw || raw === 'null' || raw === 'undefined' || raw === '[object Object]') {
    return '';
  }
  if (/^data:image\//i.test(raw) || /^blob:/i.test(raw)) {
    return raw;
  }
  try {
    const parsed = new URL(raw, window.location.origin);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
  } catch {
    return '';
  }
  return '';
}

function applyAvatar(el, name, photoUrl) {
  if (!el) return;
  const safePhoto = getSafePhotoUrl(photoUrl);
  if (safePhoto) {
    el.textContent = '';
    el.style.backgroundImage = `url("${safePhoto}")`;
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
    el.style.backgroundRepeat = 'no-repeat';
    return;
  }

  el.style.backgroundImage = '';
  el.textContent = initials(name || 'A');
}

function parseDurationInput(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return NaN;
  if (/^\d+$/.test(text)) return Number(text);
  const compact = text.replace(/\s+/g, '');
  const hourOnly = compact.match(/^(\d+)h$/);
  const hourAndMinute = compact.match(/^(\d+)h(\d+)(?:m(?:in)?)?$/);
  const minuteOnly = compact.match(/^(\d+)m(?:in)?$/);
  if (hourAndMinute) return Number(hourAndMinute[1] || 0) * 60 + Number(hourAndMinute[2] || 0);
  if (hourOnly) return Number(hourOnly[1] || 0) * 60;
  if (minuteOnly) return Number(minuteOnly[1] || 0);
  return NaN;
}

async function fileToCompressedBase64(file, maxSize = 1280, quality = 0.72) {
  const imageUrl = URL.createObjectURL(file);
  const image = new Image();
  image.src = imageUrl;
  await image.decode();

  const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));

  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  let dataUrl = canvas.toDataURL('image/webp', quality);
  if (!dataUrl.startsWith('data:image/webp')) {
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }

  URL.revokeObjectURL(imageUrl);
  return dataUrl;
}

function buildScheduleRows(schedule = {}) {
  const tbody = document.querySelector('#scheduleTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  for (const day of days) {
    const ranges = schedule[day.id] || [];
    const first = ranges[0] || {};
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${day.name}</td>
      <td><input type="checkbox" data-day="${day.id}" data-type="enabled" ${ranges.length ? 'checked' : ''} /></td>
      <td><input type="time" data-day="${day.id}" data-type="start" value="${first.start || '09:00'}" /></td>
      <td><input type="time" data-day="${day.id}" data-type="end" value="${first.end || '18:00'}" /></td>
    `;
    tbody.appendChild(tr);
    syncScheduleRowState(day.id);
  }
}

function syncScheduleRowState(dayId) {
  const enabledInput = document.querySelector(`[data-day="${dayId}"][data-type="enabled"]`);
  const startInput = document.querySelector(`[data-day="${dayId}"][data-type="start"]`);
  const endInput = document.querySelector(`[data-day="${dayId}"][data-type="end"]`);
  const enabled = Boolean(enabledInput?.checked);

  if (startInput) startInput.disabled = !enabled;
  if (endInput) endInput.disabled = !enabled;
}

function readScheduleFromTable() {
  const schedule = {};
  for (const day of days) {
    const enabled = document.querySelector(`[data-day="${day.id}"][data-type="enabled"]`)?.checked;
    const start = document.querySelector(`[data-day="${day.id}"][data-type="start"]`)?.value || '09:00';
    const end = document.querySelector(`[data-day="${day.id}"][data-type="end"]`)?.value || '18:00';
    schedule[day.id] = enabled ? [{ start, end }] : [];
  }
  return schedule;
}

function isRevenueStatus(status) {
  return normalizeText(status) !== 'cancelado';
}

function getAppointmentValue(appointment) {
  return fromCents(getAppointmentValueCents(appointment));
}

function getAppointmentValueCents(appointment) {
  return toCents(byId(state.data.services, appointment.serviceId)?.price || 0);
}

function getAppointmentStatus(appointment) {
  return appointment.status || 'confirmado';
}

function statusLabel(status) {
  const map = {
    confirmado: 'Confirmado',
    pending: 'Pendente',
    pendente: 'Pendente',
    concluido: 'Concluído',
    concluído: 'Concluído',
    cancelado: 'Cancelado'
  };
  return map[normalizeText(status)] || 'Confirmado';
}

function dateInRange(dateIso, startIso, endIso) {
  return dateIso >= startIso && dateIso <= endIso;
}

function getWeekRange(anchorIso) {
  const anchor = parseIsoDate(anchorIso);
  const day = anchor.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const start = new Date(anchor);
  start.setDate(anchor.getDate() + diffToMonday);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: getLocalIsoDate(start), end: getLocalIsoDate(end) };
}

function getMonthRange(anchorIso) {
  const anchor = parseIsoDate(anchorIso);
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  return { start: getLocalIsoDate(start), end: getLocalIsoDate(end) };
}

function getFilteredAppointments({ memberId = 'all', startDate, endDate }) {
  return state.data.appointments.filter((appointment) => {
    if (memberId !== 'all' && appointment.teamId !== memberId) return false;
    if (startDate && appointment.date < startDate) return false;
    if (endDate && appointment.date > endDate) return false;
    return matchesSearch(
      appointment.clientName,
      appointment.clientPhone,
      byName(state.data.team, appointment.teamId),
      byName(state.data.services, appointment.serviceId),
      appointment.date,
      appointment.time,
      getAppointmentStatus(appointment)
    );
  });
}

function summarizeAppointments(list) {
  const totalRevenueCents = list.reduce((sum, appointment) => {
    if (!isRevenueStatus(getAppointmentStatus(appointment))) return sum;
    return sum + getAppointmentValueCents(appointment);
  }, 0);
  const uniqueClients = new Set(
    list.map((appointment) => String(appointment.clientPhone || appointment.clientName || '').trim()).filter(Boolean)
  );

  const totalRevenue = fromCents(totalRevenueCents);
  return {
    count: list.length,
    revenue: totalRevenue,
    clients: uniqueClients.size,
    averageTicket: list.length ? totalRevenue / list.length : 0
  };
}

function buildDateSeries(startIso, endIso) {
  const result = [];
  let cursor = startIso;
  while (cursor <= endIso) {
    result.push(cursor);
    cursor = shiftIsoDate(cursor, 1);
  }
  return result;
}

function getPreviousRange(rangeType, monthRange) {
  if (rangeType === 'day') {
    const prevDay = shiftIsoDate(state.ui.financeAnchorDate, -1);
    return { start: prevDay, end: prevDay, label: `vs ${formatDate(prevDay)}` };
  }

  if (rangeType === 'week') {
    const prevAnchor = shiftIsoDate(state.ui.financeAnchorDate, -7);
    const prevWeek = getWeekRange(prevAnchor);
    return { start: prevWeek.start, end: prevWeek.end, label: 'vs semana anterior' };
  }

  const anchor = parseIsoDate(state.ui.financeAnchorDate);
  const prevStart = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1);
  const prevEnd = new Date(anchor.getFullYear(), anchor.getMonth(), 0);
  return { start: getLocalIsoDate(prevStart), end: getLocalIsoDate(prevEnd), label: 'vs mês anterior' };
}

function getProfitDelta(currentCents, previousCents) {
  if (previousCents === 0 && currentCents === 0) {
    return { percent: 0, trend: 'flat' };
  }
  if (previousCents === 0 && currentCents > 0) {
    return { percent: 100, trend: 'up' };
  }

  const percent = ((currentCents - previousCents) / previousCents) * 100;
  if (percent > 0.1) return { percent, trend: 'up' };
  if (percent < -0.1) return { percent, trend: 'down' };
  return { percent, trend: 'flat' };
}

function renderProfitChart(monthRange) {
  const chart = document.getElementById('financeProfitChart');
  if (!chart) return;

  let labels = [];
  let valuesCents = [];
  let periodLabel = 'período';

  if (state.ui.financeChartRange === 'day') {
    periodLabel = 'dia';
    const bins = Array.from({ length: 12 }, (_, index) => index * 2);
    const dayAppointments = getFilteredAppointments({
      memberId: state.ui.financeMemberId,
      startDate: state.ui.financeAnchorDate,
      endDate: state.ui.financeAnchorDate
    });

    labels = bins.map((hour) => `${String(hour).padStart(2, '0')}h`);
    valuesCents = bins.map((binStart) => {
      const binEnd = binStart + 1;
      return dayAppointments.reduce((sum, appointment) => {
        if (!isRevenueStatus(getAppointmentStatus(appointment))) return sum;
        const hour = Number(String(appointment.time || '').slice(0, 2));
        if (!Number.isFinite(hour) || hour < binStart || hour > binEnd) return sum;
        return sum + getAppointmentValueCents(appointment);
      }, 0);
    });
  } else if (state.ui.financeChartRange === 'week') {
    periodLabel = 'semana';
    const weekRange = getWeekRange(state.ui.financeAnchorDate);
    const dates = buildDateSeries(weekRange.start, weekRange.end);
    labels = dates.map((dateIso) => formatDate(dateIso));
    valuesCents = dates.map((dateIso) => {
      const dayAppointments = getFilteredAppointments({
        memberId: state.ui.financeMemberId,
        startDate: dateIso,
        endDate: dateIso
      });
      return dayAppointments.reduce((sum, appointment) => {
        if (!isRevenueStatus(getAppointmentStatus(appointment))) return sum;
        return sum + getAppointmentValueCents(appointment);
      }, 0);
    });
  } else {
    periodLabel = 'mês';
    const dates = buildDateSeries(monthRange.start, monthRange.end);
    labels = dates.map((dateIso) => formatDate(dateIso));
    valuesCents = dates.map((dateIso) => {
      const dayAppointments = getFilteredAppointments({
        memberId: state.ui.financeMemberId,
        startDate: dateIso,
        endDate: dateIso
      });
      return dayAppointments.reduce((sum, appointment) => {
        if (!isRevenueStatus(getAppointmentStatus(appointment))) return sum;
        return sum + getAppointmentValueCents(appointment);
      }, 0);
    });
  }

  const totalCents = valuesCents.reduce((sum, value) => sum + value, 0);
  const maxCents = Math.max(...valuesCents, 1);
  const bestIndex = valuesCents.reduce((best, value, index, arr) => (value > arr[best] ? index : best), 0);
  const currentProfitKey = `${state.ui.financeChartRange}|${state.ui.financeMemberId}|${state.ui.financeAnchorDate}|${valuesCents.join(',')}`;
  const shouldAnimate = state.ui.lastProfitKey !== currentProfitKey;
  state.ui.lastProfitKey = currentProfitKey;

  const previousRange = getPreviousRange(state.ui.financeChartRange, monthRange);
  const previousCents = getFilteredAppointments({
    memberId: state.ui.financeMemberId,
    startDate: previousRange.start,
    endDate: previousRange.end
  }).reduce((sum, appointment) => {
    if (!isRevenueStatus(getAppointmentStatus(appointment))) return sum;
    return sum + getAppointmentValueCents(appointment);
  }, 0);

  const delta = getProfitDelta(totalCents, previousCents);
  const deltaEl = document.getElementById('financeProfitDelta');
  const deltaMetaEl = document.getElementById('financeProfitDeltaMeta');
  const sign = delta.percent > 0 ? '+' : '';
  deltaEl.textContent = `${sign}${delta.percent.toFixed(1)}%`;
  deltaEl.classList.remove('profit-delta--up', 'profit-delta--down', 'profit-delta--flat');
  deltaEl.classList.add(
    delta.trend === 'up' ? 'profit-delta--up' : delta.trend === 'down' ? 'profit-delta--down' : 'profit-delta--flat'
  );
  deltaMetaEl.textContent = `${previousRange.label} (${moneyFromCents(previousCents)})`;

  document.getElementById('financeProfitTotal').textContent = moneyFromCents(totalCents);
  document.getElementById('financeProfitMeta').textContent = `${compactNumber(valuesCents.filter((value) => value > 0).length)} ponto(s) com lucro no ${periodLabel}`;

  document.querySelectorAll('[data-finance-range]').forEach((button) => {
    button.classList.toggle('active', button.dataset.financeRange === state.ui.financeChartRange);
  });

  if (totalCents <= 0) {
    document.getElementById('financeProfitBestDay').textContent = '-';
    document.getElementById('financeProfitBestMeta').textContent = 'Sem dados.';
    chart.innerHTML = '<p class="empty-state">Sem lucro registrado no período selecionado.</p>';
    return;
  }

  document.getElementById('financeProfitBestDay').textContent = moneyFromCents(valuesCents[bestIndex]);
  document.getElementById('financeProfitBestMeta').textContent = `Melhor ponto: ${labels[bestIndex] || '-'}`;

  chart.classList.toggle('animate', shouldAnimate);
  chart.innerHTML = labels
    .map((label, index) => {
      const valueCents = valuesCents[index];
      const height = Math.max(3, Math.round((valueCents / maxCents) * 100));
      return `
        <div class="profit-bar-item">
          <div class="profit-bar-track">
            <span class="profit-bar-fill" style="height:${height}%; animation-delay:${Math.min(index * 25, 450)}ms"></span>
          </div>
          <strong>${moneyFromCents(valueCents)}</strong>
          <small>${label}</small>
        </div>`;
    })
    .join('');
}

function calculateDailyCapacity(member, dateIso) {
  if (!member) return 0;
  const dayId = parseIsoDate(dateIso).getDay();
  const ranges = member.schedule?.[dayId] || [];
  const capacityPerSlot = Number(member.capacityPerSlot || 1);
  return ranges.reduce((sum, range) => {
    const [startHour, startMinute] = String(range.start || '09:00').split(':').map(Number);
    const [endHour, endMinute] = String(range.end || '18:00').split(':').map(Number);
    const start = startHour * 60 + startMinute;
    const end = endHour * 60 + endMinute;
    const slots = Math.max(0, Math.floor((end - start) / 60));
    return sum + slots * capacityPerSlot;
  }, 0);
}

function getTeamPerformance(dateIso, memberFilter = 'all') {
  const appointments = getFilteredAppointments({ memberId: memberFilter, startDate: dateIso, endDate: dateIso });
  const members = memberFilter === 'all'
    ? state.data.team
    : state.data.team.filter((member) => member.id === memberFilter);

  return members.map((member) => {
    const memberAppointments = appointments.filter((appointment) => appointment.teamId === member.id);
    const summary = summarizeAppointments(memberAppointments);
    const capacity = calculateDailyCapacity(member, dateIso);
    const progress = capacity ? Math.min(100, Math.round((memberAppointments.length / capacity) * 100)) : 0;
    return {
      member,
      appointments: memberAppointments,
      summary,
      capacity,
      progress
    };
  });
}

function buildSparkline(values, color) {
  const width = 140;
  const height = 42;
  const safeValues = values.length ? values : [0, 0, 0, 0, 0, 0, 0];
  const max = Math.max(...safeValues, 1);
  const step = safeValues.length > 1 ? width / (safeValues.length - 1) : width;
  const points = safeValues
    .map((value, index) => {
      const x = index * step;
      const y = height - (value / max) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(' ');
  return `
    <svg viewBox="0 0 ${width} ${height}" class="sparkline" aria-hidden="true">
      <polyline points="${points}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>
    </svg>`;
}

function getLastDays(daysBack, selector) {
  const result = [];
  for (let offset = daysBack - 1; offset >= 0; offset -= 1) {
    const dayIso = shiftIsoDate(getLocalIsoDate(), -offset);
    result.push(selector(dayIso));
  }
  return result;
}

function renderShellMeta() {
  const ownerId = String(state.data.settings.ownerId || '').trim();
  const users = Array.isArray(state.data.users) ? state.data.users : [];
  const ownerUser = users.find((user) => String(user?.uid || '').trim() === ownerId) || null;
  const sidebarAdminName = String(ownerUser?.displayName || ownerId || 'Administrador').trim();
  const sidebarAdminEmail = String(ownerUser?.email || 'Conta principal').trim();
  const sidebarAdminPhoto = String(ownerUser?.photoUrl || '').trim();

  document.getElementById('sidebarShopName').textContent = state.data.settings.barbershopName || 'Barbearia';

  const topUserName = document.getElementById('adminTopUserName');
  const topUserEmail = document.getElementById('adminTopUserEmail');
  if (topUserName) {
    topUserName.textContent = sidebarAdminName;
    topUserName.title = sidebarAdminName;
  }
  if (topUserEmail) {
    topUserEmail.textContent = sidebarAdminEmail;
    topUserEmail.title = sidebarAdminEmail;
  }

  const adminUserName = document.getElementById('adminUserName');
  adminUserName.textContent = sidebarAdminName;
  adminUserName.title = sidebarAdminName;
  const adminUserMeta = document.getElementById('adminUserMeta');
  if (adminUserMeta) {
    adminUserMeta.textContent = sidebarAdminEmail;
    adminUserMeta.title = sidebarAdminEmail;
  }

  applyAvatar(document.getElementById('adminTopAvatar'), sidebarAdminName, sidebarAdminPhoto);
  applyAvatar(document.getElementById('adminSidebarAvatar'), sidebarAdminName, sidebarAdminPhoto);

  document.getElementById('heroBadgeDate').textContent = formatWeekday(state.ui.selectedDate);
  const notificationCount = getNotificationAppointments().length;
  document.getElementById('notificationsCounter').textContent = compactNumber(notificationCount);
  document.getElementById('notificationsCounter').hidden = notificationCount <= 0;
  renderNotificationsPanel();
}

function renderSettingsForm() {
  const form = document.getElementById('settingsForm');
  const settings = state.data.settings || {};
  for (const [key, value] of Object.entries(settings)) {
    if (form.elements[key]) form.elements[key].value = value || '';
  }
}

function getServiceCategories() {
  return [...new Set(state.data.services.map((service) => String(service.category || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function renderServiceCategoryField(preferredCategory = '') {
  const select = document.getElementById('serviceCategoryInput');
  const addButton = document.getElementById('addServiceCategory');
  if (!select) return;

  const categories = getServiceCategories();
  const preferred = String(preferredCategory || '').trim();
  const optionValues = preferred && !categories.includes(preferred) ? [...categories, preferred] : categories;

  if (!optionValues.length) {
    select.innerHTML = '<option value="">Nenhuma categoria cadastrada</option>';
    select.value = '';
    select.disabled = true;
    if (addButton) addButton.hidden = false;
    return;
  }

  select.disabled = false;
  select.innerHTML = optionValues.map((category) => `<option value="${category}">${category}</option>`).join('');
  select.value = preferred && optionValues.includes(preferred) ? preferred : optionValues[0];
  if (addButton) addButton.hidden = false;
}

function addServiceCategory() {
  openCategoryDialog();
}

function openCategoryDialog() {
  const modal = document.getElementById('categoryDialog');
  const input = document.getElementById('newCategoryInput');
  const feedback = document.getElementById('categoryDialogFeedback');
  if (!modal || !input) return;

  modal.hidden = false;
  document.body.classList.add('admin-modal-open');
  input.value = '';
  if (feedback) feedback.textContent = '';
  setTimeout(() => input.focus(), 0);
}

function closeCategoryDialog() {
  const modal = document.getElementById('categoryDialog');
  if (!modal) return;
  modal.hidden = true;
  if (!isAnyAdminModalOpen()) {
    document.body.classList.remove('admin-modal-open');
  }
}

function isAnyAdminModalOpen() {
  const modalIds = ['serviceModal', 'teamModal', 'categoryDialog'];
  return modalIds.some((id) => {
    const node = document.getElementById(id);
    return node && !node.hidden;
  });
}

function saveCategoryFromDialog() {
  const select = document.getElementById('serviceCategoryInput');
  const inputEl = document.getElementById('newCategoryInput');
  const feedbackEl = document.getElementById('categoryDialogFeedback');
  if (!select) return;
  if (!inputEl) return;

  const category = String(inputEl.value || '').trim();
  if (!category) {
    if (feedbackEl) feedbackEl.textContent = 'Informe um nome para a categoria.';
    return;
  }

  const existing = new Set(getServiceCategories());
  if (existing.has(category)) {
    renderServiceCategoryField(category);
    setFeedback('serviceFeedback', `Categoria "${category}" já existe.`);
    closeCategoryDialog();
    return;
  }

  const option = document.createElement('option');
  option.value = category;
  option.textContent = category;
  select.appendChild(option);
  select.disabled = false;
  select.value = category;

  setFeedback('serviceFeedback', `Categoria "${category}" pronta para uso. Salve o serviço para confirmar.`, false);
  closeCategoryDialog();
}

function renderDashboard() {
  const todayIso = state.ui.selectedDate;
  renderMemberFilters('dashboardMemberFilters', state.ui.dashboardMemberId, 'dashboard-member');

  const todayAppointments = getFilteredAppointments({
    memberId: state.ui.dashboardMemberId,
    startDate: todayIso,
    endDate: todayIso
  });
  const todaySummary = summarizeAppointments(todayAppointments);
  const revenueSeries = getLastDays(7, (dayIso) => summarizeAppointments(getFilteredAppointments({ memberId: state.ui.dashboardMemberId, startDate: dayIso, endDate: dayIso })).revenue);
  const bookingSeries = getLastDays(7, (dayIso) => summarizeAppointments(getFilteredAppointments({ memberId: state.ui.dashboardMemberId, startDate: dayIso, endDate: dayIso })).count);
  const activeTeamCount = state.ui.dashboardMemberId === 'all' ? state.data.team.length : state.data.team.filter((member) => member.id === state.ui.dashboardMemberId).length;
  const widgetValues = [
    {
      title: 'Agendamentos hoje',
      value: compactNumber(todaySummary.count),
      delta: `${Math.max(0, todaySummary.count - 1)} vs. ontem`,
      color: 'var(--admin-accent)',
      spark: buildSparkline(bookingSeries, 'var(--admin-accent)')
    },
    {
      title: 'Faturamento hoje',
      value: money(todaySummary.revenue),
      delta: 'Receita líquida do dia',
      color: 'var(--admin-success)',
      spark: buildSparkline(revenueSeries, 'var(--admin-success)')
    },
    {
      title: 'Clientes únicos',
      value: compactNumber(todaySummary.clients),
      delta: 'Clientes com atendimento no dia',
      color: 'var(--admin-warning)',
      spark: buildSparkline(getLastDays(7, (dayIso) => summarizeAppointments(getFilteredAppointments({ memberId: state.ui.dashboardMemberId, startDate: dayIso, endDate: dayIso })).clients), 'var(--admin-warning)')
    },
    {
      title: 'Barbeiros ativos',
      value: compactNumber(activeTeamCount),
      delta: state.ui.dashboardMemberId === 'all' ? 'Perfis disponíveis no sistema' : 'Perfil filtrado no dashboard',
      color: 'var(--admin-info)',
      spark: buildSparkline(getLastDays(7, () => activeTeamCount), 'var(--admin-info)')
    },
    {
      title: 'Serviços cadastrados',
      value: compactNumber(state.data.services.filter((service) => service.active !== false).length),
      delta: 'Catálogo ativo para agendamento',
      color: 'var(--admin-accent-soft)',
      spark: buildSparkline(getLastDays(7, () => state.data.services.filter((service) => service.active !== false).length), 'var(--admin-accent-soft)')
    },
    {
      title: 'Avaliações',
      value: compactNumber(state.data.reviews.length),
      delta: 'Prova social publicada',
      color: 'var(--admin-danger)',
      spark: buildSparkline(getLastDays(7, () => state.data.reviews.length), 'var(--admin-danger)')
    }
  ];

  document.getElementById('dashboardWidgets').innerHTML = widgetValues
    .map(
      (widget) => `
        <article class="metric-card">
          <div class="metric-card__top">
            <span class="metric-icon" style="--metric-color: ${widget.color}"></span>
            <span class="metric-delta">${widget.delta}</span>
          </div>
          <strong class="metric-value">${widget.value}</strong>
          <p class="metric-title">${widget.title}</p>
          ${widget.spark}
        </article>`
    )
    .join('');

  renderTeamCards('dashboardBarberGrid', todayIso, state.ui.dashboardMemberId);
  renderAppointmentsTable('dashboardUpcomingTable', todayAppointments.slice().sort(sortAppointments), { compact: true });
}

function renderMemberFilters(containerId, selectedId, handlerType) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const buttons = [
    `<button class="chip ${selectedId === 'all' ? 'active' : ''}" type="button" data-${handlerType}="all">Todos</button>`
  ];
  state.data.team.forEach((member) => {
    buttons.push(
      `<button class="chip ${selectedId === member.id ? 'active' : ''}" type="button" data-${handlerType}="${member.id}">${member.name}</button>`
    );
  });
  container.innerHTML = buttons.join('');
}

function renderTeamCards(containerId, dateIso, memberFilter) {
  const grid = document.getElementById(containerId);
  if (!grid) return;
  const performance = getTeamPerformance(dateIso, memberFilter).filter((item) => matchesSearch(item.member.name, item.member.role));
  grid.innerHTML = performance.length
    ? performance
        .map(({ member, summary, progress, capacity }) => `
          <article class="barber-card">
            <div class="barber-card__header">
              ${member.photo ? `<img class="barber-photo" src="${member.photo}" alt="${member.name}" />` : `<div class="barber-avatar">${initials(member.name)}</div>`}
              <div>
                <h3>${member.name}</h3>
                <p>${member.role || 'Barbeiro(a)'}</p>
              </div>
            </div>
            <div class="barber-card__stats">
              <div><span>Atendimentos</span><strong>${compactNumber(summary.count)}</strong></div>
              <div><span>Faturamento</span><strong>${money(summary.revenue)}</strong></div>
              <div><span>Clientes</span><strong>${compactNumber(summary.clients)}</strong></div>
            </div>
            <div class="barber-progress">
              <div class="barber-progress__meta"><span>Agenda ocupada</span><span>${progress}% ${capacity ? `de ${capacity} vagas` : ''}</span></div>
              <div class="barber-progress__track"><span style="width:${progress}%"></span></div>
            </div>
          </article>`)
        .join('')
    : '<p class="empty-state">Nenhum barbeiro encontrado para os filtros atuais.</p>';
}

function renderAgenda() {
  document.getElementById('agendaDate').value = state.ui.selectedDate;
  document.getElementById('agendaDateLabel').textContent = formatWeekday(state.ui.selectedDate);
  renderMemberFilters('agendaMemberFilters', state.ui.selectedMemberId, 'agenda-member');

  const appointments = getFilteredAppointments({
    memberId: state.ui.selectedMemberId,
    startDate: state.ui.selectedDate,
    endDate: state.ui.selectedDate
  }).sort(sortAppointments);
  const summary = summarizeAppointments(appointments);

  document.getElementById('agendaStatAppointments').textContent = compactNumber(summary.count);
  document.getElementById('agendaStatRevenue').textContent = money(summary.revenue);
  document.getElementById('agendaStatClients').textContent = compactNumber(summary.clients);
  document.getElementById('agendaStatAverage').textContent = money(summary.averageTicket);

  renderTeamCards('agendaDayBarberGrid', state.ui.selectedDate, state.ui.selectedMemberId);
  renderAppointmentsTable('appointmentsTable', appointments, { compact: false });
}

function renderClients() {
  const map = new Map();
  state.data.appointments.forEach((appointment) => {
    const key = String(appointment.clientPhone || appointment.clientName || '').trim() || appointment.id;
    if (!map.has(key)) {
      map.set(key, {
        key,
        name: appointment.clientName || 'Cliente sem nome',
        phone: appointment.clientPhone || '-',
        visits: 0,
        revenue: 0,
        lastVisit: appointment.date,
        members: {}
      });
    }
    const client = map.get(key);
    client.visits += 1;
    client.revenue += getAppointmentValue(appointment);
    if (appointment.date > client.lastVisit) client.lastVisit = appointment.date;
    const memberName = byName(state.data.team, appointment.teamId, 'Sem profissional');
    client.members[memberName] = (client.members[memberName] || 0) + 1;
  });

  const clients = [...map.values()]
    .filter((client) => matchesSearch(client.name, client.phone, Object.keys(client.members).join(' ')))
    .sort((a, b) => b.visits - a.visits || b.lastVisit.localeCompare(a.lastVisit));

  document.getElementById('clientsSummary').innerHTML = `
    <article class="info-card"><span>Total de clientes</span><strong>${compactNumber(clients.length)}</strong></article>
    <article class="info-card"><span>Clientes recorrentes</span><strong>${compactNumber(clients.filter((client) => client.visits > 1).length)}</strong></article>
    <article class="info-card"><span>Faturamento da base</span><strong>${money(clients.reduce((sum, client) => sum + client.revenue, 0))}</strong></article>`;

  document.getElementById('clientsTable').innerHTML = `
    <thead>
      <tr><th>Cliente</th><th>Contato</th><th>Visitas</th><th>Última visita</th><th>Faturamento</th><th>Profissional favorito</th></tr>
    </thead>
    <tbody>
      ${clients
        .map((client) => {
          const favorite = Object.entries(client.members).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';
          return `
            <tr>
              <td><div class="name-cell"><span class="mini-avatar">${initials(client.name)}</span><span>${client.name}</span></div></td>
              <td>${client.phone}</td>
              <td>${compactNumber(client.visits)}</td>
              <td>${formatDate(client.lastVisit)}</td>
              <td>${money(client.revenue)}</td>
              <td>${favorite}</td>
            </tr>`;
        })
        .join('')}
    </tbody>`;
}

function renderServices() {
  renderServiceCategoryField(document.getElementById('serviceCategoryInput')?.value || '');
  const categories = getServiceCategories();

  const filterSelect = document.getElementById('serviceCategoryFilter');
  if (filterSelect) {
    filterSelect.innerHTML = [`<option value="all">Todas as categorias</option>`, ...categories.map((category) => `<option value="${category}">${category}</option>`)].join('');
    if (![...categories, 'all'].includes(state.ui.serviceCategoryFilter)) state.ui.serviceCategoryFilter = 'all';
    filterSelect.value = state.ui.serviceCategoryFilter;
  }

  const services = state.data.services
    .filter((service) => state.ui.serviceCategoryFilter === 'all' || (service.category || '') === state.ui.serviceCategoryFilter)
    .filter((service) => matchesSearch(service.name, service.category, service.description));

  const grouped = services.reduce((acc, service) => {
    const key = service.category || 'Sem categoria';
    acc[key] = acc[key] || [];
    acc[key].push(service);
    return acc;
  }, {});

  const categoryInsights = document.getElementById('serviceCategoryInsights');
  if (categoryInsights) {
    categoryInsights.innerHTML = Object.entries(grouped)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([category, list]) => `
        <article class="info-card">
          <span>${category}</span>
          <strong>${compactNumber(list.length)} variações</strong>
          <small>Média ${money(list.reduce((sum, item) => sum + Number(item.price || 0), 0) / Math.max(list.length, 1))}</small>
        </article>`)
      .join('') || '<p class="empty-state">Crie sua primeira categoria com quantas variações quiser.</p>';
  }

  const managerSource = document.getElementById('categoryManagerSource');
  if (managerSource) {
    managerSource.innerHTML = categories.length
      ? categories.map((category) => `<option value="${category}">${category}</option>`).join('')
      : '<option value="">Sem categorias</option>';
  }

  const categoryStats = categories.map((category) => {
    const list = state.data.services.filter((service) => (service.category || '') === category);
    const totalCents = list.reduce((sum, service) => sum + toCents(service.price), 0);
    const avgCents = list.length ? Math.round(totalCents / list.length) : 0;
    return {
      category,
      count: list.length,
      active: list.filter((service) => service.active !== false).length,
      avgCents
    };
  });

  const categoryManagerTable = document.getElementById('categoryManagerTable');
  if (categoryManagerTable) {
    categoryManagerTable.innerHTML = `
      <thead>
        <tr><th>Categoria</th><th>Variações</th><th>Ativos</th><th>Preço médio</th></tr>
      </thead>
      <tbody>
        ${categoryStats.length
          ? categoryStats.map((item) => `
            <tr>
              <td>${item.category}</td>
              <td>${compactNumber(item.count)}</td>
              <td>${compactNumber(item.active)}</td>
              <td>${moneyFromCents(item.avgCents)}</td>
            </tr>`).join('')
          : '<tr><td colspan="4" class="empty-row">Sem categorias para gerenciar.</td></tr>'}
      </tbody>`;
  }

  document.getElementById('servicesTable').innerHTML = `
    <thead>
      <tr><th>Nome</th><th>Categoria</th><th>Preço</th><th>Duração</th><th>Status</th><th>Ações</th></tr>
    </thead>
    <tbody>
      ${services
        .sort((a, b) => `${a.category || ''}${a.name}`.localeCompare(`${b.category || ''}${b.name}`))
        .map((service) => `
          <tr>
            <td><div class="table-title"><strong>${service.name}</strong><small>${service.description || 'Sem descrição'}</small></div></td>
            <td>${service.category || '-'}</td>
            <td>${money(service.price)}</td>
            <td>${durationLabel(service.duration)}</td>
            <td><span class="status-badge ${service.active === false ? 'status-muted' : 'status-success'}">${service.active === false ? 'Inativo' : 'Ativo'}</span></td>
            <td class="table-actions">
              <button class="table-action" type="button" data-edit-service="${service.id}">Editar</button>
              <button class="table-action danger" type="button" data-del-service="${service.id}">Excluir</button>
            </td>
          </tr>`)
        .join('')}
    </tbody>`;

  const select = document.getElementById('mostBookedServiceSelect');
  if (select) {
    select.innerHTML = state.data.services.map((service) => `<option value="${service.id}">${service.name}</option>`).join('');
  }
}

function renderBarbers() {
  const scheduleSelect = document.getElementById('scheduleMemberSelect');
  const scheduleSaveButton = document.getElementById('saveScheduleForMember');
  const scheduleStepToggle = document.getElementById('scheduleStepToggle');
  const allMembers = Array.isArray(state.data.team) ? state.data.team : [];
  if (scheduleSelect) {
    if (!allMembers.length) {
      state.ui.selectedScheduleMemberId = '';
      state.ui.selectedScheduleNoGap = true;
      scheduleSelect.innerHTML = '<option value="">Sem profissionais</option>';
      scheduleSelect.disabled = true;
      if (scheduleSaveButton) scheduleSaveButton.disabled = true;
      if (scheduleStepToggle) scheduleStepToggle.disabled = true;
      buildScheduleRows({});
    } else {
      const selectedExists = allMembers.some((member) => member.id === state.ui.selectedScheduleMemberId);
      if (!selectedExists) {
        state.ui.selectedScheduleMemberId = allMembers[0].id;
      }
      scheduleSelect.innerHTML = allMembers
        .map((member) => `<option value="${member.id}">${member.name}</option>`)
        .join('');
      scheduleSelect.value = state.ui.selectedScheduleMemberId;
      scheduleSelect.disabled = false;
      if (scheduleSaveButton) scheduleSaveButton.disabled = false;
      if (scheduleStepToggle) scheduleStepToggle.disabled = false;

      const selectedMember = byId(allMembers, state.ui.selectedScheduleMemberId);
      state.ui.selectedScheduleNoGap = normalizeScheduleNoGap(selectedMember?.slotStepMode);
      buildScheduleRows(selectedMember?.schedule || {});
    }
  }

  updateScheduleStepToggle();

  const members = state.data.team.filter((member) => matchesSearch(member.name, member.role, member.whatsapp, member.instagram));
  document.getElementById('barberRosterGrid').innerHTML = members.length
    ? members
        .map((member) => `
          <article class="roster-card">
            ${member.photo ? `<img class="roster-card__photo" src="${member.photo}" alt="${member.name}" />` : `<div class="barber-avatar">${initials(member.name)}</div>`}
            <div>
              <strong>${member.name}</strong>
              <p>${member.role || 'Barbeiro(a)'}</p>
            </div>
            <span>${member.capacityPerSlot || 1} cliente(s) por horário</span>
          </article>`)
        .join('')
    : '<p class="empty-state">Nenhum barbeiro cadastrado.</p>';

  document.getElementById('teamTable').innerHTML = `
    <thead>
      <tr><th>Nome</th><th>Cargo</th><th>Capacidade</th><th>WhatsApp</th><th>Instagram</th><th>Ações</th></tr>
    </thead>
    <tbody>
      ${members
        .map((member) => `
          <tr>
            <td><div class="name-cell"><span class="mini-avatar">${initials(member.name)}</span><span>${member.name}</span></div></td>
            <td>${member.role || '-'}</td>
            <td>${member.capacityPerSlot || 1}</td>
            <td>${member.whatsapp || '-'}</td>
            <td>${member.instagram || '-'}</td>
            <td class="table-actions">
              <button class="table-action" type="button" data-edit-team="${member.id}">Editar</button>
              <button class="table-action danger" type="button" data-del-team="${member.id}">Excluir</button>
            </td>
          </tr>`)
        .join('')}
    </tbody>`;
}

function renderReviews() {
  const reviews = state.data.reviews.filter((review) => matchesSearch(review.author, review.comment, review.rating));
  const averageRating = reviews.length
    ? (reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length).toFixed(1)
    : '0.0';
  document.getElementById('reviewsTotalCard').textContent = `${compactNumber(reviews.length)} avaliações · nota média ${averageRating}`;

  document.getElementById('reviewsTable').innerHTML = `
    <thead>
      <tr><th>Cliente</th><th>Nota</th><th>Comentário</th><th>Data</th><th>Ações</th></tr>
    </thead>
    <tbody>
      ${reviews
        .map((review) => `
          <tr>
            <td>${review.author}</td>
            <td>${review.rating}</td>
            <td>${review.comment || '-'}</td>
            <td>${formatDate(review.date)}</td>
            <td class="table-actions"><button class="table-action danger" type="button" data-del-review="${review.id}">Excluir</button></td>
          </tr>`)
        .join('')}
    </tbody>`;
}

function renderFinance() {
  document.getElementById('financeAnchorDate').value = state.ui.financeAnchorDate;
  renderMemberFilters('financeMemberFilters', state.ui.financeMemberId, 'finance-member');

  const dayRange = { start: state.ui.financeAnchorDate, end: state.ui.financeAnchorDate };
  const weekRange = getWeekRange(state.ui.financeAnchorDate);
  const monthRange = getMonthRange(state.ui.financeAnchorDate);
  const daySummary = summarizeAppointments(getFilteredAppointments({ memberId: state.ui.financeMemberId, startDate: dayRange.start, endDate: dayRange.end }));
  const weekSummary = summarizeAppointments(getFilteredAppointments({ memberId: state.ui.financeMemberId, startDate: weekRange.start, endDate: weekRange.end }));
  const monthSummary = summarizeAppointments(getFilteredAppointments({ memberId: state.ui.financeMemberId, startDate: monthRange.start, endDate: monthRange.end }));

  document.getElementById('financeDayRevenue').textContent = money(daySummary.revenue);
  document.getElementById('financeWeekRevenue').textContent = money(weekSummary.revenue);
  document.getElementById('financeMonthRevenue').textContent = money(monthSummary.revenue);
  document.getElementById('financeDayMeta').textContent = `${compactNumber(daySummary.count)} atendimentos em ${formatDate(dayRange.start)}`;
  document.getElementById('financeWeekMeta').textContent = `${compactNumber(weekSummary.count)} atendimentos na semana`;
  document.getElementById('financeMonthMeta').textContent = `${compactNumber(monthSummary.count)} atendimentos no mês`;
  renderProfitChart(monthRange);

  const teamBreakdown = (state.ui.financeMemberId === 'all' ? state.data.team : state.data.team.filter((member) => member.id === state.ui.financeMemberId))
    .map((member) => {
      const day = summarizeAppointments(getFilteredAppointments({ memberId: member.id, startDate: dayRange.start, endDate: dayRange.end }));
      const week = summarizeAppointments(getFilteredAppointments({ memberId: member.id, startDate: weekRange.start, endDate: weekRange.end }));
      const month = summarizeAppointments(getFilteredAppointments({ memberId: member.id, startDate: monthRange.start, endDate: monthRange.end }));
      return { member, day, week, month };
    })
    .filter((item) => matchesSearch(item.member.name, item.member.role));

  document.getElementById('financeTeamBreakdown').innerHTML = teamBreakdown.length
    ? teamBreakdown
        .map((item) => `
          <article class="finance-member-card">
            <div class="finance-member-card__header">
              <span class="mini-avatar">${initials(item.member.name)}</span>
              <div>
                <strong>${item.member.name}</strong>
                <p>${item.member.role || 'Barbeiro(a)'}</p>
              </div>
            </div>
            <div class="finance-member-grid">
              <div><span>Dia</span><strong>${money(item.day.revenue)}</strong></div>
              <div><span>Semana</span><strong>${money(item.week.revenue)}</strong></div>
              <div><span>Mês</span><strong>${money(item.month.revenue)}</strong></div>
            </div>
          </article>`)
        .join('')
    : '<p class="empty-state">Nenhum profissional encontrado.</p>';

  const financeHistory = getFilteredAppointments({ memberId: state.ui.financeMemberId, startDate: monthRange.start, endDate: monthRange.end })
    .sort(sortAppointments)
    .reverse();
  document.getElementById('financeHistoryTable').innerHTML = `
    <thead>
      <tr><th>Data</th><th>Cliente</th><th>Serviço</th><th>Profissional</th><th>Receita</th></tr>
    </thead>
    <tbody>
      ${financeHistory
        .map((appointment) => `
          <tr>
            <td>${formatDate(appointment.date)}</td>
            <td>${appointment.clientName}</td>
            <td>${byName(state.data.services, appointment.serviceId)}</td>
            <td>${byName(state.data.team, appointment.teamId)}</td>
            <td>${money(getAppointmentValue(appointment))}</td>
          </tr>`)
        .join('')}
    </tbody>`;
}

function renderReports() {
  const appointments = getFilteredAppointments({ startDate: getMonthRange(state.ui.financeAnchorDate).start, endDate: getMonthRange(state.ui.financeAnchorDate).end });
  const serviceRank = {};
  const categoryRank = {};
  const dailyRank = {};

  appointments.forEach((appointment) => {
    const service = byId(state.data.services, appointment.serviceId);
    const serviceName = service?.name || 'Serviço removido';
    const categoryName = service?.category || 'Sem categoria';
    serviceRank[serviceName] = (serviceRank[serviceName] || 0) + 1;
    categoryRank[categoryName] = (categoryRank[categoryName] || 0) + getAppointmentValue(appointment);
    dailyRank[appointment.date] = (dailyRank[appointment.date] || 0) + getAppointmentValue(appointment);
  });

  document.getElementById('reportServiceRanking').innerHTML = renderRankingList(serviceRank, 'atendimentos');
  document.getElementById('reportCategoryRanking').innerHTML = renderRankingList(categoryRank, 'receita', true);
  document.getElementById('reportDailyBars').innerHTML = renderDailyBars(dailyRank);
}

function renderRankingList(rankMap, label, asCurrency = false) {
  const entries = Object.entries(rankMap).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (!entries.length) return '<p class="empty-state">Sem dados suficientes para o período.</p>';
  const max = Math.max(entries[0][1], 1);
  return entries
    .map(([name, value]) => `
      <div class="ranking-item">
        <div class="ranking-item__top"><strong>${name}</strong><span>${asCurrency ? money(value) : `${compactNumber(value)} ${label}`}</span></div>
        <div class="ranking-bar"><span style="width:${Math.max(12, Math.round((value / max) * 100))}%"></span></div>
      </div>`)
    .join('');
}

function renderDailyBars(rankMap) {
  const entries = Object.entries(rankMap).sort((a, b) => a[0].localeCompare(b[0])).slice(-10);
  if (!entries.length) return '<p class="empty-state">Sem dias fechados para exibir.</p>';
  const max = Math.max(...entries.map((entry) => entry[1]), 1);
  return entries
    .map(([date, value]) => `
      <div class="daily-bar-row">
        <span>${formatDate(date)}</span>
        <div class="daily-bar"><span style="width:${Math.max(10, Math.round((value / max) * 100))}%"></span></div>
        <strong>${money(value)}</strong>
      </div>`)
    .join('');
}

function renderSettings() {
  renderSettingsForm();

  const highlights = state.data.mostBooked
    .filter((item) => matchesSearch(item.label, item.subtitle, byName(state.data.services, item.serviceId)))
    .sort((a, b) => Number(a.position || 999) - Number(b.position || 999));
  document.getElementById('mostBookedTable').innerHTML = `
    <thead><tr><th>Posição</th><th>Título</th><th>Serviço</th><th>Ações</th></tr></thead>
    <tbody>
      ${highlights
        .map((item) => `
          <tr>
            <td>${item.position || '-'}</td>
            <td><div class="table-title"><strong>${item.label}</strong><small>${item.subtitle || 'Sem subtítulo'}</small></div></td>
            <td>${byName(state.data.services, item.serviceId)}</td>
            <td class="table-actions">
              <button class="table-action" type="button" data-edit-most-booked="${item.id}">Editar</button>
              <button class="table-action danger" type="button" data-del-most-booked="${item.id}">Excluir</button>
            </td>
          </tr>`)
        .join('')}
    </tbody>`;

  const catalog = state.data.catalog
    .filter((item) => matchesSearch(item.title, item.subtitle))
    .sort((a, b) => Number(a.position || 999) - Number(b.position || 999));
  document.getElementById('catalogTable').innerHTML = `
    <thead><tr><th>Imagem</th><th>Título</th><th>Descrição</th><th>Posição</th><th>Ações</th></tr></thead>
    <tbody>
      ${catalog
        .map((item) => `
          <tr>
            <td>${item.image ? `<img class="catalog-thumb" src="${item.image}" alt="${item.title}" />` : '-'}</td>
            <td>${item.title || '-'}</td>
            <td>${item.subtitle || '-'}</td>
            <td>${item.position || '-'}</td>
            <td class="table-actions">
              <button class="table-action" type="button" data-edit-catalog="${item.id}">Editar</button>
              <button class="table-action danger" type="button" data-del-catalog="${item.id}">Excluir</button>
            </td>
          </tr>`)
        .join('')}
    </tbody>`;
}

function renderAppointmentsTable(id, appointments, { compact = false } = {}) {
  const table = document.getElementById(id);
  if (!table) return;
  const colspan = compact ? 6 : 7;
  table.innerHTML = `
    <thead>
      <tr>
        <th>Data</th>
        <th>Hora</th>
        <th>Cliente</th>
        <th>Serviço</th>
        <th>Profissional</th>
        <th>Status</th>
        ${compact ? '' : '<th>Receita</th>'}
      </tr>
    </thead>
    <tbody>
      ${appointments.length
        ? appointments
        .map((appointment) => `
          <tr>
            <td>${formatDate(appointment.date)}</td>
            <td>${appointment.time || '-'}</td>
            <td><div class="name-cell"><span class="mini-avatar">${initials(appointment.clientName)}</span><span>${appointment.clientName || 'Cliente'}</span></div></td>
            <td>${byName(state.data.services, appointment.serviceId)}</td>
            <td>${byName(state.data.team, appointment.teamId, 'Sem profissional')}</td>
            <td><span class="status-badge status-${normalizeText(getAppointmentStatus(appointment))}">${statusLabel(getAppointmentStatus(appointment))}</span></td>
            ${compact ? '' : `<td>${money(getAppointmentValue(appointment))}</td>`}
          </tr>`)
        .join('')
        : `<tr><td colspan="${colspan}" class="empty-row">Nenhum agendamento encontrado para os filtros atuais.</td></tr>`}
    </tbody>`;
}

function sortAppointments(a, b) {
  return `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`);
}

function clearServiceForm() {
  const form = document.getElementById('serviceForm');
  form.reset();
  form.elements.id.value = '';
  form.elements.active.value = 'true';
  renderServiceCategoryField();
  const title = document.getElementById('serviceModalTitle');
  if (title) {
    title.textContent = 'Novo serviço';
  }
}

function openServiceModal(editing = false) {
  const modal = document.getElementById('serviceModal');
  const title = document.getElementById('serviceModalTitle');
  if (!modal) return;

  if (title) {
    title.textContent = editing ? 'Editar serviço' : 'Novo serviço';
  }

  modal.hidden = false;
  document.body.classList.add('admin-modal-open');

  const firstInput = document.getElementById('serviceNameInput');
  if (firstInput) {
    setTimeout(() => firstInput.focus(), 0);
  }
}

function closeServiceModal() {
  const modal = document.getElementById('serviceModal');
  if (!modal) return;
  modal.hidden = true;
  if (!isAnyAdminModalOpen()) {
    document.body.classList.remove('admin-modal-open');
  }
}

function openTeamModal(editing = false) {
  const modal = document.getElementById('teamModal');
  const title = document.getElementById('teamModalTitle');
  if (!modal) return;

  if (title) {
    title.textContent = editing ? 'Editar membro' : 'Novo membro';
  }

  modal.hidden = false;
  document.body.classList.add('admin-modal-open');

  const firstInput = document.getElementById('teamNameInput');
  if (firstInput) {
    setTimeout(() => firstInput.focus(), 0);
  }
}

function closeTeamModal() {
  const modal = document.getElementById('teamModal');
  if (!modal) return;
  modal.hidden = true;
  if (!isAnyAdminModalOpen()) {
    document.body.classList.remove('admin-modal-open');
  }
}

async function renameCategory() {
  const source = document.getElementById('categoryManagerSource')?.value;
  const target = String(document.getElementById('categoryManagerTarget')?.value || '').trim();

  if (!source) {
    setFeedback('categoryManagerFeedback', 'Selecione uma categoria para renomear.', true);
    return;
  }
  if (!target) {
    setFeedback('categoryManagerFeedback', 'Informe o novo nome da categoria.', true);
    return;
  }

  const affected = state.data.services.filter((service) => (service.category || '') === source);
  if (!affected.length) {
    setFeedback('categoryManagerFeedback', 'Nenhum serviço encontrado nessa categoria.', true);
    return;
  }

  try {
    await Promise.all(
      affected.map((service) => api(`/api/admin/services/${service.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: service.name,
          price: Number(service.price || 0),
          duration: Number(service.duration || 0),
          category: target,
          active: service.active !== false,
          description: service.description || ''
        })
      }))
    );

    document.getElementById('categoryManagerTarget').value = '';
    setFeedback('categoryManagerFeedback', `Categoria "${source}" atualizada para "${target}" com sucesso.`);
    await loadData();
  } catch (error) {
    setFeedback('categoryManagerFeedback', `Erro ao renomear categoria: ${error.message}`, true);
  }
}

async function deleteCategoryServices() {
  const source = document.getElementById('categoryManagerSource')?.value;
  if (!source) {
    setFeedback('categoryManagerFeedback', 'Selecione uma categoria para excluir.', true);
    return;
  }

  const affected = state.data.services.filter((service) => (service.category || '') === source);
  if (!affected.length) {
    setFeedback('categoryManagerFeedback', 'Nenhum serviço encontrado nessa categoria.', true);
    return;
  }

  try {
    await Promise.all(affected.map((service) => api(`/api/admin/services/${service.id}`, { method: 'DELETE' })));
    setFeedback('categoryManagerFeedback', `Serviços da categoria "${source}" excluídos com sucesso.`);
    if (state.ui.serviceCategoryFilter === source) state.ui.serviceCategoryFilter = 'all';
    await loadData();
  } catch (error) {
    setFeedback('categoryManagerFeedback', `Erro ao excluir categoria: ${error.message}`, true);
  }
}

function clearMostBookedForm() {
  const form = document.getElementById('mostBookedForm');
  form.reset();
  form.elements.id.value = '';
}

function clearCatalogForm() {
  const form = document.getElementById('catalogForm');
  form.reset();
  form.elements.id.value = '';
  const input = document.getElementById('catalogUpload');
  if (input) input.value = '';
}

function clearTeamForm() {
  const form = document.getElementById('teamForm');
  form.reset();
  form.elements.id.value = '';
  form.elements.capacityPerSlot.value = 1;
  const title = document.getElementById('teamModalTitle');
  if (title) {
    title.textContent = 'Novo membro';
  }
  buildScheduleRows({});
}

function showTab(tabId) {
  state.ui.activeTab = tabId;
  document.querySelectorAll('.nav-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.hidden = panel.id !== `tab-${tabId}`;
  });
  document.body.classList.remove('sidebar-open');
}

function renderAll() {
  renderShellMeta();
  renderDashboard();
  renderAgenda();
  renderClients();
  renderServices();
  renderBarbers();
  renderReviews();
  renderFinance();
  renderReports();
  renderSettings();
}

async function loadData() {
  const data = await api('/api/admin/data');
  state.data = {
    settings: data.settings || {},
    services: Array.isArray(data.services) ? data.services : [],
    mostBooked: Array.isArray(data.mostBooked) ? data.mostBooked : [],
    catalog: Array.isArray(data.catalog) ? data.catalog : [],
    team: Array.isArray(data.team) ? data.team : [],
    reviews: Array.isArray(data.reviews) ? data.reviews : [],
    appointments: Array.isArray(data.appointments) ? data.appointments : [],
    users: Array.isArray(data.users) ? data.users : []
  };
  renderAll();
}

async function refreshAppointmentsOnly() {
  state.data.appointments = await api('/api/admin/appointments');
  renderDashboard();
  renderAgenda();
  renderClients();
  renderFinance();
  renderReports();
  renderShellMeta();
}

function startAppointmentsPolling() {
  if (appointmentsPollTimer) return;
  appointmentsPollTimer = setInterval(async () => {
    if (document.hidden) return;
    try {
      await refreshAppointmentsOnly();
    } catch (_error) {
      // Mantém o painel estável em falhas transitórias.
    }
  }, 10000);
}

async function saveSettings() {
  try {
    const form = document.getElementById('settingsForm');
    const payload = formToJson(form);
    await api('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const imageInput = document.getElementById('heroUpload');
    if (imageInput.files.length) {
      const imageBase64 = await fileToCompressedBase64(imageInput.files[0]);
      await api('/api/admin/upload/hero', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64 })
      });
      imageInput.value = '';
    }

    setFeedback('settingsFeedback', 'Configurações salvas com sucesso.');
    await loadData();
  } catch (error) {
    setFeedback('settingsFeedback', `Erro ao salvar configurações: ${error.message}`, true);
  }
}

async function saveService() {
  try {
    const form = document.getElementById('serviceForm');
    const data = formToJson(form);
    if (!String(data.category || '').trim()) {
      setFeedback('serviceFeedback', 'Selecione ou crie uma categoria para o serviço.', true);
      return;
    }
    const duration = parseDurationInput(data.duration);
    if (!Number.isFinite(duration) || duration <= 0) {
      setFeedback('serviceFeedback', 'Duração inválida. Use por exemplo 90 ou 1h30.', true);
      return;
    }

    const payload = {
      name: data.name,
      price: Number(data.price || 0),
      duration,
      category: data.category,
      active: data.active === 'true',
      description: data.description
    };

    if (data.id) {
      await api(`/api/admin/services/${data.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      await api('/api/admin/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    clearServiceForm();
    setFeedback('serviceFeedback', 'Serviço salvo com sucesso.');
    closeServiceModal();
    await loadData();
  } catch (error) {
    setFeedback('serviceFeedback', `Erro ao salvar serviço: ${error.message}`, true);
  }
}

async function saveMostBooked() {
  try {
    const form = document.getElementById('mostBookedForm');
    const data = formToJson(form);
    const payload = {
      serviceId: data.serviceId,
      label: data.label,
      subtitle: data.subtitle,
      position: Number(data.position || 999)
    };

    if (data.id) {
      await api(`/api/admin/most-booked/${data.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      await api('/api/admin/most-booked', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    clearMostBookedForm();
    setFeedback('mostBookedFeedback', 'Destaque salvo com sucesso.');
    await loadData();
  } catch (error) {
    setFeedback('mostBookedFeedback', `Erro ao salvar destaque: ${error.message}`, true);
  }
}

async function saveCatalog() {
  try {
    const form = document.getElementById('catalogForm');
    const data = formToJson(form);
    const payload = {
      title: data.title,
      subtitle: data.subtitle,
      position: Number(data.position || 999)
    };

    let item;
    if (data.id) {
      item = await api(`/api/admin/catalog/${data.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      item = await api('/api/admin/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    const imageInput = document.getElementById('catalogUpload');
    if (imageInput.files.length && item?.id) {
      const imageBase64 = await fileToCompressedBase64(imageInput.files[0]);
      await api(`/api/admin/upload/catalog/${item.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64 })
      });
      imageInput.value = '';
    }

    clearCatalogForm();
    setFeedback('catalogFeedback', 'Item do catálogo salvo com sucesso.');
    await loadData();
  } catch (error) {
    setFeedback('catalogFeedback', `Erro ao salvar catálogo: ${error.message}`, true);
  }
}

async function saveTeam() {
  try {
    const form = document.getElementById('teamForm');
    const data = formToJson(form);
    const payload = {
      name: data.name,
      role: data.role,
      likes: Number(data.likes || 0),
      capacityPerSlot: 1,
      whatsapp: data.whatsapp,
      instagram: data.instagram,
      bio: data.bio
    };

    let member;
    if (data.id) {
      member = await api(`/api/admin/team/${data.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      member = await api('/api/admin/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    const imageInput = document.getElementById('teamPhotoUpload');
    if (imageInput.files.length && member?.id) {
      const imageBase64 = await fileToCompressedBase64(imageInput.files[0]);
      await api(`/api/admin/upload/team/${member.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64 })
      });
      imageInput.value = '';
    }

    clearTeamForm();
    setFeedback('teamFeedback', 'Membro salvo com sucesso.');
    closeTeamModal();
    await loadData();
  } catch (error) {
    setFeedback('teamFeedback', `Erro ao salvar membro: ${error.message}`, true);
  }
}

async function saveSelectedMemberSchedule() {
  const memberId = String(state.ui.selectedScheduleMemberId || '').trim();
  if (!memberId) {
    setFeedback('scheduleMemberFeedback', 'Selecione um profissional para salvar os horários.', true);
    return;
  }

  try {
    const schedule = readScheduleFromTable();
    const slotStepMode = state.ui.selectedScheduleNoGap ? 'auto' : 'fixed';
    const updated = await api(`/api/admin/team/${memberId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schedule, slotStepMode, slotStepMinutes: 60 })
    });

    const idx = state.data.team.findIndex((member) => member.id === memberId);
    if (idx !== -1) {
      state.data.team[idx] = { ...state.data.team[idx], ...updated };
    }

    setFeedback('scheduleMemberFeedback', `Horários de ${byName(state.data.team, memberId)} salvos com sucesso.`);
    renderBarbers();
  } catch (error) {
    setFeedback('scheduleMemberFeedback', `Erro ao salvar horários: ${error.message}`, true);
  }
}

async function saveReview() {
  try {
    const form = document.getElementById('reviewForm');
    const data = formToJson(form);
    await api('/api/admin/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        author: data.author,
        rating: Number(data.rating),
        comment: data.comment,
        date: data.date || undefined
      })
    });
    form.reset();
    setFeedback('reviewFeedback', 'Avaliação cadastrada com sucesso.');
    await loadData();
  } catch (error) {
    setFeedback('reviewFeedback', `Erro ao cadastrar avaliação: ${error.message}`, true);
  }
}

function wireActions() {
  document.getElementById('notificationsToggle')?.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleNotificationsPanel();
  });

  document.getElementById('openServiceModal').addEventListener('click', () => {
    clearServiceForm();
    setFeedback('serviceFeedback', '');
    openServiceModal(false);
  });
  document.getElementById('openTeamModal').addEventListener('click', () => {
    clearTeamForm();
    setFeedback('teamFeedback', '');
    openTeamModal(false);
  });
  document.getElementById('closeServiceModal').addEventListener('click', closeServiceModal);
  document.getElementById('cancelServiceModal').addEventListener('click', closeServiceModal);
  document.getElementById('closeServiceModalBackdrop').addEventListener('click', closeServiceModal);
  document.getElementById('closeCategoryDialog')?.addEventListener('click', closeCategoryDialog);
  document.getElementById('cancelCategoryDialog')?.addEventListener('click', closeCategoryDialog);
  document.getElementById('closeCategoryDialogBackdrop')?.addEventListener('click', closeCategoryDialog);
  document.getElementById('categoryDialogForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    saveCategoryFromDialog();
  });
  document.getElementById('closeTeamModal').addEventListener('click', closeTeamModal);
  document.getElementById('cancelTeamModal').addEventListener('click', closeTeamModal);
  document.getElementById('closeTeamModalBackdrop').addEventListener('click', closeTeamModal);
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const serviceModal = document.getElementById('serviceModal');
    const teamModal = document.getElementById('teamModal');
    const categoryDialog = document.getElementById('categoryDialog');
    closeNotificationsPanel();
    if (categoryDialog && !categoryDialog.hidden) {
      closeCategoryDialog();
      return;
    }
    if (serviceModal && !serviceModal.hidden) {
      closeServiceModal();
    }
    if (teamModal && !teamModal.hidden) {
      closeTeamModal();
    }
  });

  document.getElementById('saveSettings').addEventListener('click', saveSettings);
  document.getElementById('saveService').addEventListener('click', saveService);
  document.getElementById('clearService').addEventListener('click', clearServiceForm);
  document.getElementById('addServiceCategory')?.addEventListener('click', addServiceCategory);
  document.getElementById('renameCategory')?.addEventListener('click', renameCategory);
  document.getElementById('deleteCategoryServices')?.addEventListener('click', deleteCategoryServices);
  document.getElementById('saveMostBooked').addEventListener('click', saveMostBooked);
  document.getElementById('clearMostBooked').addEventListener('click', clearMostBookedForm);
  document.getElementById('saveCatalog').addEventListener('click', saveCatalog);
  document.getElementById('clearCatalog').addEventListener('click', clearCatalogForm);
  document.getElementById('saveTeam').addEventListener('click', saveTeam);
  document.getElementById('clearTeam').addEventListener('click', clearTeamForm);
  document.getElementById('saveScheduleForMember')?.addEventListener('click', saveSelectedMemberSchedule);
  document.getElementById('scheduleStepToggle')?.addEventListener('click', () => {
    state.ui.selectedScheduleNoGap = !state.ui.selectedScheduleNoGap;
    updateScheduleStepToggle();
    setFeedback('scheduleMemberFeedback', 'Modo alterado. Clique em "Salvar horários" para aplicar.');
  });
  document.getElementById('saveReview').addEventListener('click', saveReview);

  document.getElementById('sidebarToggle').addEventListener('click', () => {
    document.body.classList.toggle('sidebar-open');
  });

  document.querySelector('.mobile-overlay')?.addEventListener('click', () => {
    document.body.classList.remove('sidebar-open');
    closeNotificationsPanel();
  });

  document.addEventListener('click', (event) => {
    if (event.target.closest('.notification-wrap')) return;
    closeNotificationsPanel();
  });

  document.getElementById('sidebarLogout').addEventListener('click', () => {
    if (!authState.enabled) {
      window.location.href = '/';
      return;
    }

    clearAuthSession();
    lockAdminUi();
    authState.panelReady = false;
    if (appointmentsPollTimer) {
      clearInterval(appointmentsPollTimer);
      appointmentsPollTimer = null;
    }
    setAuthFeedback('Voce saiu. Entre novamente para continuar.');
  });

  document.querySelectorAll('.nav-btn').forEach((button) => {
    button.addEventListener('click', () => {
      closeNotificationsPanel();
      showTab(button.dataset.tab);
    });
  });

  document.getElementById('adminSearch').addEventListener('input', (event) => {
    state.ui.searchQuery = event.target.value;
    renderAll();
  });

  document.getElementById('agendaPrevDay').addEventListener('click', () => {
    state.ui.selectedDate = shiftIsoDate(state.ui.selectedDate, -1);
    renderDashboard();
    renderAgenda();
    renderShellMeta();
  });
  document.getElementById('agendaNextDay').addEventListener('click', () => {
    state.ui.selectedDate = shiftIsoDate(state.ui.selectedDate, 1);
    renderDashboard();
    renderAgenda();
    renderShellMeta();
  });
  document.getElementById('agendaToday').addEventListener('click', () => {
    state.ui.selectedDate = getLocalIsoDate();
    renderDashboard();
    renderAgenda();
    renderShellMeta();
  });
  document.getElementById('agendaDate').addEventListener('change', (event) => {
    state.ui.selectedDate = event.target.value || getLocalIsoDate();
    renderDashboard();
    renderAgenda();
    renderShellMeta();
  });

  document.getElementById('financeAnchorDate').addEventListener('change', (event) => {
    state.ui.financeAnchorDate = event.target.value || getLocalIsoDate();
    renderFinance();
    renderReports();
  });

  document.getElementById('serviceCategoryFilter').addEventListener('change', (event) => {
    state.ui.serviceCategoryFilter = event.target.value || 'all';
    renderServices();
  });

  document.getElementById('scheduleMemberSelect')?.addEventListener('change', (event) => {
    state.ui.selectedScheduleMemberId = event.target.value || '';
    const member = byId(state.data.team, state.ui.selectedScheduleMemberId);
    state.ui.selectedScheduleNoGap = normalizeScheduleNoGap(member?.slotStepMode);
    updateScheduleStepToggle();
    buildScheduleRows(member?.schedule || {});
    setFeedback('scheduleMemberFeedback', '');
  });

  document.getElementById('scheduleTable').addEventListener('change', (event) => {
    const field = event.target;
    const dayId = field?.dataset?.day;
    const type = field?.dataset?.type;
    if (typeof dayId === 'undefined' || !type) return;

    // Se o usuário alterar hora de início/fim, o dia é ativado automaticamente para salvar o expediente.
    if (type === 'start' || type === 'end') {
      const enabledInput = document.querySelector(`[data-day="${dayId}"][data-type="enabled"]`);
      if (enabledInput && !enabledInput.checked) {
        enabledInput.checked = true;
      }
    }

    syncScheduleRowState(dayId);
  });

  document.addEventListener('click', async (event) => {
    const dashboardMember = event.target.closest('[data-dashboard-member]');
    const agendaMember = event.target.closest('[data-agenda-member]');
    const financeMember = event.target.closest('[data-finance-member]');
    if (dashboardMember) {
      state.ui.dashboardMemberId = dashboardMember.dataset.dashboardMember;
      renderDashboard();
      return;
    }
    if (agendaMember) {
      state.ui.selectedMemberId = agendaMember.dataset.agendaMember;
      renderAgenda();
      return;
    }
    if (financeMember) {
      state.ui.financeMemberId = financeMember.dataset.financeMember;
      renderFinance();
      return;
    }

    const financeRange = event.target.closest('[data-finance-range]');
    if (financeRange) {
      state.ui.financeChartRange = financeRange.dataset.financeRange || 'day';
      renderFinance();
      return;
    }

    const serviceEdit = event.target.closest('[data-edit-service]');
    const serviceDel = event.target.closest('[data-del-service]');
    const mostBookedEdit = event.target.closest('[data-edit-most-booked]');
    const mostBookedDel = event.target.closest('[data-del-most-booked]');
    const catalogEdit = event.target.closest('[data-edit-catalog]');
    const catalogDel = event.target.closest('[data-del-catalog]');
    const teamEdit = event.target.closest('[data-edit-team]');
    const teamDel = event.target.closest('[data-del-team]');
    const reviewDel = event.target.closest('[data-del-review]');

    if (serviceEdit) {
      const item = byId(state.data.services, serviceEdit.dataset.editService);
      const form = document.getElementById('serviceForm');
      if (item) {
        renderServiceCategoryField(item.category || '');
        Object.entries(item).forEach(([key, value]) => {
          if (form.elements[key]) form.elements[key].value = String(value ?? '');
        });
        form.elements.duration.value = durationLabel(item.duration).replace(' ', '');
        form.elements.active.value = item.active === false ? 'false' : 'true';
        showTab('services');
        openServiceModal(true);
      }
      return;
    }

    if (serviceDel) {
      await api(`/api/admin/services/${serviceDel.dataset.delService}`, { method: 'DELETE' });
      await loadData();
      return;
    }

    if (mostBookedEdit) {
      const item = byId(state.data.mostBooked, mostBookedEdit.dataset.editMostBooked);
      const form = document.getElementById('mostBookedForm');
      if (item) {
        Object.entries(item).forEach(([key, value]) => {
          if (form.elements[key]) form.elements[key].value = String(value ?? '');
        });
        showTab('settings');
      }
      return;
    }

    if (mostBookedDel) {
      await api(`/api/admin/most-booked/${mostBookedDel.dataset.delMostBooked}`, { method: 'DELETE' });
      await loadData();
      return;
    }

    if (catalogEdit) {
      const item = byId(state.data.catalog, catalogEdit.dataset.editCatalog);
      const form = document.getElementById('catalogForm');
      if (item) {
        Object.entries(item).forEach(([key, value]) => {
          if (form.elements[key]) form.elements[key].value = String(value ?? '');
        });
        showTab('settings');
      }
      return;
    }

    if (catalogDel) {
      await api(`/api/admin/catalog/${catalogDel.dataset.delCatalog}`, { method: 'DELETE' });
      await loadData();
      return;
    }

    if (teamEdit) {
      const item = byId(state.data.team, teamEdit.dataset.editTeam);
      const form = document.getElementById('teamForm');
      if (item) {
        Object.entries(item).forEach(([key, value]) => {
          if (form.elements[key] && !Array.isArray(value)) form.elements[key].value = String(value ?? '');
        });
        state.ui.selectedScheduleMemberId = item.id;
        state.ui.selectedScheduleNoGap = normalizeScheduleNoGap(item.slotStepMode);
        updateScheduleStepToggle();
        const scheduleSelect = document.getElementById('scheduleMemberSelect');
        if (scheduleSelect) scheduleSelect.value = item.id;
        buildScheduleRows(item.schedule || {});
        showTab('barbers');
        setFeedback('teamFeedback', `Editando ${item.name}. Dados pessoais aqui; horários no quadro "Horários por dia".`);
        openTeamModal(true);
      }
      return;
    }

    if (teamDel) {
      await api(`/api/admin/team/${teamDel.dataset.delTeam}`, { method: 'DELETE' });
      await loadData();
      return;
    }

    if (reviewDel) {
      await api(`/api/admin/reviews/${reviewDel.dataset.delReview}`, { method: 'DELETE' });
      await loadData();
    }
  });
}

async function startPanelAfterAuth() {
  if (authState.panelReady) return;
  await loadData();
  startAppointmentsPolling();
  authState.panelReady = true;
}

function wireAuthActions() {
  const loginForm = document.getElementById('adminLoginForm');
  if (!loginForm) return;

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!authState.enabled) return;

    const email = document.getElementById('adminLoginEmail')?.value?.trim();
    const password = document.getElementById('adminLoginPassword')?.value || '';
    const button = document.getElementById('adminLoginButton');

    if (!email || !password) {
      setAuthFeedback('Informe email e senha para entrar.', true);
      return;
    }

    try {
      if (button) button.disabled = true;
      setAuthFeedback('Validando acesso...');
      await signInWithFirebase(email, password);
      unlockAdminUi();
      setAuthFeedback('');
      await startPanelAfterAuth();
    } catch (error) {
      setAuthFeedback(`Falha no login: ${error.message}`, true);
    } finally {
      if (button) button.disabled = false;
    }
  });
}

async function bootstrapAuth() {
  await fetchFirebaseConfig();
  wireAuthActions();

  if (!authState.enabled) {
    unlockAdminUi();
    setAuthFeedback('');
    return;
  }

  lockAdminUi();
  setAuthFeedback('Faça login para acessar o painel.');
  loadAuthSession();

  if (!authState.idToken) {
    return;
  }

  try {
    await ensureAuthToken();
    unlockAdminUi();
    setAuthFeedback('');
  } catch {
    clearAuthSession();
    lockAdminUi();
    setAuthFeedback('Sessao expirada. Faca login novamente.', true);
  }
}

async function init() {
  buildScheduleRows({});
  wireActions();
  showTab('dashboard');
  await bootstrapAuth();

  if (!authState.enabled) {
    await startPanelAfterAuth();
    return;
  }

  if (!document.body.classList.contains('admin-auth-locked')) {
    await startPanelAfterAuth();
  }
}

init();
