require('dotenv').config({ quiet: true });

const express = require('express');
const fsSync = require('fs');
const fs = require('fs/promises');
const path = require('path');
const dayjs = require('dayjs');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 3030;

const DATA_PATH = path.join(__dirname, 'data', 'store.json');
const FIREBASE_STORE_COLLECTION = process.env.FIREBASE_STORE_COLLECTION || 'barbeariaApp';
const FIREBASE_STORE_DOC = process.env.FIREBASE_STORE_DOC || 'store';
const FIREBASE_WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY || process.env.FIREBASE_API_KEY || '';
const FIREBASE_WEB_GOOGLE_CLIENT_ID = process.env.FIREBASE_WEB_GOOGLE_CLIENT_ID || '';
const FIREBASE_WEB_AUTH_DOMAIN = process.env.FIREBASE_WEB_AUTH_DOMAIN || '';
const FIREBASE_WEB_PROJECT_ID = process.env.FIREBASE_WEB_PROJECT_ID || '';
const FIREBASE_WEB_APP_ID = process.env.FIREBASE_WEB_APP_ID || '';
const APP_TIMEZONE = process.env.APP_TIMEZONE || 'America/Sao_Paulo';

function getNowInAppTimezone() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const parts = formatter
    .formatToParts(new Date())
    .reduce((acc, part) => {
      if (part.type !== 'literal') {
        acc[part.type] = part.value;
      }
      return acc;
    }, {});

  const isoDate = `${parts.year}-${parts.month}-${parts.day}`;
  const minutes = Number(parts.hour || 0) * 60 + Number(parts.minute || 0);
  return { isoDate, minutes };
}

function getBaseStore() {
  return {
    settings: {
      barbershopName: 'Barbearia',
      slug: 'barbearia',
      ownerId: '',
      plan: 'basic'
    },
    services: [],
    mostBooked: [],
    catalog: [],
    team: [],
    reviews: [],
    appointments: [],
    users: []
  };
}

function parseFirebaseServiceAccount() {
  const fromPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (fromPath) {
    try {
      const absolutePath = path.isAbsolute(fromPath)
        ? fromPath
        : path.join(__dirname, fromPath);
      const raw = fsSync.readFileSync(absolutePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed.private_key) {
        parsed.private_key = String(parsed.private_key).replace(/\\n/g, '\n');
      }
      return parsed;
    } catch {
      console.warn('FIREBASE_SERVICE_ACCOUNT_PATH invalido ou inacessivel.');
    }
  }

  const fromJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (fromJson) {
    try {
      const parsed = JSON.parse(fromJson);
      if (parsed.private_key) {
        parsed.private_key = String(parsed.private_key).replace(/\\n/g, '\n');
      }
      return parsed;
    } catch {
      console.warn('FIREBASE_SERVICE_ACCOUNT_JSON invalido.');
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKeyRaw) {
    return null;
  }

  return {
    project_id: projectId,
    client_email: clientEmail,
    private_key: String(privateKeyRaw).replace(/\\n/g, '\n')
  };
}

function initFirebaseAdmin() {
  const serviceAccount = parseFirebaseServiceAccount();
  try {
    if (!admin.apps.length) {
      if (serviceAccount) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
      } else {
        // Em Cloud Functions/Firebase usa credenciais padrao do ambiente.
        admin.initializeApp();
      }
    }
    return { enabled: true, firestore: admin.firestore() };
  } catch (error) {
    console.warn('Falha ao inicializar Firebase Admin:', error.message);
    return { enabled: false, firestore: null };
  }
}

const firebaseAdmin = initFirebaseAdmin();
const FIREBASE_STORE_ENABLED = firebaseAdmin.enabled;
const FIREBASE_AUTH_ENABLED = Boolean(FIREBASE_WEB_API_KEY) || FIREBASE_STORE_ENABLED;

function getFirestoreStoreRef() {
  return firebaseAdmin.firestore.collection(FIREBASE_STORE_COLLECTION).doc(FIREBASE_STORE_DOC);
}

