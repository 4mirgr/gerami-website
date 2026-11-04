import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = process.env.GERAMI_SITE_DIR ? resolve(process.env.GERAMI_SITE_DIR) : fileURLToPath(new URL('../_site/',import.meta.url));

const callbacks = {};
const removed = [];
const context = vm.createContext({
  URL,
  self: {registration: {scope: 'https://drgerami-md.ir/intmed/'}, location: {origin:'https://drgerami-md.ir'}, clients:{claim:async()=>{}}, addEventListener:(event,fn)=>{callbacks[event]=fn}},
  caches:{keys:async()=>['intmed-pwa-old-shell','intmed-subpath-old-shell','unrelated-cache'],delete:async key=>{removed.push(key)}}
});
vm.runInContext(await readFile(join(site,'intmed/sw.js'), 'utf8'),context);
for (const path of ['manifest.json','taxonomy.json','search-index.json','library-index.json','topics/example.json']) {
  assert.equal(vm.runInContext(`liveContent(new URL('https://drgerami-md.ir/intmed/content/${path}'))`,context),true,path);
}
assert.equal(vm.runInContext("privateRequest(new URL('https://drgerami-md.ir/api/auth/v1/token'))",context),true);
assert.equal(vm.runInContext("publicAsset(new URL('https://drgerami-md.ir/intmed/config.js'))",context),false);
assert.equal(vm.runInContext("publicAsset(new URL('https://drgerami-md.ir/intmed/js/intmed-app.js'))",context),true);
let activated;
callbacks.activate({waitUntil:promise=>{activated=promise}}); await activated;
assert.deepEqual(removed,['intmed-subpath-old-shell'],'new worker cleans only its own namespace');

let unregistered=0, skipped=0;
const legacyCallbacks={}; const legacyRemoved=[];
const legacy=vm.createContext({URL,self:{registration:{scope:'https://drgerami-md.ir/',unregister:async()=>{unregistered++}},skipWaiting:()=>{skipped++},addEventListener:(event,fn)=>{legacyCallbacks[event]=fn}},caches:{keys:async()=>['intmed-pwa-old-shell','intmed-subpath-current-shell','unrelated-cache'],delete:async key=>{legacyRemoved.push(key)}}});
vm.runInContext(await readFile(new URL('../deploy/retire-legacy-sw.js',import.meta.url),'utf8'),legacy);
legacyCallbacks.install(); legacyCallbacks.activate({waitUntil:promise=>{activated=promise}}); await activated;
assert.equal(skipped,1); assert.equal(unregistered,1);
assert.deepEqual(legacyRemoved,['intmed-pwa-old-shell'],'legacy retirement preserves new app and unrelated caches');
console.log('PASS: subpath live content stays network-first; private/config requests excluded; scoped cache cleanup; root legacy worker retirement preserves the new app and unrelated caches.');

const migration = await readFile(new URL('../deploy/legacy-intmed-links.js',import.meta.url),'utf8');
for (const [path,hash,expected] of [
  ['/','#type=recovery&access_token=SYNTHETIC','/intmed/?source=mail#type=recovery&access_token=SYNTHETIC'],
  ['/index.html','#type=invite&access_token=SYNTHETIC','/intmed/?source=mail#type=invite&access_token=SYNTHETIC'],
  ['/','#dashboard',null], ['/','#type=recovery',null], ['/aus/','#type=recovery&access_token=SYNTHETIC',null]
]) {
  let destination=null;
  vm.runInNewContext(migration,{URLSearchParams,location:{pathname:path,hash,search:'?source=mail',replace:value=>{destination=value}}});
  assert.equal(destination,expected,'Only legacy recovery/invite links move, keeping their fragment on the same origin');
}
console.log('PASS: legacy recovery/invite links preserve synthetic fragments on the same origin; normal homepage/AUS links do not redirect.');
