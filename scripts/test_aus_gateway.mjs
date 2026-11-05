import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = await readFile(new URL('../functions/aus/[[path]].js', import.meta.url), 'utf8');
const {onRequest} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const PUBLIC = 'https://drgerami-md.ir';
const WORKER = 'https://immi-arash-amir.dr-gerami-md.workers.dev';
const SUPABASE = 'https://waxpjylnvwqdlktayyww.supabase.co';
const reply = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {status, headers: {'Content-Type': 'application/json', ...headers}});
function invoke(path, {method = 'GET', headers = {}, body, binding} = {}) {
  return onRequest({request: new Request(PUBLIC + path, {method, headers, body}),
    env: binding ? {AUS_APP: {fetch: binding}} : {}, next: () => new Response('static')});
}

test('static assets and unrelated IntMed API pass through without a binding', async () => {
  for (const path of ['/aus/', '/aus/assets/app.js', '/api/public-config', '/intmed/']) {
    assert.equal(await (await invoke(path)).text(), 'static');
  }
});

test('missing binding denies API and auth instead of returning a static shell', async () => {
  for (const path of ['/aus/api/me', '/aus/supabase/auth/v1/token?grant_type=password']) {
    const response = await invoke(path);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
});

test('API preserves bearer, own/foreign profile requests and upstream denial', async () => {
  for (const profile of ['amir', 'arash']) {
    const response = await invoke('/aus/api/profiles?profile=' + profile, {headers: {Authorization: 'Bearer owner-token', Cookie: 'unrelated=private'}, binding: async request => {
      assert.equal(request.url, WORKER + '/api/profiles?profile=' + profile);
      assert.equal(request.headers.get('Authorization'), 'Bearer owner-token');
      assert.equal(request.headers.get('Cookie'), null);
      assert.equal(request.redirect, 'manual');
      return reply(profile === 'amir' ? {profileId: 'amir'} : {error: 'Profile access denied'}, profile === 'amir' ? 200 : 403,
        {'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*', 'Set-Cookie': 'private=bad'});
    }});
    assert.equal(response.status, profile === 'amir' ? 200 : 403);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('Set-Cookie'), null);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  }
});

test('write Origin is verified before translation; missing/cross-site origins never reach Worker', async () => {
  for (const origin of [undefined, 'null', 'https://evil.invalid', WORKER]) {
    const response = await invoke('/aus/api/settings', {method: 'PUT', headers: origin ? {Origin: origin} : {}, body: '{}', binding: () => assert.fail('must not forward')});
    assert.equal(response.status, 403);
  }
  const response = await invoke('/aus/api/settings', {method: 'PUT', headers: {Origin: PUBLIC, Authorization: 'Bearer a', 'Content-Type': 'application/json'}, body: '{"profile":"arash"}', binding: async request => {
    assert.equal(request.headers.get('Origin'), WORKER);
    assert.equal(request.headers.get('Authorization'), 'Bearer a');
    assert.equal(await request.text(), '{"profile":"arash"}');
    return reply({error: 'Profile access denied'}, 403);
  }});
  assert.equal(response.status, 403);
});

test('public config is bound to the dedicated project and rewritten to same origin', async () => {
  const config = {mode: 'cloud', authRequired: true, supabaseUrl: SUPABASE, publishableKey: 'sb_publishable_example'};
  assert.deepEqual(await (await invoke('/aus/api/public-config', {binding: async () => reply(config)})).json(), {...config, supabaseUrl: PUBLIC + '/aus/supabase'});
  for (const invalid of [{...config, authRequired: false}, {...config, supabaseUrl: 'https://unrelated.supabase.co'}]) {
    assert.equal((await invoke('/aus/api/public-config', {binding: async () => reply(invalid)})).status, 502);
  }
});

test('new OAuth flows fail closed while existing connection status still forwards', async () => {
  for (const path of ['/google/launch', '/google/callback', '/linkedin/connect', '/linkedin/callback']) {
    const response = await invoke('/aus/api' + path, {headers: {Origin: PUBLIC}, binding: () => assert.fail('OAuth must not forward')});
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, 'oauth_domain_setup_required');
  }
  for (const path of ['/google/status', '/linkedin/connection']) {
    assert.equal((await invoke('/aus/api' + path, {binding: async () => reply({connected: true})})).status, 200);
  }
});

