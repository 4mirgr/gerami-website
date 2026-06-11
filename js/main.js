/* ═══════════════════════════════════════════════════════════
   DR. AMIR HOUSHANG GERAMI — MAIN JAVASCRIPT
   Handles: Lang switch · Side menu · Header scroll ·
            Cursor glow · Particles · Scroll reveal
   ═══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── STATE ───────────────────────────────────────────── */
  let currentLang = localStorage.getItem('ahg-lang') || 'fa';
  const html       = document.documentElement;
  const body       = document.body;

  /* ── DOM REFS ────────────────────────────────────────── */
  const langToggle   = document.getElementById('langToggle');
  const menuTrigger  = document.getElementById('menuTrigger');
  const menuClose    = document.getElementById('menuClose');
  const sideMenu     = document.getElementById('sideMenu');
  const menuOverlay  = document.getElementById('menuOverlay');
  const siteHeader   = document.getElementById('siteHeader');
  const cursorGlow   = document.getElementById('cursorGlow');

  /* ══════════════════════════════════════════════════════
     LANGUAGE SYSTEM
  ══════════════════════════════════════════════════════ */
  function applyLang(lang) {
    currentLang = lang;
    localStorage.setItem('ahg-lang', lang);

    /* Direction & class */
    if (lang === 'fa') {
      html.setAttribute('lang', 'fa');
      html.setAttribute('dir', 'rtl');
      body.classList.add('lang-fa');
      body.classList.remove('lang-en');
    } else {
      html.setAttribute('lang', 'en');
      html.setAttribute('dir', 'ltr');
      body.classList.add('lang-en');
      body.classList.remove('lang-fa');
    }

    /* Swap all [data-fa] / [data-en] elements */
    document.querySelectorAll('[data-fa], [data-en]').forEach(el => {
      const text = el.getAttribute('data-' + lang);
      if (text !== null) el.textContent = text;
    });

    /* Update page title */
    if (lang === 'fa') {
      document.title = 'دکتر امیرهوشنگ گرامی | Dr. Amir Houshang Gerami';
    } else {
      document.title = 'Dr. Amir Houshang Gerami | دکتر امیرهوشنگ گرامی';
    }
  }

  if (langToggle) {
    langToggle.addEventListener('click', () => {
      applyLang(currentLang === 'fa' ? 'en' : 'fa');
    });
  }

  /* Init on load */
  applyLang(currentLang);

  /* ══════════════════════════════════════════════════════
     SIDE MENU
  ══════════════════════════════════════════════════════ */
  function openMenu() {
    sideMenu && sideMenu.classList.add('open');
    menuOverlay && menuOverlay.classList.add('active');
    menuTrigger && menuTrigger.setAttribute('aria-expanded', 'true');
    body.style.overflow = 'hidden';
  }

  function closeMenu() {
    sideMenu && sideMenu.classList.remove('open');
    menuOverlay && menuOverlay.classList.remove('active');
    menuTrigger && menuTrigger.setAttribute('aria-expanded', 'false');
    body.style.overflow = '';
  }

  menuTrigger  && menuTrigger.addEventListener('click', openMenu);
  menuClose    && menuClose.addEventListener('click', closeMenu);
  menuOverlay  && menuOverlay.addEventListener('click', closeMenu);

  /* Close on Escape */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeMenu();
  });

  /* ══════════════════════════════════════════════════════
     HEADER — SCROLL EFFECT
  ══════════════════════════════════════════════════════ */
  if (siteHeader) {
    const onScroll = () => {
      if (window.scrollY > 60) {
        siteHeader.classList.add('scrolled');
      } else {
        siteHeader.classList.remove('scrolled');
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); // run once
  }

  /* ══════════════════════════════════════════════════════
     CURSOR GLOW
  ══════════════════════════════════════════════════════ */
  if (cursorGlow && window.matchMedia('(pointer: fine)').matches) {
    let cx = window.innerWidth / 2;
    let cy = window.innerHeight / 2;
    let tx = cx, ty = cy;

    document.addEventListener('mousemove', e => {
      tx = e.clientX; ty = e.clientY;
    });

    (function animGlow() {
      cx += (tx - cx) * 0.08;
      cy += (ty - cy) * 0.08;
      cursorGlow.style.left = cx + 'px';
      cursorGlow.style.top  = cy + 'px';
      requestAnimationFrame(animGlow);
    })();
  } else if (cursorGlow) {
    cursorGlow.style.display = 'none';
  }

  /* ══════════════════════════════════════════════════════
     HERO PARTICLES
  ══════════════════════════════════════════════════════ */
  const particleContainer = document.getElementById('heroParticles');
  if (particleContainer) {
    const COUNT = 20;
    for (let i = 0; i < COUNT; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      p.style.cssText = `
        left: ${Math.random() * 100}%;
        bottom: ${Math.random() * 40}%;
        --dur: ${6 + Math.random() * 8}s;
        --delay: ${Math.random() * 6}s;
        width: ${1 + Math.random() * 2}px;
        height: ${1 + Math.random() * 2}px;
        opacity: ${0.2 + Math.random() * 0.5};
      `;
      particleContainer.appendChild(p);
    }
  }

  /* ══════════════════════════════════════════════════════
     SCROLL REVEAL
  ══════════════════════════════════════════════════════ */
  const revealEls = document.querySelectorAll(
    '.service-card, .stat-card, .location-card, .snapshot-text, ' +
    '.snapshot-stats, .booking-text, .booking-platforms, ' +
    '.beyond-visual, .beyond-text, .section-header'
  );

  revealEls.forEach(el => el.classList.add('reveal'));

  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  revealEls.forEach(el => revealObserver.observe(el));

  /* Stagger children inside grids */
  document.querySelectorAll('.services-grid, .locations-grid, .snapshot-stats').forEach(grid => {
    Array.from(grid.children).forEach((child, i) => {
      child.style.transitionDelay = (i * 0.07) + 's';
    });
  });

  /* ══════════════════════════════════════════════════════
     CONTACT FORM SUBMIT (pages/contact.html)
  ══════════════════════════════════════════════════════ */
  const contactForm = document.getElementById('contactForm');
  if (contactForm) {
    contactForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const btn = contactForm.querySelector('[type="submit"]');
      const originalText = btn.textContent;
      btn.textContent = currentLang === 'fa' ? 'در حال ارسال...' : 'Sending...';
      btn.disabled = true;

      const data = new FormData(contactForm);
      const payload = Object.fromEntries(data.entries());

      try {
        /* Formspree endpoint — replace YOUR_ID after signup */
        const res = await fetch('https://formspree.io/f/xjgdeorj', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          showFormSuccess();
          contactForm.reset();
        } else {
          throw new Error('Server error');
        }
      } catch (err) {
        btn.textContent = currentLang === 'fa' ? 'خطا — دوباره امتحان کنید' : 'Error — Try Again';
        btn.disabled = false;
        setTimeout(() => {
          btn.textContent = originalText;
        }, 3000);
      }
    });
  }

  function showFormSuccess() {
    const success = document.getElementById('formSuccess');
    if (success) {
      success.style.display = 'block';
      success.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  /* ══════════════════════════════════════════════════════
     ACTIVE MENU LINK (highlight current page)
  ══════════════════════════════════════════════════════ */
  const path = window.location.pathname;
  document.querySelectorAll('.menu-links a').forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('href') && path.endsWith(link.getAttribute('href').replace(/^.*\//, ''))) {
      link.classList.add('active');
    }
  });
  /* Home page */
  if (path === '/' || path.endsWith('index.html')) {
    const homeLink = document.querySelector('.menu-links a[href="index.html"]');
    if (homeLink) homeLink.classList.add('active');
  }

  /* ══════════════════════════════════════════════════════
     REDUCED MOTION CHECK
  ══════════════════════════════════════════════════════ */
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll('.reveal').forEach(el => {
      el.classList.add('visible');
    });
  }

})();
