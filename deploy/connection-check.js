// Public, read-only probes. Never read storage, cookies, account data or tokens.
export async function probe(label, url, kind, fetcher = fetch, timeoutMs = 8000) {
  const started = performance.now();
  const controller = new AbortController();
  let timer;
  let phase = 'waiting_headers', status, firstByteMs, receivedBytes = 0;
  let edge, cacheStatus;
  const metadata = () => {
    const timing = performance.getEntriesByName(url).filter(entry => entry.startTime >= started - 1).at(-1);
    const protocol = timing?.nextHopProtocol;
    return {phase, ...(status !== undefined ? {status, firstByteMs} : {}), receivedBytes,
      ...(protocol && /^[a-zA-Z0-9./-]{1,24}$/.test(protocol) ? {protocol} : {}),
      ...(edge ? {edge} : {}), ...(cacheStatus ? {cacheStatus} : {})};
  };
  const work = async () => {
    const response = await fetcher(url, {
      method: 'GET', credentials: 'omit', cache: 'no-store',
      redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal,
    });
    status = response.status;
    firstByteMs = Math.round(performance.now() - started);
    phase = 'reading_body';
    const colo = (response.headers.get('cf-ray') || '').split('-').at(-1);
    if (/^[A-Z]{3}$/.test(colo)) edge = colo;
    const cache = response.headers.get('cf-cache-status');
    if (['HIT', 'MISS', 'DYNAMIC', 'BYPASS', 'EXPIRED', 'REVALIDATED', 'STALE', 'UPDATING', 'NONE/UNKNOWN'].includes(cache)) cacheStatus = cache;
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let body = '';
    if (reader) {
      for (;;) {
        const {value, done} = await reader.read();
        if (done) break;
        receivedBytes += value.byteLength;
        if (receivedBytes > 2_000_000) { await reader.cancel(); throw Error('body_limit'); }
        body += decoder.decode(value, {stream:true});
      }
      body += decoder.decode();
    }
    phase = 'complete';
    let outcome = response.ok ? 'ok' : 'http_error';
    let detail = '';
    let entryScript;
    if (kind === 'health' && response.status === 401) outcome = 'reachable_auth_required';
    if (response.ok && kind === 'aus-config') {
      let config;
      try { config = JSON.parse(body); } catch {}
      if (config?.mode !== 'cloud' || config?.authRequired !== true
        || config?.supabaseUrl !== new URL(url).origin + '/aus/supabase'
        || typeof config?.publishableKey !== 'string' || !config.publishableKey) outcome = 'unexpected_config';
    }
    if (!response.ok && kind === 'aus-config') {
      // Only known non-sensitive gateway codes may enter the copied report.
      try {
        const code = JSON.parse(body).error;
        if (['aus_service_binding_required', 'aus_upstream_unavailable', 'invalid_auth_configuration'].includes(code)) detail = code;
      } catch {}
    }
    if (response.ok && kind === 'intmed-html' && !body.includes('id="loginGate"')) outcome = 'unexpected_page';
    if (response.ok && kind === 'aus-html' && !body.includes('id="root"')) outcome = 'unexpected_page';
    if (response.ok && kind === 'aus-html') {
      const match = body.match(/<script\b[^>]*\bsrc=["'](\/aus\/assets\/[A-Za-z0-9_-]+\.js)["']/);
      if (match) entryScript = match[1];
      else outcome = 'missing_entry_script';
    }
    if (response.ok && kind === 'json') {
      try { JSON.parse(body); } catch { outcome = 'unexpected_content'; }
    }
    if (response.ok && kind === 'script' && !(response.headers.get('content-type') || '').includes('javascript')) outcome = 'unexpected_content';
    return {label, path: new URL(url).origin + new URL(url).pathname, status: response.status,
      outcome, ...(detail ? {detail} : {}), ...(entryScript ? {entryScript} : {}), bytes: new TextEncoder().encode(body).length};
  };
  try {
    return {...await Promise.race([work(), new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('deadline')); }, timeoutMs);
    })]), ...metadata(), ms: Math.round(performance.now() - started)};
  } catch (error) {
    return {label, path: new URL(url).origin + new URL(url).pathname,
      outcome: controller.signal.aborted ? 'timeout' : 'network_or_cors_error', ...metadata(), ms: Math.round(performance.now() - started)};
  } finally { clearTimeout(timer); }
}

export async function runChecks(origin, fetcher = fetch, mode = 'parallel') {
  const specs = [
    ['فایل کوچک سایت', '/favicon.svg', 'asset'],
    ['صفحهٔ IntMed', '/intmed/', 'intmed-html'],
    ['فهرست مباحث IntMed', '/intmed/content/manifest.json', 'json'],
    ['صفحهٔ AUS', '/aus/', 'aus-html'],
    ['پیکربندی ورود AUS', '/aus/api/public-config', 'aus-config'],
    ['درگاه API فعلی IntMed', 'https://api.drgerami-md.ir/auth/v1/health', 'health'],
    ['مسیر جایگزین فعلی IntMed', 'https://upwbktvnybsjugdegjji.supabase.co/auth/v1/health', 'health'],
  ];
  const run = ([label, path, kind]) => probe(label, new URL(path, origin).href, kind, fetcher);
  const results = [];
  if (mode === 'sequential') {
    for (const spec of specs) results.push(await run(spec));
  } else results.push(...await Promise.all(specs.map(run)));
  const script = results.find(result => result.entryScript)?.entryScript;
  if (script) results.push(await probe('فایل اجرایی AUS', new URL(script, origin).href, 'script', fetcher));
  return results;
}

if (typeof document !== 'undefined') {
  const run = document.getElementById('run');
  const copy = document.getElementById('copy');
  const modePicker = document.getElementById('mode');
  run.addEventListener('click', async () => {
    run.disabled = true; copy.disabled = true;
    const mode = modePicker.value;
    modePicker.disabled = true;
    document.getElementById('status').textContent = 'در حال بررسی؛ هر مسیر حداکثر ۸ ثانیه. بررسی تکی ممکن است حدود یک دقیقه طول بکشد…';
    document.getElementById('results').replaceChildren();
    const results = await runChecks(location.origin, fetch, mode);
    for (const result of results) {
      const row = document.createElement('tr');
      for (const value of [result.label, (result.status || '') + ' ' + result.outcome + (result.detail ? ' — ' + result.detail : ''), result.ms + ' ms']) {
        const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
      }
      document.getElementById('results').append(row);
    }
    const nav = performance.getEntriesByType('navigation')[0];
    const navigation = nav ? {dnsMs: Math.round(nav.domainLookupEnd - nav.domainLookupStart),
      connectMs: Math.round(nav.connectEnd - nav.connectStart), firstByteMs: Math.round(nav.responseStart - nav.requestStart),
      downloadMs: Math.round(nav.responseEnd - nav.responseStart), protocol: nav.nextHopProtocol || 'unknown', serviceWorker: nav.workerStart > 0} : null;
    document.getElementById('report').textContent = JSON.stringify({version:2, mode, origin: location.origin,
      checkedAt: new Date().toISOString(), navigation, results}, null, 2);
    document.getElementById('status').textContent = 'بررسی تمام شد. وضعیت VPN و نام اپراتور را همراه گزارش بفرستید.';
    run.disabled = false; copy.disabled = false; modePicker.disabled = false;
  });
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(document.getElementById('report').textContent); }
    catch { document.getElementById('status').textContent = 'متن گزارش پایین صفحه را انتخاب و کپی کنید.'; }
  });
}
