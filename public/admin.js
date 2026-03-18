const days = [
  { id: 0, name: 'Domingo' },
  { id: 1, name: 'Segunda-feira' },
  { id: 2, name: 'Terça-feira' },
  { id: 3, name: 'Quarta-feira' },
  { id: 4, name: 'Quinta-feira' },
  { id: 5, name: 'Sexta-feira' },
  { id: 6, name: 'Sábado' }
];

let state = { data: null };
let appointmentsPollTimer = null;

async function api(url, options = {}) {
  const res = await fetch(url, options);
  if (res.status === 204) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || 'Erro na API');
  return body;
}

function byName(arr, id, fallback = '-') {
  return arr.find((x) => x.id === id)?.name || fallback;
}

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formToJson(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function parseDurationInput(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return NaN;

  if (/^\d+$/.test(text)) {
    return Number(text);
  }

  const compact = text.replace(/\s+/g, '');
  let hours = 0;
  let minutes = 0;

  const hourOnly = compact.match(/^(\d+)h$/);
  const hourAndMinute = compact.match(/^(\d+)h(\d+)(?:m(?:in)?)?$/);
  const minuteOnly = compact.match(/^(\d+)m(?:in)?$/);

  if (hourAndMinute) {
    hours = Number(hourAndMinute[1] || 0);
    minutes = Number(hourAndMinute[2] || 0);
  } else if (hourOnly) {
    hours = Number(hourOnly[1] || 0);
  } else if (minuteOnly) {
    minutes = Number(minuteOnly[1] || 0);
  } else {
    return NaN;
  }

  return hours * 60 + minutes;
}

function durationLabel(minutes) {
  const total = Number(minutes || 0);
  if (!Number.isFinite(total) || total <= 0) return '-';
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}

function setFeedback(id, text, isError = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.style.color = isError ? '#c34828' : '';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function renderTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach((panel) => {
        panel.style.display = panel.id === `tab-${btn.dataset.tab}` ? 'block' : 'none';
      });
    });
  });
}

function buildScheduleRows(schedule = {}) {
  const tbody = document.querySelector('#scheduleTable tbody');
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
  }
}

function readScheduleFromTable() {
  const schedule = {};
  for (const day of days) {
    const enabled = document.querySelector(`[data-day="${day.id}"][data-type="enabled"]`).checked;
    const start = document.querySelector(`[data-day="${day.id}"][data-type="start"]`).value;
    const end = document.querySelector(`[data-day="${day.id}"][data-type="end"]`).value;
    schedule[day.id] = enabled ? [{ start, end }] : [];
  }
  return schedule;
}

function fillSettings() {
  const form = document.getElementById('settingsForm');
  const settings = state.data.settings || {};
  for (const [k, v] of Object.entries(settings)) {
    if (form.elements[k]) {
      form.elements[k].value = v || '';
    }
  }
}

