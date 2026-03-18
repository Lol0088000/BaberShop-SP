(function () {
  const STORAGE_KEY = 'barbearia-theme';

  function getSavedTheme() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === 'dark' || saved === 'light' ? saved : null;
    } catch {
      return null;
    }
  }

  function saveTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Ignora erros de storage (modo privado/restricoes).
    }
  }

  function getPreferredTheme() {
    const saved = getSavedTheme();
    if (saved) return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (document.body) {
      document.body.setAttribute('data-theme', theme);
    }
    saveTheme(theme);
    document.querySelectorAll('.theme-toggle').forEach((btn) => {
      const nextTheme = theme === 'dark' ? 'light' : 'dark';
      const label = nextTheme === 'light' ? 'Claro' : 'Escuro';
      const glyph = nextTheme === 'light' ? '☀' : '☾';
      btn.innerHTML = `<span class="theme-icon" aria-hidden="true">${glyph}</span><span class="theme-label">${label}</span>`;
      btn.setAttribute('aria-label', `Ativar tema ${label}`);
    });
  }

  function toggleTheme() {
    const current =
      (document.body && document.body.getAttribute('data-theme')) ||
      document.documentElement.getAttribute('data-theme') ||
      'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  }

  function initTheme() {
    applyTheme(getPreferredTheme());
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initTheme);
  } else {
    initTheme();
  }

  document.addEventListener('click', (event) => {
    const btn = event.target.closest('.theme-toggle');
    if (!btn) return;
    event.preventDefault();
    toggleTheme();
  });
})();
