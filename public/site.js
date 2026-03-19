function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const AUTH_STORAGE_KEY = 'adminFirebaseSession';
let currentAuthSession = null;

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

async function refreshTokenIfNeeded(session, storage) {
  const expiresAt = Number(session?.expiresAt || 0);
  if (expiresAt - Date.now() > 60 * 1000) {
    return session;
  }

  const cfgRes = await fetch('/api/firebase/config');
  const cfg = await cfgRes.json().catch(() => ({}));
  const apiKey = String(cfg.apiKey || '');
  if (!apiKey || !session?.refreshToken) {
    return session;
  }

  const tokenRes = await fetch(`https://securetoken.googleapis.com/v1/token?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(String(session.refreshToken || ''))}`
  });

  const tokenBody = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok) {
    return session;
  }

  const updated = {
    idToken: String(tokenBody.id_token || session.idToken || ''),
    refreshToken: String(tokenBody.refresh_token || session.refreshToken || ''),
    expiresAt: Date.now() + Number(tokenBody.expires_in || 3600) * 1000
  };

  saveStoredSession(updated, storage);
  return updated;
}

async function loadProfileFromSession() {
  const stored = getStoredSession();
  if (!stored?.data?.idToken) {
    currentAuthSession = null;
    return null;
  }

  const session = await refreshTokenIfNeeded(stored.data, stored.storage);
  if (!session?.idToken) {
    currentAuthSession = null;
    return null;
  }

  currentAuthSession = session;

  const res = await fetch('/api/auth/profile', {
    headers: { Authorization: `Bearer ${session.idToken}` }
  });
  if (!res.ok) {
    currentAuthSession = null;
    return null;
  }
  return res.json().catch(() => null);
}