function renderServices() {
  const table = document.getElementById('servicesTable');
  table.innerHTML = `
    <thead><tr><th>Nome</th><th>Categoria</th><th>Preco</th><th>Duracao</th><th>Status</th><th>Acoes</th></tr></thead>
    <tbody>
      ${state.data.services
        .map(
          (s) => `
            <tr>
              <td>${s.name}</td>
              <td>${s.category || '-'}</td>
              <td>${Number(s.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
              <td>${durationLabel(s.duration)}</td>
              <td>${s.active === false ? 'Inativo' : 'Ativo'}</td>
              <td>
                <button class="btn outline" data-edit-service="${s.id}">Editar</button>
                <button class="btn outline" data-del-service="${s.id}">Excluir</button>
              </td>
            </tr>`
        )
        .join('')}
    </tbody>
  `;

  const select = document.getElementById('mostBookedServiceSelect');
  select.innerHTML = state.data.services
    .map((s) => `<option value="${s.id}">${s.name}</option>`)
    .join('');
}

function renderMostBooked() {
  const table = document.getElementById('mostBookedTable');
  table.innerHTML = `
    <thead><tr><th>Posicao</th><th>Titulo</th><th>Servico</th><th>Acoes</th></tr></thead>
    <tbody>
      ${state.data.mostBooked
        .sort((a, b) => Number(a.position || 999) - Number(b.position || 999))
        .map(
          (m) => `
            <tr>
              <td>${m.position || '-'}</td>
              <td>${m.label}</td>
              <td>${byName(state.data.services, m.serviceId)}</td>
              <td>
                <button class="btn outline" data-edit-most-booked="${m.id}">Editar</button>
                <button class="btn outline" data-del-most-booked="${m.id}">Excluir</button>
              </td>
            </tr>`
        )
        .join('')}
    </tbody>
  `;
}

function renderCatalog() {
  const table = document.getElementById('catalogTable');
  if (!table) return;

  table.innerHTML = `
    <thead><tr><th>Imagem</th><th>Titulo</th><th>Descricao</th><th>Posicao</th><th>Acoes</th></tr></thead>
    <tbody>
      ${[...state.data.catalog]
        .sort((a, b) => Number(a.position || 999) - Number(b.position || 999))
        .map(
          (c) => `
            <tr>
              <td>${c.image ? `<img class="catalog-thumb" src="${c.image}" alt="${c.title}" />` : '-'}</td>
              <td>${c.title || '-'}</td>
              <td>${c.subtitle || '-'}</td>
              <td>${c.position || '-'}</td>
              <td>
                <button class="btn outline" data-edit-catalog="${c.id}">Editar</button>
                <button class="btn outline" data-del-catalog="${c.id}">Excluir</button>
              </td>
            </tr>`
        )
        .join('')}
    </tbody>
  `;
}

function renderTeam() {
  const table = document.getElementById('teamTable');
  table.innerHTML = `
    <thead><tr><th>Nome</th><th>Cargo</th><th>Capacidade</th><th>WhatsApp</th><th>Instagram</th><th>Acoes</th></tr></thead>
    <tbody>
      ${state.data.team
        .map(
          (m) => `
            <tr>
              <td>${m.name}</td>
              <td>${m.role || '-'}</td>
              <td>${m.capacityPerSlot || 1}</td>
              <td>${m.whatsapp || '-'}</td>
              <td>${m.instagram || '-'}</td>
              <td>
                <button class="btn outline" data-edit-team="${m.id}">Editar</button>
                <button class="btn outline" data-del-team="${m.id}">Excluir</button>
              </td>
            </tr>`
        )
        .join('')}
    </tbody>
  `;
}

function renderReviews() {
  const table = document.getElementById('reviewsTable');
  table.innerHTML = `
    <thead><tr><th>Cliente</th><th>Nota</th><th>Comentario</th><th>Data</th><th>Acoes</th></tr></thead>
    <tbody>
      ${state.data.reviews
        .map(
          (r) => `
            <tr>
              <td>${r.author}</td>
              <td>${r.rating}</td>
              <td>${r.comment || '-'}</td>
              <td>${new Date(r.date).toLocaleDateString('pt-BR')}</td>
              <td><button class="btn outline" data-del-review="${r.id}">Excluir</button></td>
            </tr>`
        )
        .join('')}
    </tbody>
  `;
}

function renderAppointments() {
  renderDashboardStats();

  const table = document.getElementById('appointmentsTable');
  const grouped = state.data.appointments.reduce((acc, a) => {
    const key = `${a.teamId}-${a.date}`;
    acc[key] = acc[key] || 0;
    acc[key] += 1;
    return acc;
  }, {});

  table.innerHTML = `
    <thead><tr><th>Data</th><th>Hora</th><th>Cliente</th><th>Servico</th><th>Profissional</th><th>Carga do dia</th></tr></thead>
    <tbody>
      ${state.data.appointments
        .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
        .map((a) => {
          const totalDay = grouped[`${a.teamId}-${a.date}`] || 0;
          return `
            <tr>
              <td>${new Date(a.date).toLocaleDateString('pt-BR')}</td>
              <td>${a.time}</td>
              <td>${a.clientName}</td>
              <td>${byName(state.data.services, a.serviceId)}</td>
              <td>${byName(state.data.team, a.teamId)}</td>
              <td>${totalDay} agendamento(s)</td>
            </tr>`;
        })
        .join('')}
    </tbody>
  `;
}

function renderDashboardStats() {
  const todayIso = new Date().toISOString().slice(0, 10);
  const appointmentsToday = state.data.appointments.filter((a) => a.date === todayIso);

  const revenueToday = appointmentsToday.reduce((sum, appt) => {
    const service = state.data.services.find((s) => s.id === appt.serviceId);
    return sum + Number(service?.price || 0);
  }, 0);

  const uniqueClientsByPhone = new Set(
    appointmentsToday.map((a) => String(a.clientPhone || a.clientName || '').trim()).filter(Boolean)
  );

  const statAppointmentsToday = document.getElementById('statAppointmentsToday');
  const statRevenueToday = document.getElementById('statRevenueToday');
  const statNewClients = document.getElementById('statNewClients');
  const statActiveBarbers = document.getElementById('statActiveBarbers');
  const statServices = document.getElementById('statServices');
  const statReviews = document.getElementById('statReviews');

  if (statAppointmentsToday) statAppointmentsToday.textContent = String(appointmentsToday.length);
  if (statRevenueToday) statRevenueToday.textContent = money(revenueToday);
  if (statNewClients) statNewClients.textContent = String(uniqueClientsByPhone.size);
  if (statActiveBarbers) statActiveBarbers.textContent = String(state.data.team.length);
  if (statServices) statServices.textContent = String(state.data.services.filter((s) => s.active !== false).length);
  if (statReviews) statReviews.textContent = String(state.data.reviews.length);

  renderBarberPerformance();
}

function renderBarberPerformance() {
  const grid = document.getElementById('barberPerformanceGrid');
  if (!grid) return;

  const all = state.data.appointments;

  const rows = state.data.team.map((member) => {
    const appts = all.filter((a) => a.teamId === member.id);
    const revenue = appts.reduce((sum, a) => {
      const svc = state.data.services.find((s) => s.id === a.serviceId);
      return sum + Number(svc?.price || 0);
    }, 0);
    const uniqueClients = new Set(
      appts.map((a) => String(a.clientPhone || a.clientName || '').trim()).filter(Boolean)
    ).size;
    const initials = (member.name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

    // Top 3 services by count
    const svcCount = {};
    appts.forEach((a) => {
      const name = byName(state.data.services, a.serviceId);
      svcCount[name] = (svcCount[name] || 0) + 1;
    });
    const topSvcs = Object.entries(svcCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => `<span class="barber-tag">${name} <b>${count}x</b></span>`)
      .join('');

    return `
      <div class="barber-perf-card">
        <div class="barber-perf-header">
          <div class="barber-avatar">${initials}</div>
          <div class="barber-perf-name">${member.name || '—'}</div>
        </div>
        <div class="barber-perf-stats">
          <div class="barber-stat">
            <span class="barber-stat-label">Atendimentos</span>
            <span class="barber-stat-value">${appts.length}</span>
          </div>
          <div class="barber-stat">
            <span class="barber-stat-label">Clientes únicos</span>
            <span class="barber-stat-value">${uniqueClients}</span>
          </div>
          <div class="barber-stat barber-stat--highlight">
            <span class="barber-stat-label">Faturamento</span>
            <span class="barber-stat-value">${money(revenue)}</span>
          </div>
        </div>
        ${topSvcs ? `<div class="barber-perf-tags">${topSvcs}</div>` : ''}
      </div>`;
  });

  grid.innerHTML = rows.length
    ? rows.join('')
    : '<p class="muted">Nenhum barbeiro cadastrado.</p>';
}

function clearServiceForm() {
  const form = document.getElementById('serviceForm');
  form.reset();
  form.elements.id.value = '';
  form.elements.active.value = 'true';
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
  buildScheduleRows({});
}

async function loadData() {
  state.data = await api('/api/admin/data');
  state.data.catalog = Array.isArray(state.data.catalog) ? state.data.catalog : [];
  fillSettings();
  renderServices();
  renderMostBooked();
  renderCatalog();
  renderTeam();
  renderReviews();
  renderAppointments();
}

async function refreshAppointmentsOnly() {
  const appointments = await api('/api/admin/appointments');
  state.data.appointments = appointments;
  renderAppointments();
}

function startAppointmentsPolling() {
  if (appointmentsPollTimer) return;
  appointmentsPollTimer = setInterval(async () => {
    if (document.hidden) return;
    try {
      await refreshAppointmentsOnly();
    } catch (_err) {
      // Evita quebrar o painel por falha temporaria de rede.
    }
  }, 10000);

  document.addEventListener('visibilitychange', async () => {
    if (!document.hidden) {
      await sleep(200);
      await refreshAppointmentsOnly();
    }
  });
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

    document.getElementById('settingsFeedback').textContent = 'Configuracoes salvas.';
    await loadData();
  } catch (err) {
    document.getElementById('settingsFeedback').textContent = `Erro ao salvar: ${err.message}`;
    document.getElementById('settingsFeedback').style.color = '#c34828';
  }
}

async function saveService() {
  try {
    const form = document.getElementById('serviceForm');
    const data = formToJson(form);
    const duration = parseDurationInput(data.duration);
    if (!Number.isFinite(duration) || duration <= 0) {
      setFeedback('serviceFeedback', 'Duracao invalida. Use por exemplo 90 ou 1h30.', true);
      return;
    }

    const payload = {
      name: data.name,
      price: Number(data.price),
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
    setFeedback('serviceFeedback', 'Servico salvo com sucesso.');
    await loadData();
  } catch (err) {
    setFeedback('serviceFeedback', `Erro ao salvar servico: ${err.message}`, true);
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
    setFeedback('mostBookedFeedback', 'Item salvo com sucesso.');
    await loadData();
  } catch (err) {
    setFeedback('mostBookedFeedback', `Erro ao salvar item: ${err.message}`, true);
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
    setFeedback('catalogFeedback', 'Item do catalogo salvo com sucesso.');
    await loadData();
  } catch (err) {
    setFeedback('catalogFeedback', `Erro ao salvar catalogo: ${err.message}`, true);
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
      bio: data.bio,
      schedule: readScheduleFromTable()
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
    await loadData();
  } catch (err) {
    setFeedback('teamFeedback', `Erro ao salvar membro: ${err.message}`, true);
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
    setFeedback('reviewFeedback', 'Avaliacao cadastrada com sucesso.');
    await loadData();
  } catch (err) {
    setFeedback('reviewFeedback', `Erro ao cadastrar avaliacao: ${err.message}`, true);
  }
}

function wireActions() {
  document.getElementById('saveSettings').addEventListener('click', (e) => {
    e.preventDefault();
    saveSettings();
  });
  document.getElementById('saveService').addEventListener('click', (e) => {
    e.preventDefault();
    saveService();
  });
  document.getElementById('clearService').addEventListener('click', (e) => {
    e.preventDefault();
    clearServiceForm();
  });
  document.getElementById('saveMostBooked').addEventListener('click', (e) => {
    e.preventDefault();
    saveMostBooked();
  });
  document.getElementById('clearMostBooked').addEventListener('click', (e) => {
    e.preventDefault();
    clearMostBookedForm();
  });
  document.getElementById('saveCatalog').addEventListener('click', (e) => {
    e.preventDefault();
    saveCatalog();
  });
  document.getElementById('clearCatalog').addEventListener('click', (e) => {
    e.preventDefault();
    clearCatalogForm();
  });
  document.getElementById('saveTeam').addEventListener('click', (e) => {
    e.preventDefault();
    saveTeam();
  });
  document.getElementById('clearTeam').addEventListener('click', (e) => {
    e.preventDefault();
    clearTeamForm();
  });
  document.getElementById('saveReview').addEventListener('click', (e) => {
    e.preventDefault();
    saveReview();
  });

  document.addEventListener('click', async (e) => {
    const serviceEdit = e.target.closest('[data-edit-service]');
    const serviceDel = e.target.closest('[data-del-service]');
    const mbEdit = e.target.closest('[data-edit-most-booked]');
    const mbDel = e.target.closest('[data-del-most-booked]');
    const catalogEdit = e.target.closest('[data-edit-catalog]');
    const catalogDel = e.target.closest('[data-del-catalog]');
    const teamEdit = e.target.closest('[data-edit-team]');
    const teamDel = e.target.closest('[data-del-team]');
    const reviewDel = e.target.closest('[data-del-review]');

    if (serviceEdit) {
      const item = state.data.services.find((s) => s.id === serviceEdit.dataset.editService);
      const form = document.getElementById('serviceForm');
      Object.entries(item).forEach(([k, v]) => {
        if (form.elements[k]) form.elements[k].value = String(v);
      });
      form.elements.duration.value = durationLabel(item.duration).replace(' ', '');
      form.elements.active.value = item.active === false ? 'false' : 'true';
    }

    if (serviceDel) {
      await api(`/api/admin/services/${serviceDel.dataset.delService}`, { method: 'DELETE' });
      await loadData();
    }

    if (mbEdit) {
      const item = state.data.mostBooked.find((m) => m.id === mbEdit.dataset.editMostBooked);
      const form = document.getElementById('mostBookedForm');
      Object.entries(item).forEach(([k, v]) => {
        if (form.elements[k]) form.elements[k].value = String(v);
      });
    }

    if (mbDel) {
      await api(`/api/admin/most-booked/${mbDel.dataset.delMostBooked}`, { method: 'DELETE' });
      await loadData();
    }

    if (catalogEdit) {
      const item = state.data.catalog.find((c) => c.id === catalogEdit.dataset.editCatalog);
      const form = document.getElementById('catalogForm');
      Object.entries(item).forEach(([k, v]) => {
        if (form.elements[k]) form.elements[k].value = String(v ?? '');
      });
    }

    if (catalogDel) {
      await api(`/api/admin/catalog/${catalogDel.dataset.delCatalog}`, { method: 'DELETE' });
      await loadData();
    }

    if (teamEdit) {
      const item = state.data.team.find((m) => m.id === teamEdit.dataset.editTeam);
      const form = document.getElementById('teamForm');
      Object.entries(item).forEach(([k, v]) => {
        if (form.elements[k]) {
          form.elements[k].value = Array.isArray(v) ? '' : String(v ?? '');
        }
      });
      buildScheduleRows(item.schedule || {});
    }

    if (teamDel) {
      await api(`/api/admin/team/${teamDel.dataset.delTeam}`, { method: 'DELETE' });
      await loadData();
    }

    if (reviewDel) {
      await api(`/api/admin/reviews/${reviewDel.dataset.delReview}`, { method: 'DELETE' });
      await loadData();
    }
  });
}

async function init() {
  renderTabs();
  buildScheduleRows({});
  wireActions();
  await loadData();
  startAppointmentsPolling();
}

init();
