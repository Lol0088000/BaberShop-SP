const AUTH_STORAGE_KEY = 'adminFirebaseSession';
const AUTH_REMEMBER_KEY = 'adminRememberLogin';

const authState = {
  enabled: false,
  apiKey: '',
  googleClientId: '',
  authDomain: '',
  projectId: '',
  appId: '',
  idToken: '',
  refreshToken: '',
  expiresAt: 0,
  profile: null,
  mode: 'login',
  rememberLogin: true
};

const firebaseWeb = {
  initialized: false,
  auth: null
};

function setFeedback(message, isError = false) {
  const el = document.getElementById('authFeedback');
  if (!el) return;
  el.textContent = message || '';
  el.classList.toggle('error', Boolean(isError));
}

function redirectToHome() {
  window.location.href = '/';
}

function redirectByRole(profile = authState.profile) {
  if (profile?.isAdmin) {
    window.location.href = '/admin.html';
    return;
  }
  redirectToHome();
}

function loadSession() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY) || sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    authState.idToken = parsed.idToken || '';
    authState.refreshToken = parsed.refreshToken || '';
    authState.expiresAt = Number(parsed.expiresAt || 0);
  } catch {
    clearSession();
  }
}

function saveSession() {
  const payload = JSON.stringify({
    idToken: authState.idToken,
    refreshToken: authState.refreshToken,
    expiresAt: authState.expiresAt
  });

  if (authState.rememberLogin) {
    localStorage.setItem(AUTH_STORAGE_KEY, payload);
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
  } else {
    sessionStorage.setItem(AUTH_STORAGE_KEY, payload);
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }
}

function clearSession() {
  authState.idToken = '';
  authState.refreshToken = '';
  authState.expiresAt = 0;
  authState.profile = null;
  localStorage.removeItem(AUTH_STORAGE_KEY);
  sessionStorage.removeItem(AUTH_STORAGE_KEY);
}

function isLoggedIn() {
  return Boolean(authState.idToken);
}

function updateLogoutButtonState() {
  const logoutButton = document.getElementById('logoutButton');
  if (!logoutButton) return;
  logoutButton.disabled = !isLoggedIn();
}

async function logoutCurrentSession() {
  if (firebaseWeb.auth) {
    try {
      await firebaseWeb.auth.signOut();
    } catch {
      // Mantem fluxo de logout mesmo se o signOut do SDK falhar.
    }
  }

  if (window.google?.accounts?.id?.disableAutoSelect) {
    try {
      window.google.accounts.id.disableAutoSelect();
    } catch {
      // Ignora erros nao criticos de limpeza do Google One Tap.
    }
  }

  clearSession();
  renderProfile();
  updateLogoutButtonState();
  setFeedback('Sessao encerrada.');
}

function loadRememberPreference() {
  const raw = localStorage.getItem(AUTH_REMEMBER_KEY);
  if (raw === '0') {
    authState.rememberLogin = false;
    return;
  }
  authState.rememberLogin = true;
}

