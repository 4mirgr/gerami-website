/* Applied before paint; storage is optional. */
(() => {
  const root = document.documentElement;
  const media = matchMedia('(prefers-color-scheme: dark)');
  let explicit;
  try { const stored = localStorage.getItem('ahg-theme'); if (['light','dark'].includes(stored)) explicit = stored; } catch (_) {}
  function apply(theme) {
    root.dataset.theme = theme;
    document.querySelectorAll('img[data-theme-light][data-theme-dark]').forEach(img => {
      const source = theme === 'dark' ? img.dataset.themeDark : img.dataset.themeLight;
      if (img.getAttribute('src') !== source) img.setAttribute('src', source);
    });
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'dark' ? '#07121f' : '#f5f8fc';
    const button = document.querySelector('[data-theme-toggle]');
    if (button) {
      button.hidden = false;
      button.textContent = theme === 'dark' ? '☀' : '☾';
      const fa = root.lang !== 'en';
      button.setAttribute('aria-label', theme === 'dark' ? (fa ? 'فعال‌کردن حالت روز' : 'Switch to day mode') : (fa ? 'فعال‌کردن حالت شب' : 'Switch to night mode'));
      button.setAttribute('aria-pressed', String(theme === 'dark'));
    }
  }
  apply(explicit || (media.matches ? 'dark' : 'light'));
  media.addEventListener('change', () => { if (!explicit) apply(media.matches ? 'dark' : 'light'); });
  document.addEventListener('DOMContentLoaded', () => {
    apply(root.dataset.theme);
    document.querySelector('[data-theme-toggle]')?.addEventListener('click', () => {
      explicit = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('ahg-theme', explicit); } catch (_) {}
      apply(explicit);
    });
    new MutationObserver(() => apply(root.dataset.theme)).observe(root, { attributes: true, attributeFilter: ['lang'] });
  });
})();