test('Google start keeps the actual app Origin and requires canonical one-use POST launch', async () => {
  const launch = {authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=' + encodeURIComponent(WORKER + '/api/google/callback'), launchUrl: WORKER + '/api/google/launch', launchTicket: 'a'.repeat(43) + '.' + 'b'.repeat(43), callbackNonce: 'c'.repeat(43), oauthOrigin: WORKER};
  const response = await invoke('/aus/api/google/start?profile=amir&mailbox=secondary', {
    method: 'POST', headers: {Origin: PUBLIC, Authorization: 'Bearer synthetic-owner', Cookie: 'unrelated=value', 'Content-Type': 'application/json'}, body: '{}',
    binding: async request => {
      assert.equal(request.url, WORKER + '/api/google/start?profile=amir&mailbox=secondary');
      assert.equal(request.headers.get('Origin'), PUBLIC);
      assert.equal(request.headers.get('Authorization'), 'Bearer synthetic-owner');
      assert.equal(request.headers.get('Cookie'), null);
      return reply(launch, 200, {'Set-Cookie': '__Host-immi_google_oauth=must-stay-canonical'});
    },
  });
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), launch);
  assert.equal(response.headers.get('Set-Cookie'), null);
  for (const invalid of [{authorizationUrl: launch.authorizationUrl}, {...launch, launchUrl: 'https://evil.invalid/api/google/launch'}, {...launch, launchTicket: 'bad'}]) {
    const result = await invoke('/aus/api/google/start', {method: 'POST', headers: {Origin: PUBLIC}, body: '{}', binding: async () => reply(invalid)});
    assert.equal(result.status, 503);
  }
});

test('ambiguous paths and unsupported API methods are rejected', async () => {
  for (const path of ['/aus/api/google/%73tart', '/aus/api//evil.invalid/me', '/aus/api/%2F%2Fevil.invalid']) {
    assert.equal((await invoke(path, {binding: () => assert.fail('must not forward')})).status, 400);
  }
  assert.equal((await invoke('/aus/api/me', {method: 'DELETE', headers: {Origin: PUBLIC}, binding: () => assert.fail('must not forward')})).status, 405);
});

test('upstream errors and redirects fail closed without leaking payload details', async () => {
  assert.equal((await invoke('/aus/api/me', {binding: async () => {throw Error('secret');}})).status, 502);
  const response = await invoke('/aus/api/me', {binding: async () => new Response(null, {status: 302, headers: {Location: 'https://evil.invalid', 'Set-Cookie': 'x=y'}})});
  assert.equal(response.status, 502);
  assert.equal(response.headers.get('Location'), null);
  assert.equal(response.headers.get('Set-Cookie'), null);
});

test('Supabase login/refresh/signup/logout use only fixed auth origin and no-store responses', async () => {
  const originalFetch = globalThis.fetch;
  const paths = ['token?grant_type=password', 'token?grant_type=refresh_token', 'signup?redirect_to=' + encodeURIComponent(PUBLIC + '/aus/'), 'logout'];
  globalThis.fetch = async (target, options) => {
    assert.ok(paths.some(path => target === SUPABASE + '/auth/v1/' + path));
    assert.equal(options.headers.get('Origin'), SUPABASE);
    assert.equal(options.headers.get('apikey'), 'public-key');
    assert.equal(options.headers.get('Authorization'), 'Bearer owner-token');
    assert.equal(options.headers.get('Cookie'), null);
    assert.equal(options.redirect, 'manual');
    return reply({access_token: 'mock-only'}, 200, {'Cache-Control': 'public'});
  };
  try {
    for (const path of paths) {
      const response = await invoke('/aus/supabase/auth/v1/' + path, {method: 'POST', headers: {Origin: PUBLIC, apikey: 'public-key', Authorization: 'Bearer owner-token', Cookie: 'x=y'}, body: '{}', binding: () => assert.fail('auth uses fixed Supabase origin')});
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
    }
  } finally { globalThis.fetch = originalFetch; }
});

test('auth proxy rejects admin/REST, provider flows, unsafe redirects and cross-site requests without fetch', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => assert.fail('invalid auth route must not reach network');
  try {
    for (const path of ['/auth/v1/admin/users', '/rest/v1/immi_profiles', '/auth/v1/authorize', '/auth/v1/token?grant_type=client_credentials', '/auth/v1/token?grant_type=password&grant_type=refresh_token', '/auth/v1/signup?redirect_to=https://evil.invalid', '/auth/v1/logout?target=https://evil.invalid']) {
      const response = await invoke('/aus/supabase' + path, {method: 'POST', headers: {Origin: PUBLIC}, body: '{}', binding: () => assert.fail()});
      assert.ok([400, 404].includes(response.status));
    }
    assert.equal((await invoke('/aus/supabase/auth/v1/logout', {method: 'POST', headers: {Origin: 'https://evil.invalid'}, binding: () => {}})).status, 403);
    assert.equal((await invoke('/aus/supabase/auth/v1/logout', {method: 'GET', binding: () => {}})).status, 405);
    assert.equal((await invoke('/aus/supabase/auth/v1/logout', {method: 'POST', headers: {Origin: PUBLIC}, body: 'x'.repeat(65537), binding: () => {}})).status, 413);
  } finally { globalThis.fetch = originalFetch; }
});