async function verifyFirebaseToken(token) {
  if (FIREBASE_STORE_ENABLED) {
    const decoded = await admin.auth().verifyIdToken(token);
    let authUser = null;

    try {
      authUser = await admin.auth().getUser(String(decoded.uid || ''));
    } catch {
      authUser = null;
    }

    return {
      uid: String(decoded.uid || ''),
      email: String(decoded.email || authUser?.email || ''),
      name: String(decoded.name || authUser?.displayName || ''),
      picture: String(decoded.picture || authUser?.photoURL || '')
    };
  }

  if (!FIREBASE_WEB_API_KEY) {
    throw new Error('Firebase web API key nao configurada.');
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_WEB_API_KEY)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token })
    }
  );

  const body = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(body.users) || !body.users.length) {
    throw new Error('Token invalido.');
  }

  const user = body.users[0];
  return {
    uid: String(user.localId || ''),
    email: String(user.email || ''),
    name: String(user.displayName || ''),
    picture: String(user.photoUrl || '')
  };
}

async function imageUrlToDataUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (/^data:image\//i.test(raw)) return raw;
  if (!/^https?:\/\//i.test(raw)) return '';

  try {
    const response = await fetch(raw);
    if (!response.ok) return '';

    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.startsWith('image/')) return '';

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > 2 * 1024 * 1024) return '';

    const mime = contentType.split(';')[0] || 'image/jpeg';
    return `data:${mime};base64,${buffer.toString('base64')}`;
  } catch {
    return '';
  }
}

async function normalizePhotoForStorage(photoValue, fallbackValue = '') {
  const value = String(photoValue || '').trim();
  const fallback = String(fallbackValue || '').trim();

  if (!value) return fallback;
  if (/^data:image\//i.test(value)) return value;

  const converted = await imageUrlToDataUrl(value);
  if (converted) return converted;

  return fallback;
}

function slugify(value, fallback = 'barbearia') {
  return String(value || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;
}

function normalizePlan(value) {
  return String(value || '').toLowerCase() === 'pro' ? 'pro' : 'basic';
}

function normalizeSettings(settings = {}) {
  const barbershopName = String(settings.barbershopName || 'Barbearia').trim();
  return {
    ...settings,
    barbershopName,
    slug: slugify(settings.slug || barbershopName),
    ownerId: String(settings.ownerId || '').trim(),
    plan: normalizePlan(settings.plan)
  };
}

app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/firebase/config', (_req, res) => {
  res.json({
    authEnabled: FIREBASE_AUTH_ENABLED,
    apiKey: FIREBASE_WEB_API_KEY,
    googleClientId: FIREBASE_WEB_GOOGLE_CLIENT_ID,
    authDomain: FIREBASE_WEB_AUTH_DOMAIN,
    projectId: FIREBASE_WEB_PROJECT_ID,
    appId: FIREBASE_WEB_APP_ID
  });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, authEnabled: FIREBASE_AUTH_ENABLED });
});

app.get('/cliente', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dono', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

async function ensureDataFile() {
  if (FIREBASE_AUTH_ENABLED) {
    return;
  }

  try {
    await fs.access(DATA_PATH);
  } catch {
    const base = getBaseStore();
    await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
    await fs.writeFile(DATA_PATH, JSON.stringify(base, null, 2), 'utf8');
  }
}

async function readStore() {
  let store;

  if (FIREBASE_STORE_ENABLED) {
    const docRef = getFirestoreStoreRef();
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      store = getBaseStore();
      await docRef.set(store);
    } else {
      store = snapshot.data() || getBaseStore();
    }
  } else {
    await ensureDataFile();
    const raw = await fs.readFile(DATA_PATH, 'utf8');
    store = JSON.parse(raw);
  }

  store.settings = normalizeSettings(store.settings || {});
  store.services = Array.isArray(store.services) ? store.services : [];
  store.mostBooked = Array.isArray(store.mostBooked) ? store.mostBooked : [];
  store.catalog = Array.isArray(store.catalog) ? store.catalog : [];
  store.team = Array.isArray(store.team) ? store.team : [];
  store.reviews = Array.isArray(store.reviews) ? store.reviews : [];
  store.appointments = Array.isArray(store.appointments) ? store.appointments : [];
  store.users = Array.isArray(store.users) ? store.users : [];
  return store;
}

