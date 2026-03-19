const params = new URLSearchParams(window.location.search);
const AUTH_STORAGE_KEY = 'adminFirebaseSession';

let state = {
  data: null,
  selectedTime: null,
  loadingSlots: false,
  profile: null
};

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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

function fmtDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function getStoredIdToken() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY) || sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    return String(parsed.idToken || '');
  } catch {
    return '';
  }
}

function populateSelect(el, list, mapLabel, mapValue) {
  el.innerHTML = '';
  list.forEach((item) => {
    const opt = document.createElement('option');
    opt.value = mapValue(item);
    opt.textContent = mapLabel(item);
    el.appendChild(opt);
  });
}

function availableTeamForService(serviceId) {
  return (state.data?.team || []).filter((member) => {
    if (!Array.isArray(member.serviceIds) || member.serviceIds.length === 0) return true;
    return member.serviceIds.includes(serviceId);
  });
}

function updateServiceCard() {
  const serviceId = document.getElementById('serviceSelect').value;
  const svc = (state.data?.services || []).find((s) => s.id === serviceId);
  const card = document.getElementById('serviceCard');
  if (!svc) { card.style.display = 'none'; return; }
  document.getElementById('serviceCardName').textContent = `${svc.name} · ${durationLabel(svc.duration)}`;
  document.getElementById('serviceCardPrice').textContent = money(svc.price);
  card.style.display = 'flex';
}

function setLoading(on) {
  state.loadingSlots = on;
  document.getElementById('slotsLoading').style.display = on ? 'block' : 'none';
  if (on) {
    document.getElementById('slotsBlock').style.display = 'none';
    document.getElementById('slotsError').style.display = 'none';
    document.getElementById('fullDayNotice').style.display = 'none';
  }
}

function showSlotsError(msg) {
  const el = document.getElementById('slotsError');
  el.textContent = msg;
  el.style.display = 'block';
  document.getElementById('slotsBlock').style.display = 'none';
  document.getElementById('fullDayNotice').style.display = 'none';
}

function setFeedback(msg, isSuccess) {
  const el = document.getElementById('feedback');
  el.textContent = msg;
  el.className = `feedback-msg ${isSuccess ? 'feedback-ok' : 'feedback-err'}`;
  el.style.display = msg ? 'block' : 'none';
}

function applyClientProfile(profile, force = false) {
  const nameInput = document.getElementById('clientName');
  const phoneInput = document.getElementById('clientPhone');
  if (!nameInput || !phoneInput || !profile) return;

  const displayName = String(profile.displayName || '').trim();
  const phone = String(profile.phone || '').trim();

  if (force || !nameInput.value.trim()) {
    nameInput.value = displayName;
  }
  if (force || !phoneInput.value.trim()) {
    phoneInput.value = phone;
  }
}

function renderAdminShortcut(profile) {
  const adminLink = document.getElementById('scheduleAdminLink');
  if (!adminLink) return;
  adminLink.hidden = !Boolean(profile?.isAdmin);
}

async function loadClientProfile() {
  const idToken = getStoredIdToken();
  if (!idToken) return;

  try {
    const res = await fetch('/api/auth/profile', {
      headers: { Authorization: `Bearer ${idToken}` }
    });
    if (!res.ok) return;
    const profile = await res.json().catch(() => null);
    if (!profile || typeof profile !== 'object') return;

    state.profile = profile;
    renderAdminShortcut(profile);
    applyClientProfile(profile);
  } catch {
    // Sem impacto no fluxo de agendamento quando perfil nao puder ser carregado.
  }
}