function saveRememberPreference(value) {
  authState.rememberLogin = Boolean(value);
  localStorage.setItem(AUTH_REMEMBER_KEY, authState.rememberLogin ? '1' : '0');
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function setMode(mode) {
  const nextMode = mode === 'register' ? 'register' : 'login';
  authState.mode = nextMode;

  const registerOnlyLabels = document.querySelectorAll('.register-only');
  const loginOnlyBlocks = document.querySelectorAll('.login-only');
  const loginTab = document.getElementById('modeLoginButton');
  const registerTab = document.getElementById('modeRegisterButton');
  const submitButton = document.getElementById('authSubmitButton');
  const helper = document.getElementById('authModeHelper');
  const confirmPasswordInput = document.getElementById('authConfirmPassword');
  const phoneInput = document.getElementById('authPhone');
  const usernameInput = document.getElementById('authUsername');

  const inRegister = nextMode === 'register';
  registerOnlyLabels.forEach((el) => {
    el.hidden = !inRegister;
  });
  loginOnlyBlocks.forEach((el) => {
    el.hidden = inRegister;
  });

  if (confirmPasswordInput) {
    confirmPasswordInput.required = inRegister;
  }
  if (phoneInput) {
    phoneInput.required = inRegister;
  }
  if (usernameInput) {
    usernameInput.required = inRegister;
  }

  if (submitButton) {
    submitButton.textContent = inRegister ? 'Criar conta' : 'Entrar';
  }

  if (helper) {
    helper.textContent = inRegister
      ? 'Preencha telefone, email, senha e confirmacao para finalizar seu cadastro.'
      : 'Use seu email e senha para entrar na sua conta.';
  }

  const passwordInput = document.getElementById('authPassword');
  if (passwordInput) {
    passwordInput.setAttribute('autocomplete', inRegister ? 'new-password' : 'current-password');
  }

  if (loginTab && registerTab) {
    loginTab.classList.toggle('is-active', !inRegister);
    registerTab.classList.toggle('is-active', inRegister);
    loginTab.setAttribute('aria-selected', String(!inRegister));
    registerTab.setAttribute('aria-selected', String(inRegister));
  }

  setFeedback('');
}

async function fetchFirebaseConfig() {
  const response = await fetch('/api/firebase/config');
  const config = await response.json().catch(() => ({}));
  authState.enabled = Boolean(config.authEnabled && config.apiKey);
  authState.apiKey = String(config.apiKey || '');
  authState.googleClientId = String(config.googleClientId || '');
  authState.authDomain = String(config.authDomain || '');
  authState.projectId = String(config.projectId || '');
  authState.appId = String(config.appId || '');
}

function initFirebaseWebAuth() {
  if (firebaseWeb.initialized) return true;
  if (!window.firebase?.initializeApp || !window.firebase?.auth) return false;
  if (!authState.apiKey || !authState.authDomain) return false;

  if (!window.firebase.apps.length) {
    window.firebase.initializeApp({
      apiKey: authState.apiKey,
      authDomain: authState.authDomain,
      projectId: authState.projectId || undefined,
      appId: authState.appId || undefined
    });
  }

  firebaseWeb.auth = window.firebase.auth();
  firebaseWeb.initialized = Boolean(firebaseWeb.auth);
  return firebaseWeb.initialized;
}

async function signIn(email, password) {
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
    throw new Error((body?.error?.message || 'Falha no login.').replace(/_/g, ' '));
  }

  authState.idToken = String(body.idToken || '');
  authState.refreshToken = String(body.refreshToken || '');
  authState.expiresAt = Date.now() + Number(body.expiresIn || 3600) * 1000;
  saveSession();
  updateLogoutButtonState();
}

async function signUp(email, password, displayName) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${authState.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    }
  );

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((body?.error?.message || 'Falha ao criar conta.').replace(/_/g, ' '));
  }

  authState.idToken = String(body.idToken || '');
  authState.refreshToken = String(body.refreshToken || '');
  authState.expiresAt = Date.now() + Number(body.expiresIn || 3600) * 1000;
  saveSession();
  updateLogoutButtonState();

  if (displayName) {
    await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:update?key=${authState.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idToken: authState.idToken,
        displayName,
        returnSecureToken: true
      })
    }).catch(() => null);
  }
}

async function signInWithGoogleCredential(googleIdToken) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${authState.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        postBody: `id_token=${encodeURIComponent(googleIdToken)}&providerId=google.com`,
        requestUri: `${window.location.origin}/login.html`,
        returnSecureToken: true,
        returnIdpCredential: true
      })
    }
  );

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((body?.error?.message || 'Falha no login com Google.').replace(/_/g, ' '));
  }

  authState.idToken = String(body.idToken || '');
  authState.refreshToken = String(body.refreshToken || '');
  authState.expiresAt = Date.now() + Number(body.expiresIn || 3600) * 1000;
  saveSession();
  updateLogoutButtonState();

  return {
    displayName: String(body.displayName || ''),
    email: String(body.email || ''),
    photoUrl: String(body.photoUrl || '')
  };
}

async function signInWithGooglePopup() {
  if (!initFirebaseWebAuth()) {
    throw new Error('Google nao configurado no frontend.');
  }

  const provider = new window.firebase.auth.GoogleAuthProvider();
  const result = await firebaseWeb.auth.signInWithPopup(provider);
  const user = result?.user;
  if (!user) {
    throw new Error('Nao foi possivel autenticar com Google.');
  }

  authState.idToken = String(await user.getIdToken());
  authState.refreshToken = String(user.refreshToken || authState.refreshToken || '');
  authState.expiresAt = Date.now() + 55 * 60 * 1000;
  saveSession();
  updateLogoutButtonState();

  return {
    displayName: String(user.displayName || ''),
    email: String(user.email || ''),
    photoUrl: String(user.photoURL || '')
  };
}

async function sendPasswordResetEmail(email) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${authState.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestType: 'PASSWORD_RESET',
        email: String(email || '').trim()
      })
    }
  );

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((body?.error?.message || 'Nao foi possivel enviar o email de redefinicao.').replace(/_/g, ' '));
  }
}