async function writeStore(data) {
  if (FIREBASE_STORE_ENABLED) {
    await getFirestoreStoreRef().set(data);
    return;
  }

  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function getBearerToken(req) {
  const authHeader = String(req.headers.authorization || '');
  if (!authHeader.toLowerCase().startsWith('bearer ')) return '';
  return authHeader.slice(7).trim();
}

async function requireAdminAuth(req, res, next) {
  if (!FIREBASE_AUTH_ENABLED) {
    return next();
  }

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ message: 'Login necessario para acessar o admin.' });
  }

  try {
    const decoded = await verifyFirebaseToken(token);
    req.authUser = decoded;

    const store = await readStore();
    const ownerId = String(store.settings?.ownerId || '').trim();
    const savedUser = (store.users || []).find((item) => String(item.uid || '').trim() === String(decoded.uid || '').trim()) || null;
    const hasAdminRole = String(savedUser?.role || '').trim().toLowerCase() === 'admin';
    if (ownerId && ownerId !== decoded.uid && !hasAdminRole) {
      return res.status(403).json({ message: 'Usuario sem permissao para este painel.' });
    }

    return next();
  } catch {
    return res.status(401).json({ message: 'Sessao invalida. Faca login novamente.' });
  }
}

async function requireUserAuth(req, res, next) {
  if (!FIREBASE_AUTH_ENABLED) {
    return res.status(503).json({ message: 'Login Firebase nao configurado no servidor.' });
  }

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ message: 'Token de acesso nao enviado.' });
  }

  try {
    req.authUser = await verifyFirebaseToken(token);
    return next();
  } catch {
    return res.status(401).json({ message: 'Token invalido. Faca login novamente.' });
  }
}

app.use('/api/admin', requireAdminAuth);

app.post('/api/auth/session', requireUserAuth, async (req, res) => {
  const store = await readStore();
  const settings = normalizeSettings(store.settings);
  const user = req.authUser;
  const now = new Date().toISOString();
  const idx = store.users.findIndex((item) => item.uid === user.uid);
  const existingPhoto = idx >= 0 ? String(store.users[idx].photoUrl || '').trim() : '';
  const incomingPhoto = String(req.body?.photoUrl || '').trim();
  const photoUrl = await normalizePhotoForStorage(incomingPhoto || user.picture || '', existingPhoto);

  const nextUser = {
    uid: user.uid,
    email: String(user.email || '').trim(),
    displayName: String(user.name || req.body?.displayName || '').trim(),
    photoUrl,
    role: (settings.ownerId && settings.ownerId === user.uid)
      || (idx >= 0 && String(store.users[idx].role || '').trim().toLowerCase() === 'admin')
      ? 'admin'
      : 'user',
    createdAt: idx >= 0 ? store.users[idx].createdAt || now : now,
    lastLoginAt: now,
    phone: idx >= 0 ? String(store.users[idx].phone || '') : ''
  };

  if (idx >= 0) {
    store.users[idx] = { ...store.users[idx], ...nextUser };
  } else {
    store.users.push(nextUser);
  }

  await writeStore(store);

  return res.json({
    ok: true,
    user: nextUser,
    isAdmin: nextUser.role === 'admin'
  });
});

app.get('/api/auth/profile', requireUserAuth, async (req, res) => {
  const store = await readStore();
  const settings = normalizeSettings(store.settings);
  const user = req.authUser;
  const saved = store.users.find((item) => item.uid === user.uid) || null;

  return res.json({
    uid: user.uid,
    email: String(user.email || ''),
    displayName: saved?.displayName || String(user.name || ''),
    photoUrl: String(saved?.photoUrl || user.picture || ''),
    phone: String(saved?.phone || ''),
    isAdmin: settings.ownerId
      ? settings.ownerId === user.uid || String(saved?.role || '').trim().toLowerCase() === 'admin'
      : String(saved?.role || '').trim().toLowerCase() === 'admin'
  });
});

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

