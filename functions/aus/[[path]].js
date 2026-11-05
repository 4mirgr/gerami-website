// This gateway has no database credentials. The existing Worker remains the
// authority for verified sessions, membership and owner-scoped integrations.
const WORKER_ORIGIN = 'https://immi-arash-amir.dr-gerami-md.workers.dev';
const SUPABASE_ORIGIN = 'https://waxpjylnvwqdlktayyww.supabase.co';
const BLOCKED_OAUTH = new Set([
  '/api/google/launch', '/api/google/callback',
  '/api/linkedin/connect', '/api/linkedin/callback',
]);

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {status, headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  }});
}

function forwardedHeaders(request, origin) {
  const headers = new Headers();
  // Never forward unrelated host cookies, spoofed proxy headers or credentials
  // destined for other services. Application bearer tokens are unchanged.
  for (const name of ['Authorization', 'Content-Type', 'Accept', 'apikey', 'If-Match', 'If-None-Match']) {
    if (request.headers.has(name)) headers.set(name, request.headers.get(name));
  }
  if (request.headers.has('Origin')) headers.set('Origin', origin);
  return headers;
}

function privateResponse(response) {
  // No provider redirect or OAuth cookies may silently cross host boundaries.
  if (response.status >= 300 && response.status < 400) return json({error: 'upstream_redirect_rejected'}, 502);
  const headers = new Headers();
  for (const name of ['Content-Type', 'Content-Disposition', 'Retry-After']) {
    if (response.headers.has(name)) headers.set(name, response.headers.get(name));
  }
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  return new Response(response.body, {status: response.status, headers});
}

async function boundedText(request, limit) {
  if (Number(request.headers.get('Content-Length') || 0) > limit) throw Error('size');
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let size = 0;
  for (;;) {
    const {value, done} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw Error('size'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

function validAuthQuery(url, endpoint) {
  const entries = [...url.searchParams];
  if (endpoint === 'token') return entries.length === 1 && entries[0][0] === 'grant_type'
    && ['password', 'refresh_token'].includes(entries[0][1]);
  if (endpoint === 'signup') return entries.length === 1 && entries[0][0] === 'redirect_to'
    && entries[0][1] === url.origin + '/aus/';
  return entries.length === 0;
}

export async function onRequest({request, env, next}) {
  const url = new URL(request.url);
  const api = url.pathname === '/aus/api' || url.pathname.startsWith('/aus/api/');
  const auth = url.pathname === '/aus/supabase' || url.pathname.startsWith('/aus/supabase/');
  if (!api && !auth) return next();
  // Reject ambiguous path spellings, including encoded OAuth-route bypasses.
  if (/%|\\|\/\//.test(url.pathname)) return json({error: 'invalid_path'}, 400);
  if (!env.AUS_APP || typeof env.AUS_APP.fetch !== 'function') return json({error: 'aus_service_binding_required'}, 503);
  if (request.method !== 'GET' && request.headers.get('Origin') !== url.origin) return json({error: 'origin_rejected'}, 403);

  if (api) {
    if (!['GET', 'POST', 'PUT'].includes(request.method)) return json({error: 'method_not_allowed'}, 405);
    const path = url.pathname.slice('/aus'.length);
    if (BLOCKED_OAUTH.has(path)) return json({error: 'oauth_domain_setup_required'}, 503);
    if (!path.startsWith('/api/')) return json({error: 'not_found'}, 404);
    const target = WORKER_ORIGIN + path + url.search;
    try {
      const upstream = new Request(new Request(target, request), {
        headers: forwardedHeaders(request, path === '/api/google/start' ? url.origin : WORKER_ORIGIN), redirect: 'manual',
      });
      const response = await env.AUS_APP.fetch(upstream);
      if (path === '/api/google/start' && request.method === 'POST' && response.ok) {
        // New consent is launched by a top-level form POST on the existing
        // canonical OAuth host. Never transplant host cookies across domains.
        const launch = JSON.parse(await boundedText(response, 16384));
        let authorization;
        try { authorization = new URL(launch.authorizationUrl); } catch {}
        if (launch.launchUrl !== WORKER_ORIGIN + '/api/google/launch'
          || launch.oauthOrigin !== WORKER_ORIGIN
          || !/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/.test(launch.launchTicket)
          || !/^[A-Za-z0-9_-]{43}$/.test(launch.callbackNonce)
          || authorization?.origin !== 'https://accounts.google.com'
          || authorization.searchParams.get('redirect_uri') !== WORKER_ORIGIN + '/api/google/callback') {
          return json({error: 'oauth_domain_setup_required'}, 503);
        }
        return json({authorizationUrl: launch.authorizationUrl, launchUrl: launch.launchUrl,
          launchTicket: launch.launchTicket, callbackNonce: launch.callbackNonce,
          oauthOrigin: WORKER_ORIGIN});
      }
      if (path === '/api/public-config' && request.method === 'GET' && response.ok) {
        const config = JSON.parse(await boundedText(response, 65536));
        if (config.mode !== 'cloud' || config.authRequired !== true || config.supabaseUrl !== SUPABASE_ORIGIN
          || typeof config.publishableKey !== 'string' || !config.publishableKey) return json({error: 'invalid_auth_configuration'}, 502);
        return json({mode: 'cloud', authRequired: true, supabaseUrl: url.origin + '/aus/supabase', publishableKey: config.publishableKey});
      }
      return privateResponse(response);
    } catch {
      return json({error: 'aus_upstream_unavailable'}, 502);
    }
  }

  const endpoint = url.pathname.slice('/aus/supabase/auth/v1/'.length);
  if (!url.pathname.startsWith('/aus/supabase/auth/v1/') || !['token', 'signup', 'logout'].includes(endpoint)) return json({error: 'auth_endpoint_not_allowed'}, 404);
  if (request.method !== 'POST') return json({error: 'method_not_allowed'}, 405);
  if (!validAuthQuery(url, endpoint)) return json({error: 'auth_query_not_allowed'}, 400);
  let body;
  try { body = await boundedText(request, 65536); }
  catch { return json({error: 'payload_too_large'}, 413); }
  try {
    const response = await fetch(SUPABASE_ORIGIN + '/auth/v1/' + endpoint + url.search, {
      method: 'POST', headers: forwardedHeaders(request, SUPABASE_ORIGIN),
      body: body || undefined, redirect: 'manual', signal: AbortSignal.timeout(20000),
    });
    return privateResponse(response);
  } catch {
    return json({error: 'aus_auth_unavailable'}, 502);
  }
}
