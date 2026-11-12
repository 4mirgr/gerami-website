/* Published JSON is rendered with DOM text nodes, never injected HTML. */
(() => {
  const script = document.currentScript;
  const base = new URL('../', script.src);
  const lang = () => document.documentElement.lang === 'en' ? 'en' : 'fa';
  const text = (fa, en) => lang() === 'fa' ? fa : en;
  const el = (tag, value, className) => {
    const node = document.createElement(tag);
    if (value) node.textContent = value;
    if (className) node.className = className;
    return node;
  };
  function https(value) {
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch (_) { return null; }
  }
  async function json(file) {
    const res = await fetch(new URL('content/' + file, base), {cache:'no-store', signal: AbortSignal.timeout(10000)});
    if (!res.ok) throw new Error('Content unavailable');
    return res.json();
  }
  const profileRequest=json('site.json').then(data => { window.dispatchEvent(new CustomEvent('site-profile', {detail:data})); return data; }).catch(() => null);
  const path = location.pathname;
  if (path.endsWith('/about.html') || path.endsWith('/contact.html') || path.endsWith('/appointments.html')) {
    profileRequest.then(data => {
      if (!data) return;
      const host = el('section', '', 'cms-profile container');
      document.querySelector('main').append(host);
      function render() {
        host.replaceChildren();
        if (path.endsWith('/about.html')) {
          if (data['bio_' + lang()]) host.append(el('p', data['bio_' + lang()]));
          const entries = Array.isArray(data.cv) ? data.cv : [];
          document.querySelectorAll('[data-cv-placeholder]').forEach(node => {node.hidden=entries.length>0;});
          if (entries.length) host.append(el('h2', text('رزومه و سوابق', 'CV and experience')));
          entries.forEach(item => { const card = el('article', '', 'card'); card.append(el('h3', item['title_' + lang()]), el('p', item['detail_' + lang()])); host.append(card); });
        } else {
          const contact = [];
          if (typeof data.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) contact.push([data.email, 'mailto:' + data.email]);
          if (typeof data.phone === 'string' && /^\+?[0-9 -]{7,20}$/.test(data.phone)) contact.push([data.phone, 'tel:' + data.phone]);
          if (https(data.linkedin) && /^(www\.)?linkedin\.com$/.test(new URL(data.linkedin).hostname)) contact.push(['LinkedIn',data.linkedin]);
          if (https(data.appointment)) contact.push([text('دریافت نوبت','Book a visit'),data.appointment]);
          if (contact.length) host.append(el('h2',text('راه‌های ارتباط و مراجعه','Contact and visits')));
          contact.forEach(([label, href]) => { const a=el('a',label,'button button-secondary'); a.href=href; host.append(a); });
        }
      }
      render(); new MutationObserver(render).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
    }).catch(() => {}); // Static page remains usable if content is unavailable.
  }
  const isBlog = path.endsWith('/blog.html');
  const isHome = path === '/' || path.endsWith('/index.html');
  if (!isBlog && !isHome) return;
  json('articles.json').then(data => {
    const articles = (Array.isArray(data.articles) ? data.articles : []).filter(a => a.status === 'published' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(a.slug) && a.title_fa && a.title_en).sort((a,b) => String(b.published_at || '').localeCompare(String(a.published_at || '')) || a.slug.localeCompare(b.slug));
    if (!articles.length) return;
    const host=el('section','','container section');
    const toolbar=el('div','','article-toolbar');
    const search=el('input'); search.type='search';
    const select=el('select');
    const list=el('div'); const count=el('p'); count.setAttribute('aria-live','polite');
    toolbar.append(search,select); host.append(toolbar,count,list);
    const heading=el('h2',text('تازه‌ترین مطالب','Latest writing'));
    host.prepend(heading);
    if (isBlog) document.querySelector('main').append(host);
    else { document.querySelector('main').append(host); toolbar.hidden=true; }
    // Replace the initial empty-state panels once real articles exist.
    document.querySelectorAll('.article-topic').forEach(node => { node.hidden = true; });
    function render() {
      search.placeholder=text('جست‌وجوی مقاله…','Search articles…'); search.setAttribute('aria-label',search.placeholder);
      select.setAttribute('aria-label',text('مخاطب مقاله','Article audience'));
      const value=select.options.length ? select.value : (location.hash === '#professional' ? 'professional' : location.hash === '#public' ? 'patients' : '');
      select.replaceChildren(...[['',text('همهٔ مخاطبان','All audiences')],['patients',text('برای بیماران','For patients')],['professional',text('برای پزشکان','For clinicians')]].map(([v,t]) => {const o=el('option',t);o.value=v;return o;}));
      select.value=value;
      list.replaceChildren();
      let matching=articles.filter(a => (!select.value || a.audience === select.value) && ((a['title_'+lang()] || '')+' '+(a['body_'+lang()] || '')+' '+(a.category || '')).toLocaleLowerCase().includes(search.value.toLocaleLowerCase()));
      if (!isBlog) matching=matching.slice(0,3);
      heading.textContent=text('تازه‌ترین مطالب','Latest writing');
      count.textContent=matching.length ? text(matching.length+' مقاله',matching.length+' articles') : text('مقاله‌ای پیدا نشد.','No articles found.');
      matching.forEach(a => {
        const card=el('details','','card cms-article');card.id='article-'+a.slug;
        card.append(el('summary',a['title_'+lang()]));
        card.append(el('p',[a.author,a.category,a.published_at,text('بازبینی: ','Reviewed: ')+(a.reviewed_at || '')].filter(Boolean).join(' · ')));
        if (typeof a.image === 'string' && a.image.startsWith('/assets/uploads/') && !a.image.includes('..')) {const img=el('img');img.src=a.image;img.alt=a['title_'+lang()];img.loading='lazy';img.style.maxWidth='100%';card.append(img);}
        card.append(el('div',a['body_'+lang()],'article-body'));
        const sources=el('ul');
        (Array.isArray(a.sources)?a.sources:[]).forEach(source=>{if(!https(source.url))return;const li=el('li');const link=el('a',source.title || source.url);link.href=https(source.url);link.rel='noopener noreferrer';li.append(link);sources.append(li);});
        if(sources.children.length)card.append(el('h3',text('منابع','Sources')),sources);
        list.append(card);
      });
    }
    search.addEventListener('input',render);select.addEventListener('change',render);
    window.addEventListener('hashchange', () => { select.value=location.hash === '#professional' ? 'professional' : location.hash === '#public' ? 'patients' : ''; render(); });
    render();new MutationObserver(render).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  }).catch(() => {});
})();