app.put('/api/auth/profile', requireUserAuth, async (req, res) => {
  const store = await readStore();
  const user = req.authUser;
  const now = new Date().toISOString();
  const idx = store.users.findIndex((item) => item.uid === user.uid);

  const incomingDisplayName = String(req.body?.displayName || '').trim();
  const incomingPhone = String(req.body?.phone || '').trim();
  const incomingPhotoUrl = String(req.body?.photoUrl || '').trim();

  const base = idx >= 0 ? store.users[idx] : {
    uid: user.uid,
    email: String(user.email || '').trim(),
    createdAt: now,
    role: 'user'
  };

  const normalizedPhoto = await normalizePhotoForStorage(
    incomingPhotoUrl || String(user.picture || '').trim(),
    String(base.photoUrl || '').trim()
  );

  const updated = {
    ...base,
    uid: user.uid,
    email: String(user.email || base.email || '').trim(),
    displayName: incomingDisplayName || base.displayName || '',
    photoUrl: normalizedPhoto,
    phone: incomingPhone,
    lastLoginAt: now
  };

  if (idx >= 0) {
    store.users[idx] = updated;
  } else {
    store.users.push(updated);
  }

  await writeStore(store);
  return res.json({ ok: true, user: updated });
});

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

app.get('/api/auth/appointments', requireUserAuth, async (req, res) => {
  const store = await readStore();
  const user = req.authUser;
  const saved = store.users.find((item) => item.uid === user.uid) || null;

  const userEmail = String(user.email || '').trim().toLowerCase();
  const userPhone = digitsOnly(saved?.phone || '');

  const serviceMap = new Map((store.services || []).map((item) => [item.id, item]));
  const teamMap = new Map((store.team || []).map((item) => [item.id, item]));

  const appointments = (store.appointments || [])
    .filter((appt) => {
      if (String(appt.userUid || '').trim() === String(user.uid || '').trim()) {
        return true;
      }

      const apptEmail = String(appt.clientEmail || appt.userEmail || '').trim().toLowerCase();
      if (apptEmail && userEmail && apptEmail === userEmail) {
        return true;
      }

      const apptPhone = digitsOnly(appt.clientPhone || '');
      if (apptPhone && userPhone && apptPhone === userPhone) {
        return true;
      }

      return false;
    })
    .map((appt) => {
      const service = serviceMap.get(appt.serviceId);
      const member = teamMap.get(appt.teamId);
      return {
        ...appt,
        serviceName: service?.name || 'Servico',
        servicePrice: Number(service?.price || 0),
        serviceDuration: Number(service?.duration || 0),
        teamName: member?.name || 'Profissional'
      };
    })
    .sort((a, b) => {
      const dateCmp = String(b.date || '').localeCompare(String(a.date || ''));
      if (dateCmp !== 0) return dateCmp;
      return String(b.time || '').localeCompare(String(a.time || ''));
    });

  return res.json({ appointments });
});

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

function isValidBase64Image(value) {
  return /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=\n\r]+$/.test(String(value || ''));
}

function parseDurationToMinutes(value, fallback = 30) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(5, Math.round(value));
  }

  const text = String(value || '').trim().toLowerCase();
  if (!text) return fallback;

  if (/^\d+$/.test(text)) {
    return Math.max(5, Number(text));
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
    return fallback;
  }

  const total = hours * 60 + minutes;
  return Math.max(5, total || fallback);
}