async function refreshTokenIfNeeded() {
  if (!authState.idToken) {
    throw new Error('Voce nao esta logado.');
  }

  if (authState.expiresAt - Date.now() > 60 * 1000) {
    return;
  }

  const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${authState.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(authState.refreshToken || '')}`
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error('Nao foi possivel renovar sua sessao.');
  }

  authState.idToken = String(body.id_token || '');
  authState.refreshToken = String(body.refresh_token || authState.refreshToken || '');
  authState.expiresAt = Date.now() + Number(body.expires_in || 3600) * 1000;
  saveSession();
  updateLogoutButtonState();
}

async function apiAuth(url, options = {}) {
  await refreshTokenIfNeeded();
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${authState.idToken}`);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, { ...options, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.message || 'Falha ao processar autenticacao.');
  }
  return body;
}

function renderProfile() {
  const wrap = document.getElementById('authProfile');
  const info = document.getElementById('authProfileInfo');
  const adminBtn = document.getElementById('adminAccessButton');

  if (!wrap || !info || !adminBtn) {
    return;
  }

  if (!authState.profile) {
    wrap.hidden = true;
    return;
  }

  wrap.hidden = false;
  const profile = authState.profile;
  info.textContent = `${profile.displayName || 'Usuario'} (${profile.email || '-'})`;

  adminBtn.disabled = !profile.isAdmin;
  adminBtn.onclick = () => {
    window.location.href = '/admin.html';
  };
}

async function syncSession(displayNameFromForm = '', photoUrlFromForm = '') {
  const session = await apiAuth('/api/auth/session', {
    method: 'POST',
    body: JSON.stringify({
      displayName: displayNameFromForm,
      photoUrl: photoUrlFromForm
    })
  });

  authState.profile = {
    uid: session?.user?.uid || '',
    email: session?.user?.email || '',
    displayName: session?.user?.displayName || '',
    photoUrl: session?.user?.photoUrl || '',
    isAdmin: Boolean(session?.isAdmin)
  };

  setFeedback('Login realizado. Seus registros estao habilitados nesta conta.');
  renderProfile();
  return authState.profile;
}

async function saveProfile(displayName = '', phone = '', photoUrl = '') {
  await apiAuth('/api/auth/profile', {
    method: 'PUT',
    body: JSON.stringify({
      displayName: String(displayName || '').trim(),
      phone: String(phone || '').trim(),
      photoUrl: String(photoUrl || '').trim()
    })
  });
}

async function restoreProfileIfSessionExists() {
  if (!authState.idToken) return;
  try {
    const profile = await apiAuth('/api/auth/profile');
    authState.profile = profile;
    renderProfile();
    setFeedback('Sessao restaurada.');
  } catch {
    clearSession();
    renderProfile();
  }
}

function wireActions() {
  const form = document.getElementById('authForm');
  const emailInput = document.getElementById('authEmail');
  const passwordInput = document.getElementById('authPassword');
  const confirmPasswordInput = document.getElementById('authConfirmPassword');
  const phoneInput = document.getElementById('authPhone');
  const usernameInput = document.getElementById('authUsername');
  const modeLoginButton = document.getElementById('modeLoginButton');
  const modeRegisterButton = document.getElementById('modeRegisterButton');
  const forgotPasswordButton = document.getElementById('forgotPasswordButton');
  const rememberLoginInput = document.getElementById('rememberLogin');
  const logoutButton = document.getElementById('logoutButton');

  if (rememberLoginInput) {
    rememberLoginInput.checked = authState.rememberLogin;
    rememberLoginInput.addEventListener('change', () => {
      saveRememberPreference(Boolean(rememberLoginInput.checked));
    });
  }

  modeLoginButton?.addEventListener('click', () => setMode('login'));
  modeRegisterButton?.addEventListener('click', () => setMode('register'));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!authState.enabled) return;

    const email = String(emailInput.value || '').trim();
    const password = String(passwordInput.value || '');
    const confirmPassword = String(confirmPasswordInput.value || '');
    const phone = String(phoneInput.value || '').trim();
    const phoneDigits = normalizePhone(phone);
    const username = String(usernameInput.value || '').trim();
    saveRememberPreference(Boolean(rememberLoginInput?.checked ?? true));

    if (authState.mode === 'register') {
      if (!username || !phone || !email || !password || !confirmPassword) {
        setFeedback('Para criar conta, informe email, senha, telefone, repetir senha e nome de usuario.', true);
        return;
      }

      if (phoneDigits.length < 10 || phoneDigits.length > 11) {
        setFeedback('Informe um telefone valido com DDD.', true);
        return;
      }

      if (password.length < 6) {
        setFeedback('A senha deve ter pelo menos 6 caracteres.', true);
        return;
      }

      if (password !== confirmPassword) {
        setFeedback('As senhas nao conferem.', true);
        return;
      }

      try {
        setFeedback('Criando conta...');
        await signUp(email, password, username);
        const sessionProfile = await syncSession(username);
        await saveProfile(username, phone);
        const profile = await apiAuth('/api/auth/profile');
        authState.profile = {
          ...profile,
          isAdmin: Boolean(sessionProfile?.isAdmin)
        };
        renderProfile();
        setFeedback('Conta criada com sucesso. Redirecionando...');
        setTimeout(() => redirectByRole(authState.profile), 250);
      } catch (error) {
        setFeedback(`Erro ao criar conta: ${error.message}`, true);
      }
      return;
    }

    try {
      setFeedback('Entrando...');
      await signIn(email, password);
      const profile = await syncSession('');
      setFeedback('Login realizado. Redirecionando...');
      setTimeout(() => redirectByRole(profile), 250);
    } catch (error) {
      setFeedback(`Erro no login: ${error.message}`, true);
    }
  });

  logoutButton?.addEventListener('click', async () => {
    await logoutCurrentSession();
  });

  updateLogoutButtonState();

  forgotPasswordButton?.addEventListener('click', async () => {
    if (!authState.enabled) return;

    const email = String(emailInput.value || '').trim();
    if (!email) {
      setFeedback('Informe seu email para redefinir a senha.', true);
      return;
    }

    try {
      setFeedback('Enviando email de redefinicao...');
      await sendPasswordResetEmail(email);
      setFeedback('Se o email estiver cadastrado, voce recebera o link para redefinir a senha.');
    } catch (error) {
      setFeedback(`Erro ao enviar redefinicao: ${error.message}`, true);
    }
  });
}

