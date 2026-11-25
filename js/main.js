/* Progressive enhancements only: content and navigation work without JavaScript. */
(() => {
  'use strict';
  const root = document.documentElement;
  const toggle = document.querySelector('[data-language-toggle]');
  let language = 'fa';
  try {
    language = localStorage.getItem('ahg-lang') === 'en' ? 'en' : 'fa';
  } catch (_) { /* Storage is optional (private browsing and restricted contexts). */ }

  const booking=document.querySelector('[data-booking-consent]');
  if(booking){
    const load=()=>{const script=document.createElement('script');script.src=booking.dataset.src;document.head.append(script);};
    if('IntersectionObserver' in window){
      const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();load();}},{rootMargin:'240px'});
      observer.observe(booking.parentElement);
    }else load();
  }
  function applyLanguageImages() {
    const selected=root.lang==='en'?'en':'fa';
    document.querySelectorAll('img[data-src-fa][data-src-en]').forEach(image=>{
      const src=image.dataset[selected==='fa'?'srcFa':'srcEn'];
      if(image.dataset.activeLanguage!==selected){if(image.getAttribute('src')!==src)image.src=src;image.dataset.activeLanguage=selected;}
    });
    document.querySelectorAll('img[data-alt-fa][data-alt-en]').forEach(image=>{image.alt=image.dataset[selected==='fa'?'altFa':'altEn'];});
  }
  new MutationObserver(applyLanguageImages).observe(root,{attributes:true,attributeFilter:['lang']});

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
    const homeSearch=document.getElementById('home-search');
    if(homeSearch)homeSearch.placeholder=language==='fa'?'موضوع یا بیماری':'Topic or condition';
    applyLanguageImages();
    const title = document.querySelector('title');
    document.title = title.dataset[language] || title.textContent;
    const description = document.querySelector('meta[name="description"]');
    if (description?.dataset[language]) description.content = description.dataset[language];
    if (toggle) {
      const icon=document.createElement('span');icon.className='ui-material-icon icon-language';icon.setAttribute('aria-hidden','true');
      const badge=document.createElement('span');badge.className='language-badge';badge.textContent=language==='fa'?'EN':'FA';badge.setAttribute('aria-hidden','true');
      toggle.replaceChildren(icon,badge);
      toggle.setAttribute('aria-label', language === 'fa' ? 'Switch to English' : 'Switch to Persian');
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

  const originalLinks = new WeakMap();
  function applyLinks(values, initial=false) {
  Object.entries(values).forEach(([kind, value]) => {
    const destination = safeDestination(value, kind);
    if (!destination) {
      const channel = document.querySelector('.contact-channel[data-destination="' + kind + '"]');
      if (initial && channel && !channel.hidden) return;
      document.querySelectorAll('[data-destination="' + kind + '"]').forEach(link => {
        const original=originalLinks.get(link);if(!original)return;
        for(const key of ['href','target','rel','dir']){if(original[key]===null)link.removeAttribute(key);else link.setAttribute(key,original[key]);}
        link.replaceChildren(...original.children.map(child=>child.cloneNode(true)));
        link.querySelectorAll('[data-fa][data-en]').forEach(node=>{node.textContent=node.dataset[root.lang==='en'?'en':'fa'];});
      });
      if(channel)channel.removeAttribute('href');
      document.querySelectorAll('[data-pending="' + kind + '"]').forEach(node=>{node.hidden=false;});
      document.querySelectorAll('[data-ready="' + kind + '"]').forEach(node=>{node.hidden=true;});
      return;
    }
    document.querySelectorAll('[data-destination="' + kind + '"]').forEach(link => {
      if(!originalLinks.has(link))originalLinks.set(link,{...Object.fromEntries(['href','target','rel','dir'].map(key=>[key,link.getAttribute(key)])),children:[...link.childNodes].map(child=>child.cloneNode(true))});
      link.href = destination;
      if (kind === 'linkedin') {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      }
      if (kind === 'email' || kind === 'phone') {
        const label = link.querySelector('[data-contact-address]') || link;
        label.textContent = value.replace(/^(mailto:|tel:)/, '');
        label.dir = 'ltr';
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
  applyLinks(links, true);
  window.addEventListener('site-profile', event => {
    const profile=event.detail;
    applyLinks({linkedin:profile.linkedin, appointment:profile.appointment, email:profile.email ? 'mailto:'+profile.email : null, phone:profile.phone ? 'tel:'+profile.phone : null});
  });

  if (toggle) {
    toggle.hidden = false;
    toggle.addEventListener('click', () => applyLanguage(root.lang === 'fa' ? 'en' : 'fa'));
  }
  applyLanguage(language);
  document.querySelectorAll('.mobile-menu').forEach(menu => {
    let hoverClose,openedByHover=false;
    menu.addEventListener('toggle',()=>{if(menu.open)document.dispatchEvent(new CustomEvent('toolbar:disclose',{detail:menu}));});
    document.addEventListener('toolbar:disclose',event=>{if(!menu.contains(event.detail))menu.open=false;});
    menu.addEventListener('pointerenter',event=>{clearTimeout(hoverClose);if(event.pointerType==='mouse'&&matchMedia('(hover:hover)').matches&&!menu.open){menu.open=true;openedByHover=true;}});
    menu.querySelector('summary').addEventListener('click',event=>{if(openedByHover&&event.detail>0)event.preventDefault();openedByHover=false;});
    menu.addEventListener('pointerleave',()=>{hoverClose=setTimeout(()=>{if(!menu.contains(document.activeElement))menu.open=false;},180);});
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

/* Keep native anchor scrolling and keyboard focus clear of a variable-height header. */
(() => {const header=document.querySelector('.site-header');if(!header)return;const measure=()=>document.documentElement.style.setProperty('--header-clearance',Math.ceil(header.getBoundingClientRect().height+32)+'px');measure();new ResizeObserver(measure).observe(header);})();