function parseMinutes(time) {
  const [h, m] = String(time || '00:00').split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(total) {
  const h = String(Math.floor(total / 60)).padStart(2, '0');
  const m = String(total % 60).padStart(2, '0');
  return `${h}:${m}`;
}

function normalizeSchedule(schedule) {
  const clean = {};
  for (let day = 0; day <= 6; day += 1) {
    const ranges = Array.isArray(schedule?.[day]) ? schedule[day] : [];
    clean[day] = ranges
      .filter((r) => r && r.start && r.end && parseMinutes(r.end) > parseMinutes(r.start))
      .map((r) => ({ start: r.start, end: r.end }));
  }
  return clean;
}

function normalizeCapacityPerSlot(value) {
  return 1;
}

function normalizeSlotStepMinutes(value) {
  return Number(value) === 15 ? 15 : 60;
}

function normalizeSlotStepMode(value) {
  return String(value || '').toLowerCase() === 'fixed' ? 'fixed' : 'auto';
}

function memberCanServe(member, serviceId) {
  if (!Array.isArray(member.serviceIds) || member.serviceIds.length === 0) {
    return true;
  }
  return member.serviceIds.includes(serviceId);
}

function generateSlots(startMin, endMin, serviceDuration, slotStep) {
  const slots = [];
  for (let cursor = startMin; cursor + serviceDuration <= endMin; cursor += slotStep) {
    slots.push(cursor);
  }
  return slots;
}

function buildSlots(member, service, dateStr, appointments, allServices) {
  const day = dayjs(dateStr).day();
  const ranges = member.schedule?.[day] || [];
  const slots = [];
  const capacityPerSlot = normalizeCapacityPerSlot(member.capacityPerSlot);
  const serviceDuration = Number(service.duration || 30);
  const slotStepMode = normalizeSlotStepMode(member.slotStepMode);
  const slotStep = slotStepMode === 'auto'
    ? Math.max(1, Math.round(serviceDuration || 30))
    : normalizeSlotStepMinutes(member.slotStepMinutes);
  const nowInAppTz = getNowInAppTimezone();
  const isToday = String(dateStr || '') === nowInAppTz.isoDate;
  const currentMinutes = nowInAppTz.minutes;

  const memberAppts = appointments.filter(
    (a) => a.teamId === member.id && a.date === dateStr && a.status !== 'cancelled'
  );

  for (const range of ranges) {
    const startMin = parseMinutes(range.start);
    const endMin = parseMinutes(range.end);

    for (const cursor of generateSlots(startMin, endMin, serviceDuration, slotStep)) {
      if (isToday && cursor < currentMinutes) {
        continue;
      }

      const time = minutesToTime(cursor);
      const used = memberAppts.filter((a) => {
        const aStart = parseMinutes(a.time);
        const aSvc = (allServices || []).find((s) => s.id === a.serviceId);
        const aDuration = Number(aSvc?.duration || 30);
        return cursor < aStart + aDuration && cursor + serviceDuration > aStart;
      }).length;

      slots.push({
        time,
        remaining: Math.max(0, capacityPerSlot - used),
        full: used >= capacityPerSlot
      });
    }
  }

  return slots;
}

app.get('/api/site', async (_req, res) => {
  const store = await readStore();
  const settings = normalizeSettings(store.settings);
  const activeServices = store.services.filter((s) => s.active !== false);
  const mostBooked = [...store.mostBooked].sort((a, b) => Number(a.position || 999) - Number(b.position || 999));
  const catalog = [...store.catalog].sort((a, b) => Number(a.position || 999) - Number(b.position || 999));
  res.json({
    settings,
    services: activeServices,
    mostBooked,
    catalog,
    team: store.team,
    reviews: store.reviews
  });
});

app.get('/api/admin/data', async (_req, res) => {
  const store = await readStore();
  store.settings = normalizeSettings(store.settings);
  res.json(store);
});

app.put('/api/admin/settings', async (req, res) => {
  const store = await readStore();
  store.settings = normalizeSettings({ ...store.settings, ...req.body });
  await writeStore(store);
  res.json(store.settings);
});

app.post('/api/admin/users/grant-admin', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!isValidEmail(email)) {
    return res.status(400).json({ message: 'Informe um email valido.' });
  }

  const store = await readStore();
  const ownerId = String(store.settings?.ownerId || '').trim();
  if (FIREBASE_AUTH_ENABLED && ownerId && String(req.authUser?.uid || '').trim() !== ownerId) {
    return res.status(403).json({ message: 'Somente o dono pode adicionar novos administradores.' });
  }

  const idx = (store.users || []).findIndex((item) => String(item.email || '').trim().toLowerCase() === email);
  if (idx === -1) {
    return res.status(404).json({ message: 'Usuario nao encontrado. Peca para esse email fazer login pelo menos uma vez.' });
  }

  const current = store.users[idx] || {};
  const updated = {
    ...current,
    email: String(current.email || email).trim(),
    role: 'admin'
  };

  store.users[idx] = updated;
  await writeStore(store);

  return res.json({
    ok: true,
    user: {
      uid: updated.uid,
      email: updated.email,
      displayName: updated.displayName || '',
      role: updated.role
    }
  });
});