function renderTopbarAuth(profile) {
  const loginLink = document.getElementById('loginLink');
  const profileLink = document.getElementById('profileLink');
  const adminLink = document.getElementById('adminLink');
  const userWrap = document.getElementById('topbarUserInfo');
  const userAvatar = document.getElementById('topbarUserAvatar');
  const userName = document.getElementById('topbarUserName');
  const userEmail = document.getElementById('topbarUserEmail');

  if (!loginLink || !profileLink || !userWrap || !userAvatar || !userName || !userEmail) {
    return;
  }

  if (!profile) {
    loginLink.hidden = false;
    profileLink.hidden = true;
    if (adminLink) adminLink.hidden = true;
    userWrap.hidden = true;
    userAvatar.src = buildAvatarDataUri('U');
    return;
  }

  const fallbackAvatar = buildAvatarDataUri(profile.displayName || profile.email || 'U');
  const safePhoto = getSafePhotoUrl(profile.photoUrl);
  loginLink.hidden = true;
  profileLink.hidden = false;
  if (adminLink) adminLink.hidden = !Boolean(profile?.isAdmin);
  userWrap.hidden = false;
  userName.textContent = profile.displayName || 'Usuario';
  userEmail.textContent = profile.email || '';
  userAvatar.onerror = () => {
    userAvatar.onerror = null;
    userAvatar.src = fallbackAvatar;
  };
  userAvatar.src = safePhoto || fallbackAvatar;
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

function buildAvatarDataUri(name) {
  const text = encodeURIComponent(initials(name));
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='100%' height='100%' rx='32' fill='#0f172a'/><text x='50%' y='55%' dominant-baseline='middle' text-anchor='middle' font-family='Segoe UI, Arial, sans-serif' font-size='26' font-weight='700' fill='#f8fafc'>${text}</text></svg>`;
  return `data:image/svg+xml;utf8,${svg}`;
}

function stars(n) {
  return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
}

function initials(name) {
  return String(name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || '?';
}

function durationLabel(minutes) {
  const total = Number(minutes || 0);
  if (!Number.isFinite(total) || total <= 0) return '-';
  if (total < 60) return `${total}min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}

function waLink(phone) {
  const digits = String(phone || '').replace(/\D+/g, '');
  return digits ? `https://wa.me/55${digits}` : '#';
}

function groupByCategory(services) {
  const grouped = new Map();
  (services || []).forEach((service) => {
    const category = String(service?.category || 'Geral').trim() || 'Geral';
    if (!grouped.has(category)) {
      grouped.set(category, []);
    }
    grouped.get(category).push(service);
  });
  return grouped;
}

function renderMostBooked(items, services) {
  const track = document.getElementById('mostBooked');
  const prev = document.getElementById('mostPrev');
  const next = document.getElementById('mostNext');
  if (!track) return;

  track.innerHTML = '';
  const serviceMap = new Map((services || []).map((service) => [service.id, service]));
  const sorted = [...(items || [])].sort((a, b) => Number(a.position || 999) - Number(b.position || 999));

  sorted.forEach((item) => {
    const service = serviceMap.get(item.serviceId) || null;
    const title = String(item.label || service?.name || 'Mais agendado').trim();
    const subtitle = String(item.subtitle || service?.description || '').trim();
    const duration = durationLabel(service?.duration || 0);
    const price = service ? money(service.price || 0) : 'Consulte';
    const href = service?.id ? `/agendar.html?serviceId=${encodeURIComponent(service.id)}` : '/agendar.html';

    const slide = document.createElement('div');
    slide.className = 'most-booked-slide';
    slide.innerHTML = `
      <article class="service-card most-booked-widget">
        <div class="service-info">
          <h3>${title}</h3>
          <span class="duration">${duration}</span>
        </div>
        <p class="service-desc">${subtitle || 'Serviço em destaque para seu próximo atendimento.'}</p>
        <div class="service-footer">
          <span class="price">${price}</span>
          <a class="btn-agendar" href="${href}">Agendar</a>
        </div>
      </article>
    `;
    track.appendChild(slide);
  });

  if (!track.children.length) {
    track.innerHTML = '<p class="muted">Destaques em atualização.</p>';
  }

  if (!prev || !next) return;

  const getStep = () => {
    const firstSlide = track.querySelector('.most-booked-slide');
    const slideWidth = Math.round(firstSlide?.getBoundingClientRect().width || 160);
    const computed = getComputedStyle(track);
    const gap = Math.round(parseFloat(computed.columnGap || computed.gap || '0') || 0);
    // Passo um pouco menor que 1 card para evitar "pulo" exagerado no mobile.
    return Math.max(96, Math.round((slideWidth + gap) * 0.9));
  };

  const updateArrows = () => {
    const maxLeft = Math.max(0, track.scrollWidth - track.clientWidth - 2);
    prev.disabled = track.scrollLeft <= 2;
    next.disabled = track.scrollLeft >= maxLeft;
  };

  prev.onclick = () => {
    track.scrollBy({ left: -getStep(), behavior: 'smooth' });
  };
  next.onclick = () => {
    track.scrollBy({ left: getStep(), behavior: 'smooth' });
  };

  track.onscroll = updateArrows;
  requestAnimationFrame(updateArrows);
}

function renderServices(services) {
  const root = document.getElementById('serviceGroups');
  if (!root) return;

  root.innerHTML = '';
  const active = (services || []).filter((service) => service?.active !== false);
  const grouped = groupByCategory(active);

  if (!grouped.size) {
    root.innerHTML = '<p class="muted">Serviços em atualização.</p>';
    return;
  }

  let categoryIndex = 0;
  grouped.forEach((items, category) => {
    const section = document.createElement('article');
    section.className = `accordion-item${categoryIndex === 0 ? ' open' : ''}`;

    const list = items
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
      .map((service) => `
        <div class="service-item">
          <button class="service-head" type="button" aria-expanded="false">
            <span class="service-title">${service.name || 'Serviço'}</span>
            <span class="chevron">▾</span>
          </button>
          <div class="service-body">
            <p class="service-description">${service.description || 'Descrição em atualização.'}</p>
            <div class="service-row">
              <span class="duration">${durationLabel(service.duration || 0)}</span>
              <span class="price">${money(service.price || 0)}</span>
            </div>
            <a class="btn-agendar schedule-btn" href="/agendar.html?serviceId=${encodeURIComponent(service.id || '')}">Agendar</a>
          </div>
        </div>
      `)
      .join('');

    section.innerHTML = `
      <button class="accordion-head" type="button" aria-expanded="${categoryIndex === 0 ? 'true' : 'false'}">
        <span>${category}</span>
        <span class="chevron">▾</span>
      </button>
      <div class="accordion-content">${list}</div>
    `;

    root.appendChild(section);
    categoryIndex += 1;
  });

  root.onclick = (event) => {
    const head = event.target.closest('.accordion-head');
    if (head) {
      const section = head.closest('.accordion-item');
      if (!section) return;
      const willOpen = !section.classList.contains('open');
      section.classList.toggle('open', willOpen);
      head.setAttribute('aria-expanded', String(willOpen));
      return;
    }

    const svcBtn = event.target.closest('.service-head');
    if (!svcBtn) return;
    const card = svcBtn.closest('.service-item');
    if (!card) return;
    const open = card.classList.toggle('open');
    svcBtn.setAttribute('aria-expanded', String(open));
  };
}

function renderTeam(team) {
  const root = document.getElementById('team');
  root.innerHTML = '';

  if (!team.length) {
    root.innerHTML = '<p class="muted">Equipe em atualização.</p>';
    return;
  }

  team.forEach((member) => {
    const card = document.createElement('article');
    card.className = 'team-card';
    const photo = String(member.photo || '').trim();
    const igRaw = String(member.instagram || '').trim();
    const ig = igRaw
      ? (igRaw.startsWith('http://') || igRaw.startsWith('https://') ? igRaw : `https://instagram.com/${igRaw.replace(/^@/, '')}`)
      : '#';
    const wa = waLink(member.whatsapp);
    const memberInitials = initials(member.name);

    card.innerHTML = `
      <div class="team-photo-wrap">
        ${photo
          ? `<img class="team-photo" src="${photo}" alt="${member.name}" />`
          : `<div class="team-avatar-fallback">${memberInitials}</div>`}
      </div>
      <h4>${member.name}</h4>
      <p>${member.role || 'Barbeiro(a)'}</p>
      <p>Recomendações: ${member.likes || 0}</p>
      <div class="socials">
        <a class="pill" href="${wa}" target="_blank" rel="noreferrer">WhatsApp</a>
        <a class="pill" href="${ig}" target="_blank" rel="noreferrer">Instagram</a>
      </div>
    `;

    root.appendChild(card);
  });
}

function renderCatalog(items) {
  const root = document.getElementById('catalogGrid');
  if (!root) return;

  root.innerHTML = '';
  const sorted = [...(items || [])].sort((a, b) => Number(a.position || 999) - Number(b.position || 999));

  sorted.forEach((item) => {
    if (!item?.image) return;
    const card = document.createElement('article');
    card.className = 'catalog-card';
    card.innerHTML = `
      <img class="catalog-photo" src="${item.image}" alt="${item.title || 'Corte'}" />
      <div class="catalog-info">
        <h3>${item.title || 'Corte'}</h3>
        <p>${item.subtitle || ''}</p>
      </div>
    `;
    root.appendChild(card);
  });

  if (!root.children.length) {
    root.innerHTML = '<p class="muted">Catálogo em atualização.</p>';
  }
}

function renderReviews(reviews) {
  const root = document.getElementById('reviews');
  root.innerHTML = '';
  reviews.forEach((review) => {
    const row = document.createElement('div');
    row.className = 'review';
    const note = Number(review.rating || 5);
    row.innerHTML = `
      <div><strong>${note.toFixed(1)}</strong> <span class="stars">${stars(note)}</span></div>
      <div>${review.comment || '(Sem comentário)'}</div>
      <div class="muted">${review.author}, em ${new Date(review.date).toLocaleDateString('pt-BR')}</div>
    `;
    root.appendChild(row);
  });
}

function setupPublicReviewForm(initialReviews, profile) {
  const openBtn = document.getElementById('openReviewForm');
  const form = document.getElementById('reviewPublicForm');
  const cancelBtn = document.getElementById('cancelReviewForm');
  const authorInput = document.getElementById('reviewPublicAuthor');
  const commentInput = document.getElementById('reviewPublicComment');
  const ratingInput = document.getElementById('reviewPublicRating');
  const feedback = document.getElementById('reviewPublicFeedback');

  if (!openBtn || !form || !cancelBtn || !commentInput || !ratingInput || !feedback) {
    return;
  }

  let reviewsCache = Array.isArray(initialReviews) ? [...initialReviews] : [];
  const fallbackAuthor = String(profile?.displayName || profile?.email || '').trim();
  if (authorInput && fallbackAuthor && !authorInput.value.trim()) {
    authorInput.value = fallbackAuthor;
  }

  const setFormVisible = (visible) => {
    form.hidden = !visible;
    openBtn.hidden = visible;
    if (visible) {
      commentInput.focus();
    }
  };

  openBtn.addEventListener('click', () => setFormVisible(true));
  cancelBtn.addEventListener('click', () => {
    form.reset();
    if (authorInput && fallbackAuthor) authorInput.value = fallbackAuthor;
    feedback.textContent = '';
    setFormVisible(false);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const author = String(authorInput?.value || '').trim();
    const comment = String(commentInput.value || '').trim();
    const rating = Number(ratingInput.value || 5);

    if (comment.length < 3) {
      feedback.textContent = 'Escreva uma observacao com pelo menos 3 caracteres.';
      return;
    }

    feedback.textContent = 'Enviando observacao...';

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const response = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author, comment, rating })
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.message || 'Nao foi possivel enviar sua observacao.');
      }

      reviewsCache = [body, ...reviewsCache];
      renderReviews(reviewsCache);

      form.reset();
      if (authorInput && fallbackAuthor) authorInput.value = fallbackAuthor;
      feedback.textContent = 'Observacao enviada com sucesso!';
      setFormVisible(false);
    } catch (error) {
      feedback.textContent = error.message || 'Erro ao enviar observacao.';
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

async function init() {
  const profile = await loadProfileFromSession().catch(() => null);
  renderTopbarAuth(profile);

  const response = await fetch('/api/site');
  const data = await response.json();

  const settings = data.settings || {};
  const slug = settings.slug || 'barbearia';
  const publicUrl = `${window.location.origin}/${slug}`;

  document.getElementById('brandName').textContent = settings.barbershopName || 'Barbearia';
  document.getElementById('heroTitle').textContent = settings.barbershopName || 'Barbearia';
  document.getElementById('heroTagline').textContent = settings.tagline || '';
  document.getElementById('descriptionTitle').textContent = settings.descriptionTitle || '';
  document.getElementById('descriptionText').textContent = settings.descriptionText || '';
  document.getElementById('siteSlugUrl').textContent = publicUrl;
  document.getElementById('paymentMethods').textContent = settings.paymentMethods || '';
  document.getElementById('facilities').textContent = settings.facilities || '';
  document.getElementById('address').textContent = settings.address || '';
  document.getElementById('phone').textContent = settings.phone || '';

  const heroImage = document.getElementById('heroImage');
  const heroImageBackdrop = document.getElementById('heroImageBackdrop');
  if (settings.heroImage) {
    heroImage.src = settings.heroImage;
    heroImage.hidden = false;
    heroImageBackdrop.src = settings.heroImage;
    heroImageBackdrop.hidden = false;
  } else {
    heroImage.removeAttribute('src');
    heroImage.hidden = true;
    heroImageBackdrop.removeAttribute('src');
    heroImageBackdrop.hidden = true;
  }

  renderMostBooked(data.mostBooked || [], data.services || []);
  renderServices(data.services || []);
  renderCatalog(data.catalog || []);
  renderTeam(data.team || []);
  renderReviews(data.reviews || []);
  setupPublicReviewForm(data.reviews || [], profile);
}

init();