function initGoogleAuth() {
  const wrap = document.getElementById('googleAuthButton');
  if (!wrap) return;

  const canUsePopup = initFirebaseWebAuth();
  const canUseCredential = Boolean(authState.googleClientId && window.google?.accounts?.id);

  if (!canUsePopup && !canUseCredential) {
    wrap.textContent = 'Login com Google indisponivel no momento.';
    return;
  }

  wrap.innerHTML = '<button id="googleSignInFallback" class="google-cta" type="button"><span class="google-cta-icon" aria-hidden="true"></span><span>Entrar com Google</span></button>';

  const fallbackButton = document.getElementById('googleSignInFallback');
  fallbackButton?.addEventListener('click', async () => {
    try {
      setFeedback('Entrando com Google...');
      const googleUser = canUsePopup
        ? await signInWithGooglePopup()
        : await new Promise((resolve, reject) => {
            window.google.accounts.id.initialize({
              client_id: authState.googleClientId,
              callback: async (response) => {
                try {
                  if (!response?.credential) {
                    throw new Error('Resposta do Google invalida.');
                  }
                  const user = await signInWithGoogleCredential(response.credential);
                  resolve(user);
                } catch (err) {
                  reject(err);
                }
              }
            });
            window.google.accounts.id.prompt();
          });

      if (authState.mode === 'register') {
        const emailInput = document.getElementById('authEmail');
        const usernameInput = document.getElementById('authUsername');
        const phoneInput = document.getElementById('authPhone');
        const nameFromGoogle = String(googleUser.displayName || '').trim();
        const emailFromGoogle = String(googleUser.email || '').trim();

        if (emailInput && emailFromGoogle) {
          emailInput.value = emailFromGoogle;
        }
        if (usernameInput && !String(usernameInput.value || '').trim() && nameFromGoogle) {
          usernameInput.value = nameFromGoogle;
        }

        const username = String(usernameInput?.value || nameFromGoogle || '').trim();
        const phone = String(phoneInput?.value || '').trim();

        const sessionProfile = await syncSession(username || nameFromGoogle, googleUser.photoUrl || '');
        if (username || phone) {
          await saveProfile(username, phone, googleUser.photoUrl || '');
          const profile = await apiAuth('/api/auth/profile');
          authState.profile = {
            ...profile,
            isAdmin: Boolean(sessionProfile?.isAdmin)
          };
          renderProfile();
        }
        setFeedback('Conta Google conectada. Redirecionando...');
        setTimeout(() => redirectByRole(authState.profile || sessionProfile), 250);
        return;
      }

      const nameFromGoogle = String(googleUser.displayName || '').trim();
      const profile = await syncSession(nameFromGoogle, googleUser.photoUrl || '');
      setFeedback('Login com Google realizado. Redirecionando...');
      setTimeout(() => redirectByRole(profile), 250);
    } catch (error) {
      setFeedback(`Erro no Google: ${error.message}`, true);
    }
  });
}

async function init() {
  loadRememberPreference();
  await fetchFirebaseConfig();
  wireActions();
  setMode('login');
  initGoogleAuth();

  if (!authState.enabled) {
    setFeedback('Login indisponivel no momento. Configure o Firebase no servidor.', true);
    return;
  }

  loadSession();
  updateLogoutButtonState();
  await restoreProfileIfSessionExists();
}

init();