app.post('/api/admin/services', async (req, res) => {
  const store = await readStore();
  const service = {
    id: uid('svc'),
    name: req.body.name || 'Novo servico',
    price: Number(req.body.price || 0),
    duration: parseDurationToMinutes(req.body.duration, 30),
    category: req.body.category || 'Geral',
    active: req.body.active !== false,
    description: req.body.description || ''
  };
  store.services.push(service);
  await writeStore(store);
  res.status(201).json(service);
});

app.put('/api/admin/services/:id', async (req, res) => {
  const store = await readStore();
  const idx = store.services.findIndex((s) => s.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ message: 'Servico nao encontrado' });
  }
  store.services[idx] = {
    ...store.services[idx],
    ...req.body,
    price: Number(req.body.price ?? store.services[idx].price),
    duration: parseDurationToMinutes(req.body.duration, store.services[idx].duration)
  };
  await writeStore(store);
  return res.json(store.services[idx]);
});

app.delete('/api/admin/services/:id', async (req, res) => {
  const store = await readStore();
  store.services = store.services.filter((s) => s.id !== req.params.id);
  store.mostBooked = store.mostBooked.filter((m) => m.serviceId !== req.params.id);
  await writeStore(store);
  res.status(204).send();
});

app.post('/api/admin/team', async (req, res) => {
  const store = await readStore();
  const settings = normalizeSettings(store.settings);
  if (settings.plan === 'basic' && store.team.length >= 2) {
    return res.status(403).json({ message: 'Plano basic permite ate 2 barbeiros.' });
  }

  const member = {
    id: uid('tm'),
    name: req.body.name || 'Novo profissional',
    role: req.body.role || 'Barbeiro(a)',
    bio: req.body.bio || '',
    photo: req.body.photo || '',
    likes: Number(req.body.likes || 0),
    whatsapp: req.body.whatsapp || '',
    instagram: req.body.instagram || '',
    capacityPerSlot: normalizeCapacityPerSlot(req.body.capacityPerSlot),
    slotStepMode: normalizeSlotStepMode(req.body.slotStepMode),
    slotStepMinutes: normalizeSlotStepMinutes(req.body.slotStepMinutes),
    serviceIds: Array.isArray(req.body.serviceIds) ? req.body.serviceIds : [],
    schedule: normalizeSchedule(req.body.schedule || {})
  };

  store.team.push(member);
  await writeStore(store);
  res.status(201).json(member);
});

app.put('/api/admin/team/:id', async (req, res) => {
  const store = await readStore();
  const idx = store.team.findIndex((m) => m.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ message: 'Profissional nao encontrado' });
  }

  const current = store.team[idx];
  const merged = {
    ...current,
    ...req.body,
    likes: Number(req.body.likes ?? current.likes ?? 0),
    capacityPerSlot: normalizeCapacityPerSlot(req.body.capacityPerSlot ?? current.capacityPerSlot ?? 1),
    slotStepMode: normalizeSlotStepMode(req.body.slotStepMode ?? current.slotStepMode),
    slotStepMinutes: normalizeSlotStepMinutes(req.body.slotStepMinutes ?? current.slotStepMinutes),
    serviceIds: Array.isArray(req.body.serviceIds) ? req.body.serviceIds : current.serviceIds,
    schedule: req.body.schedule ? normalizeSchedule(req.body.schedule) : current.schedule
  };

  store.team[idx] = merged;
  await writeStore(store);
  return res.json(merged);
});

