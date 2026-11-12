/* Progressive enhancements only: content and navigation work without JavaScript. */
(() => {
  'use strict';
  const root = document.documentElement;
  const toggle = document.querySelector('[data-language-toggle]');
  let language = 'fa';
  try {
    language = localStorage.getItem('ahg-lang') === 'en' ? 'en' : 'fa';
  } catch (_) { /* Storage is optional (private browsing and restricted contexts). */ }

  function applyLanguage(next) {
    language = next === 'en' ? 'en' : 'fa';
    root.lang = language;
    root.dir = language === 'fa' ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-fa][data-en]').forEach(element => {
      element.textContent = element.dataset[language];
    });
    document.querySelectorAll('[data-label-fa][data-label-en]').forEach(element => {
      element.setAttribute('aria-label', element.dataset[language === 'fa' ? 'labelFa' : 'labelEn']);
    });
    const title = document.querySelector('title');
    document.title = title.dataset[language] || title.textContent;
    const description = document.querySelector('meta[name="description"]');
    if (description?.dataset[language]) description.content = description.dataset[language];
    if (toggle) {
      toggle.textContent = language === 'fa' ? 'EN' : 'فا';
      toggle.setAttribute('aria-label', language === 'fa' ? 'Switch to English' : 'تغییر زبان به فارسی');
    }
    try { localStorage.setItem('ahg-lang', language); } catch (_) { /* No persistence needed. */ }
  }

  // Links remain honest fallbacks until their real destinations are configured.
  const links = window.SITE_LINKS || {};
  function safeDestination(value, kind) {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const url = new URL(value, window.location.href);
      if (url.username || url.password) return null;
      if (kind === 'email') return /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
      if (kind === 'phone') return /^tel:\+?[0-9 -]{7,20}$/.test(value) ? value : null;
      const sameOrigin = url.origin === window.location.origin;
      if (url.protocol !== 'https:' && !(sameOrigin && url.protocol === 'http:')) return null;
      if (kind === 'linkedin' && !(url.protocol === 'https:' && /^(www\.)?linkedin\.com$/.test(url.hostname) && url.pathname.startsWith('/in/'))) return null;
      if (kind === 'intmed' || kind === 'aus') {
        const projectOrigin = sameOrigin || url.origin === 'https://drgerami-md.ir';
        const projectPath = url.pathname === '/' + kind || url.pathname.startsWith('/' + kind + '/');
        if (!projectOrigin || !projectPath) return null;
      }
      return url.href;
    } catch (_) { return null; }
  }

  function applyLinks(values) {
  Object.entries(values).forEach(([kind, value]) => {
    const destination = safeDestination(value, kind);
    if (!destination) return;
    document.querySelectorAll('[data-destination="' + kind + '"]').forEach(link => {
      link.href = destination;
      if (kind === 'linkedin') {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      }
      if (kind === 'email' || kind === 'phone') {
        link.textContent = value.replace(/^(mailto:|tel:)/, '');
        link.dir = 'ltr';
      }
      const status = link.querySelector('[data-link-status]');
      if (status) {
        status.dataset.fa = 'ورود به پروژه';
        status.dataset.en = 'Open project';
      }
    });
    document.querySelectorAll('[data-pending="' + kind + '"]').forEach(element => { element.hidden = true; });
    document.querySelectorAll('[data-ready="' + kind + '"]').forEach(element => { element.hidden = false; });
  });
  }
  applyLinks(links);
  window.addEventListener('site-profile', event => {
    const profile=event.detail;
    applyLinks({linkedin:profile.linkedin, appointment:profile.appointment, email:profile.email ? 'mailto:'+profile.email : null, phone:profile.phone ? 'tel:'+profile.phone : null});
  });

  if (toggle) {
    toggle.hidden = false;
    toggle.addEventListener('click', () => applyLanguage(language === 'fa' ? 'en' : 'fa'));
  }
  applyLanguage(language);
  document.querySelectorAll('.mobile-menu').forEach(menu => {
    menu.addEventListener('keydown', event => {
      if (event.key === 'Escape' && menu.open) {
        menu.open = false;
        menu.querySelector('summary').focus();
      }
    });
    menu.addEventListener('click', event => {
      if (event.target.closest('a')) menu.open = false;
    });
    document.addEventListener('click', event => {
      if (!menu.contains(event.target)) menu.open = false;
    });
  });
})();
