import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source = await readFile(new URL('../deploy/connection-check.js', import.meta.url), 'utf8');
const {probe, runChecks} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
let requests = [];
const fetcher = async (url, options) => {
  requests.push({url, options});
  return new Response(JSON.stringify({mode:'cloud',authRequired:true,supabaseUrl:'https://example.org/aus/supabase',publishableKey:'do-not-report-this-key'}), {headers:{'content-type':'application/json'}});
};
const config = await probe('config', 'https://example.org/aus/api/public-config', 'aus-config', fetcher);
assert.equal(config.outcome, 'ok');
assert.ok(!JSON.stringify(config).includes('do-not-report-this-key'));
const html = '<div id="root"></div><script type="module" src="/aus/assets/index-abc123.js"></script>';
const entry = await probe('html', 'https://example.org/aus/', 'aus-html', async()=>new Response(html));
assert.equal(entry.entryScript, '/aus/assets/index-abc123.js');
assert.equal(entry.outcome, 'ok');
const bundle = await probe('js', 'https://example.org/aus/assets/index-abc123.js', 'script', async()=>new Response('<html>wrong fallback</html>', {headers:{'content-type':'text/html'}}));
assert.equal(bundle.outcome, 'unexpected_content');
assert.equal((await probe('bad-config', 'https://example.org/aus/api/public-config', 'aus-config', async()=>new Response('{}'))).outcome, 'unexpected_config');
const missing = await probe('missing', 'https://example.org/aus/api/public-config', 'aus-config', async()=>new Response('{"error":"aus_service_binding_required","secret":"private"}', {status:503}));
assert.equal(missing.detail, 'aus_service_binding_required');
assert.ok(!JSON.stringify(missing).includes('private'));
const timeout = await probe('hang', 'https://example.org/', 'asset', ()=>new Promise(()=>{}), 10);
assert.equal(timeout.outcome, 'timeout');
const cors = await probe('cors', 'https://example.org/', 'asset', async()=>{throw Error('private network detail');});
assert.equal(cors.outcome, 'network_or_cors_error');
assert.ok(!JSON.stringify(cors).includes('private network detail'));
requests = [];
await runChecks('https://example.org', fetcher);
assert.equal(requests.length, 7);
for (const {url, options} of requests) {
  assert.equal(options.method, 'GET');
  assert.equal(options.credentials, 'omit');
  assert.equal(options.cache, 'no-store');
  assert.ok(!options.headers && !options.body);
  assert.ok(!/token|rest\/v1|functions\/v1|logout/.test(url));
}
console.log('PASS: read-only public probes; bounded timeout; redacted reports; fail-closed config detection.');