app.delete('/api/admin/team/:id', async (req, res) => {
  const store = await readStore();
  store.team = store.team.filter((m) => m.id !== req.params.id);
  store.appointments = store.appointments.filter((a) => a.teamId !== req.params.id);
  await writeStore(store);
  res.status(204).send();
});

app.post('/api/admin/most-booked', async (req, res) => {
  const store = await readStore();
  const item = {
    id: uid('mb'),
    serviceId: req.body.serviceId || '',
    label: req.body.label || 'Mais agendado',
    subtitle: req.body.subtitle || '',
    position: Number(req.body.position || store.mostBooked.length + 1)
  };
  store.mostBooked.push(item);
  await writeStore(store);
  res.status(201).json(item);
});

app.put('/api/admin/most-booked/:id', async (req, res) => {
  const store = await readStore();
  const idx = store.mostBooked.findIndex((m) => m.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ message: 'Item nao encontrado' });
  }
  store.mostBooked[idx] = {
    ...store.mostBooked[idx],
    ...req.body,
    position: Number(req.body.position ?? store.mostBooked[idx].position)
  };
  await writeStore(store);
  return res.json(store.mostBooked[idx]);
});

app.delete('/api/admin/most-booked/:id', async (req, res) => {
  const store = await readStore();
  store.mostBooked = store.mostBooked.filter((m) => m.id !== req.params.id);
  await writeStore(store);
  res.status(204).send();
});

app.post('/api/admin/catalog', async (req, res) => {
  const store = await readStore();
  const item = {
    id: uid('cat'),
    title: req.body.title || 'Corte',
    subtitle: req.body.subtitle || '',
    image: '',
    position: Number(req.body.position || store.catalog.length + 1)
  };
  store.catalog.push(item);
  await writeStore(store);
  res.status(201).json(item);
});

app.put('/api/admin/catalog/:id', async (req, res) => {
  const store = await readStore();
  const idx = store.catalog.findIndex((c) => c.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ message: 'Item do catalogo nao encontrado' });
  }

  store.catalog[idx] = {
    ...store.catalog[idx],
    ...req.body,
    position: Number(req.body.position ?? store.catalog[idx].position)
  };
  await writeStore(store);
  return res.json(store.catalog[idx]);
});

app.delete('/api/admin/catalog/:id', async (req, res) => {
  const store = await readStore();
  store.catalog = store.catalog.filter((c) => c.id !== req.params.id);
  await writeStore(store);
  res.status(204).send();
});

app.post('/api/admin/reviews', async (req, res) => {
  const store = await readStore();
  const review = {
    id: uid('rv'),
    author: req.body.author || 'Cliente',
    rating: Math.max(1, Math.min(5, Number(req.body.rating || 5))),
    comment: req.body.comment || '',
    date: req.body.date || dayjs().format('YYYY-MM-DD')
  };
  store.reviews.push(review);
  await writeStore(store);
  res.status(201).json(review);
});

app.delete('/api/admin/reviews/:id', async (req, res) => {
  const store = await readStore();
  store.reviews = store.reviews.filter((r) => r.id !== req.params.id);
  await writeStore(store);
  res.status(204).send();
});

app.post('/api/admin/upload/hero', async (req, res) => {
  const { imageBase64 } = req.body;
  if (!isValidBase64Image(imageBase64)) {
    return res.status(400).json({ message: 'Imagem base64 invalida' });
  }
  const store = await readStore();
  store.settings.heroImage = imageBase64;
  await writeStore(store);
  return res.json({ path: store.settings.heroImage });
});

app.post('/api/admin/upload/team/:id', async (req, res) => {
  const { imageBase64 } = req.body;
  if (!isValidBase64Image(imageBase64)) {
    return res.status(400).json({ message: 'Imagem base64 invalida' });
  }
  const store = await readStore();
  const idx = store.team.findIndex((m) => m.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ message: 'Profissional nao encontrado' });
  }
  store.team[idx].photo = imageBase64;
  await writeStore(store);
  return res.json({ path: store.team[idx].photo });
});