async function loadAvailability() {
  const serviceId = document.getElementById('serviceSelect').value;
  const teamId = document.getElementById('teamSelect').value;
  const date = document.getElementById('dateInput').value;

  if (!serviceId || !teamId || !date) return;

  state.selectedTime = null;
  document.getElementById('selectedSummary').style.display = 'none';
  document.getElementById('confirmBtn').disabled = true;

  setLoading(true);

  try {
    const res = await fetch(`/api/availability?serviceId=${serviceId}&teamId=${teamId}&date=${date}`);
    if (!res.ok) throw new Error('Erro ao buscar horarios');
    const data = await res.json();

    setLoading(false);
    document.getElementById('fullDayNotice').style.display = data.fullDay ? 'block' : 'none';

    const slotsBlock = document.getElementById('slotsBlock');
    const slotsRoot = document.getElementById('slots');
    slotsRoot.innerHTML = '';

    if (!data.slots || data.slots.length === 0) {
      slotsBlock.style.display = 'none';
      if (!data.fullDay) {
        document.getElementById('fullDayNotice').style.display = 'block';
        document.getElementById('fullDayNotice').textContent = 'Nenhum horario disponivel neste dia para este profissional.';
      }
      return;
    }

    slotsBlock.style.display = 'block';

    data.slots.forEach((slot) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `slot${slot.full ? ' full' : ''}`;
      btn.disabled = slot.full;
      btn.innerHTML = slot.full
        ? `<span class="slot-time">${slot.time}</span><span class="slot-tag">Lotado</span>`
        : `<span class="slot-time">${slot.time}</span>`;

      if (!slot.full) {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.slot').forEach((n) => n.classList.remove('selected'));
          btn.classList.add('selected');
          state.selectedTime = slot.time;

          const svc = state.data.services.find((s) => s.id === serviceId);
          const member = state.data.team.find((m) => m.id === teamId);

          const summary = document.getElementById('selectedSummary');
          summary.innerHTML = `
            <span class="sum-icon"></span>
            <span><strong>${svc.name}</strong> com <strong>${member.name}</strong><br/>
            ${fmtDate(date)} às <strong>${slot.time}</strong> · ${durationLabel(svc.duration)} · ${money(svc.price)}</span>
          `;
          summary.style.display = 'flex';
          document.getElementById('confirmBtn').disabled = false;
          setFeedback('', true);
        });
      }
      slotsRoot.appendChild(btn);
    });
  } catch (err) {
    setLoading(false);
    showSlotsError('Não foi possível carregar os horários. Tente novamente.');
  }
}

async function onServiceChange() {
  updateServiceCard();
  const serviceId = document.getElementById('serviceSelect').value;
  const team = availableTeamForService(serviceId);
  populateSelect(document.getElementById('teamSelect'), team, (m) => m.name, (m) => m.id);
  await loadAvailability();
}

async function submitAppointment() {
  const serviceId = document.getElementById('serviceSelect').value;
  const teamId = document.getElementById('teamSelect').value;
  const date = document.getElementById('dateInput').value;
  const clientName = document.getElementById('clientName').value.trim();
  const clientPhone = document.getElementById('clientPhone').value.trim();
  const btn = document.getElementById('confirmBtn');

  if (!clientName) { setFeedback('Informe seu nome.', false); return; }
  if (!state.selectedTime) { setFeedback('Selecione um horario.', false); return; }

  btn.disabled = true;
  btn.textContent = 'Confirmando...';

  try {
    const idToken = getStoredIdToken();
    const headers = { 'Content-Type': 'application/json' };
    if (idToken) {
      headers.Authorization = `Bearer ${idToken}`;
    }

    const res = await fetch('/api/appointments', {
      method: 'POST',
      headers,
      body: JSON.stringify({ serviceId, teamId, date, time: state.selectedTime, clientName, clientPhone })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFeedback(data.message || 'Não foi possível agendar.', false);
      btn.disabled = false;
      btn.textContent = 'Confirmar agendamento';
      await loadAvailability();
      return;
    }

    setFeedback('Agendamento confirmado com sucesso.', true);
    if (state.profile) {
      applyClientProfile(state.profile, true);
    } else {
      document.getElementById('clientName').value = '';
      document.getElementById('clientPhone').value = '';
    }
    document.getElementById('selectedSummary').style.display = 'none';
    btn.textContent = 'Confirmar agendamento';
    await loadAvailability();
  } catch {
    setFeedback('Erro de conexão. Verifique sua internet e tente novamente.', false);
    btn.disabled = false;
    btn.textContent = 'Confirmar agendamento';
  }
}

async function init() {
  try {
    const resp = await fetch('/api/site');
    if (!resp.ok) throw new Error();
    const data = await resp.json();
    state.data = data;

    const name = data.settings?.barbershopName || 'Barbearia';
    document.getElementById('brandName').textContent = name;
    document.title = `Agendar — ${name}`;

    const serviceSelect = document.getElementById('serviceSelect');
    populateSelect(serviceSelect, data.services, (s) => `${s.name} — ${durationLabel(s.duration)}`, (s) => s.id);

    const preselected = params.get('service');
    if (preselected && data.services.some((s) => s.id === preselected)) {
      serviceSelect.value = preselected;
    }

    updateServiceCard();
    populateSelect(
      document.getElementById('teamSelect'),
      availableTeamForService(serviceSelect.value),
      (m) => m.name,
      (m) => m.id
    );

    const dateInput = document.getElementById('dateInput');
    dateInput.value = todayISO();
    dateInput.min = todayISO();

    serviceSelect.addEventListener('change', onServiceChange);
    document.getElementById('teamSelect').addEventListener('change', loadAvailability);
    dateInput.addEventListener('change', loadAvailability);
    document.getElementById('confirmBtn').addEventListener('click', submitAppointment);

    await loadClientProfile();

    await loadAvailability();
  } catch {
    document.querySelector('main').innerHTML = '<p class="notice notice-error" style="margin-top:2rem">Erro ao carregar a página. Verifique se o servidor está rodando.</p>';
  }
}

init();