test('password recovery forwards only an email and an exact app redirect', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (target, options) => {
    calls++;
    assert.equal(target, SUPABASE + '/auth/v1/recover?redirect_to=' + encodeURIComponent(PUBLIC + '/aus/'));
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.get('Origin'), SUPABASE);
    assert.equal(options.headers.get('Cookie'), null);
    assert.equal(options.redirect, 'manual');
    assert.deepEqual(JSON.parse(options.body), {email: 'owner@example.invalid'});
    return reply({});
  };
  const invokeRecover = (query, body, origin = PUBLIC) => invoke('/aus/supabase/auth/v1/recover' + query,
    {method: 'POST', headers: {Origin: origin, apikey: 'public-key', Cookie: 'private=bad'}, body: JSON.stringify(body), binding: () => assert.fail()});
  try {
    const query = '?redirect_to=' + encodeURIComponent(PUBLIC + '/aus/');
    assert.equal((await invokeRecover(query, {email: 'owner@example.invalid'})).status, 200);
    for (const invalidQuery of ['', '?redirect_to=https://evil.invalid', '?redirect_to=' + encodeURIComponent(PUBLIC + '/intmed/'), query + '&extra=1', query + '&redirect_to=https://evil.invalid']) {
      assert.equal((await invokeRecover(invalidQuery, {email: 'owner@example.invalid'})).status, 400);
    }
    for (const payload of [{}, {email: 'bad'}, {email: 'owner@example.invalid', data: {role: 'admin'}}, {email: 'owner@example.invalid', password: 'unwanted'}]) {
      assert.equal((await invokeRecover(query, payload)).status, 400);
    }
    assert.equal((await invokeRecover(query, {email: 'owner@example.invalid'}, 'https://evil.invalid')).status, 403);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test('recovery user lookup and password update preserve bearer, deny unrelated mutations and provider redirects', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  let redirect = false;
  globalThis.fetch = async (target, options) => {
    calls++;
    assert.equal(target, SUPABASE + '/auth/v1/user');
    assert.equal(options.headers.get('Authorization'), 'Bearer synthetic-recovery');
    assert.equal(options.headers.get('Cookie'), null);
    assert.equal(options.redirect, 'manual');
    if (redirect) return new Response(null, {status: 302, headers: {Location: 'https://evil.invalid'}});
    if (options.method === 'GET') { assert.equal(options.body, undefined); return reply({id: 'synthetic-user', email: 'owner@example.invalid'}); }
    assert.equal(options.method, 'PUT');
    assert.deepEqual(JSON.parse(options.body), {password: 'synthetic-new-password'});
    return reply({id: 'synthetic-user'});
  };
  const user = (method, body, headers = {Origin: PUBLIC, Authorization: 'Bearer synthetic-recovery', Cookie: 'never=forward'}) => invoke('/aus/supabase/auth/v1/user',
    {method, headers, body: body === undefined ? undefined : JSON.stringify(body), binding: () => assert.fail()});
  try {
    const read = await user('GET'); assert.equal(read.status, 200); assert.equal(read.headers.get('Cache-Control'), 'no-store');
    assert.equal((await user('PUT', {password: 'synthetic-new-password'})).status, 200);
    for (const payload of [{password: 'short'}, {email: 'new@example.invalid'}, {password: 'synthetic-new-password', email: 'new@example.invalid'}, {password: 'synthetic-new-password', data: {role: 'admin'}}, [], null]) {
      assert.equal((await user('PUT', payload)).status, 400);
    }
    assert.equal((await user('GET', undefined, {})).status, 401);
    assert.equal((await user('GET', undefined, {Authorization: 'Bearer synthetic-recovery', Origin: 'https://evil.invalid'})).status, 403);
    assert.equal((await user('POST', {})).status, 405);
    assert.equal((await invoke('/aus/supabase/auth/v1/user?email=other', {headers: {Authorization: 'Bearer synthetic-recovery'}, binding: () => assert.fail()})).status, 400);
    assert.equal(calls, 2);
    redirect = true;
    const result = await user('GET'); assert.equal(result.status, 502); assert.equal(result.headers.get('Location'), null);
  } finally { globalThis.fetch = originalFetch; }
});