app.post('/api/admin/upload/catalog/:id', async (req, res) => {
  const { imageBase64 } = req.body;
  if (!isValidBase64Image(imageBase64)) {
    return res.status(400).json({ message: 'Imagem base64 invalida' });
  }

  const store = await readStore();
  const idx = store.catalog.findIndex((c) => c.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ message: 'Item do catalogo nao encontrado' });
  }

  store.catalog[idx].image = imageBase64;
  await writeStore(store);
  return res.json({ path: store.catalog[idx].image });
});

app.get('/api/availability', async (req, res) => {
  const { serviceId, teamId, date } = req.query;
  if (!serviceId || !teamId || !date) {
    return res.status(400).json({ message: 'Parametros obrigatorios: serviceId, teamId e date' });
  }

  const store = await readStore();
  const service = store.services.find((s) => s.id === serviceId && s.active !== false);
  const member = store.team.find((t) => t.id === teamId);

  if (!service || !member) {
    return res.status(404).json({ message: 'Servico ou profissional nao encontrado' });
  }

  if (!memberCanServe(member, serviceId)) {
    return res.json({ slots: [], fullDay: true, reason: 'Profissional nao atende esse servico' });
  }

  const slots = buildSlots(member, service, String(date), store.appointments, store.services);
  const openSlots = slots.filter((s) => !s.full);

  return res.json({
    slots,
    fullDay: openSlots.length === 0,
    openSlots
  });
});

app.post('/api/appointments', async (req, res) => {
  const { serviceId, teamId, date, time, clientName, clientPhone } = req.body;
  if (!serviceId || !teamId || !date || !time || !clientName) {
    return res.status(400).json({ message: 'Campos obrigatorios nao enviados' });
  }

  const store = await readStore();
  const service = store.services.find((s) => s.id === serviceId && s.active !== false);
  const member = store.team.find((t) => t.id === teamId);
  if (!service || !member) {
    return res.status(404).json({ message: 'Servico ou profissional nao encontrado' });
  }

  if (!memberCanServe(member, serviceId)) {
    return res.status(400).json({ message: 'Profissional nao atende esse servico' });
  }

  const slots = buildSlots(member, service, String(date), store.appointments, store.services);
  const slot = slots.find((s) => s.time === time);
  if (!slot || slot.full) {
    return res.status(409).json({ message: 'Horario indisponivel ou agenda cheia para esse profissional' });
  }

  let authUser = null;
  const token = getBearerToken(req);
  if (token && FIREBASE_AUTH_ENABLED) {
    try {
      authUser = await verifyFirebaseToken(token);
    } catch {
      authUser = null;
    }
  }

  const appointment = {
    id: uid('ap'),
    serviceId,
    teamId,
    date,
    time,
    clientName,
    clientPhone: clientPhone || '',
    clientEmail: String(req.body?.clientEmail || authUser?.email || '').trim(),
    userUid: String(authUser?.uid || '').trim(),
    userEmail: String(authUser?.email || '').trim(),
    status: 'confirmed',
    createdAt: new Date().toISOString()
  };

  store.appointments.push(appointment);
  await writeStore(store);
  return res.status(201).json(appointment);
});

app.get('/api/admin/appointments', async (_req, res) => {
  const store = await readStore();
  res.json(store.appointments);
});

app.get('/:slug', async (req, res, next) => {
  const slug = String(req.params.slug || '').trim().toLowerCase();
  if (!slug || slug.includes('.') || slug === 'admin' || slug === 'agendar') {
    return next();
  }

  const store = await readStore();
  const currentSlug = normalizeSettings(store.settings).slug;
  if (slug !== currentSlug) {
    return next();
  }

  return res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, _req, res, _next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Imagem muito grande. Envie uma imagem menor.' });
  }
  console.error(err);
  res.status(500).json({ message: 'Erro interno do servidor' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Servidor ativo em http://localhost:${PORT}`);
  });
}

module.exports = app;
