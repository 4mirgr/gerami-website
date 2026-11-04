import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const combined = process.env.COMBINED_SITE === '1';
const baseURL = (process.env.GERAMI_PREVIEW_URL || 'http://127.0.0.1:4173').replace(/\/$/,'');
const projectOrigin = combined ? baseURL : 'https://drgerami-md.ir';

const dir = await mkdtemp(join(tmpdir(), 'gerami-browser-'));
const proc = spawn('chromium', ['--headless', '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-port=0', '--user-data-dir=' + dir, 'about:blank'], {stdio: ['ignore', 'ignore', 'pipe']});
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(Error('Chromium startup timed out')), 20000);
    proc.stderr.on('data', chunk => {
      output += chunk;
      const found = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (found) { clearTimeout(timer); resolve(found[1]); }
    });
    proc.once('error', reject);
    proc.once('exit', code => { clearTimeout(timer); reject(Error('Chromium exited: ' + code + ' ' + output.slice(-1000))); });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, {once:true}); socket.addEventListener('error', reject, {once:true}); });
  let seq = 0;
  const pending = new Map();
  const errors = [];
  const responses = [];
  const requests = [];
  let loadResolve;
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const {resolve, reject, timer} = pending.get(message.id);
      pending.delete(message.id); clearTimeout(timer);
      if (message.error) reject(Error(JSON.stringify(message.error))); else resolve(message.result);
    }
    if (message.method === 'Page.loadEventFired') loadResolve?.();
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text + ': ' + (message.params.exceptionDetails.exception?.description || ''));
    if (message.method === 'Network.responseReceived') responses.push({url:message.params.response.url, status:message.params.response.status});
    if (message.method === 'Network.requestWillBeSent') requests.push(message.params.request.url);
  });
  function send(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => {pending.delete(id); reject(Error('Timeout: ' + method));}, 15000);
      pending.set(id, {resolve,reject,timer});
      socket.send(JSON.stringify({id,method,params,...(sessionId ? {sessionId} : {})}));
    });
  }
  const {targetId} = await send('Target.createTarget', {url:'about:blank'});
  const {sessionId} = await send('Target.attachToTarget', {targetId,flatten:true});
  const call = (method, params={}) => send(method,params,sessionId);
  await call('Page.enable'); await call('Runtime.enable'); await call('Network.enable');
  async function evaluate(expression) {
    const result = await call('Runtime.evaluate', {expression,returnByValue:true,awaitPromise:true});
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  async function navigate(path) {
    let timer;
    const loaded = new Promise((resolve,reject) => {
      loadResolve = resolve;
      timer = setTimeout(() => reject(Error('Navigation timeout: '+path)),15000);
    });
    try {
      const navigation = await call('Page.navigate',{url:baseURL+'/'+path});
      if (navigation.errorText) throw Error('Cannot load '+path+': '+navigation.errorText+'; start the local server at '+baseURL+'.');
      await loaded;
    }
    finally {clearTimeout(timer);loadResolve=null;}
  }
  const pages = ['', 'pages/about.html','pages/services.html','pages/blog.html','pages/projects.html','pages/contact.html','pages/appointments.html','pages/beyond.html'];
  let checks=0;
  for (const width of [1440,390,320]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
    for (const page of pages) {
      await navigate(page);
      await evaluate("localStorage.setItem('ahg-lang','fa'); document.documentElement.lang === 'en' && document.querySelector('[data-language-toggle]').click()");
      const faTitle = await evaluate('document.title');
      for (const language of ['fa','en']) {
        if (language === 'en') await evaluate("document.querySelector('[data-language-toggle]').click()");
        const state = await evaluate(`({lang:document.documentElement.lang,dir:document.documentElement.dir,overflow:document.documentElement.scrollWidth>innerWidth+1, headings:document.querySelectorAll('h1').length, title:document.title, untranslated:[...document.querySelectorAll('[data-fa][data-en]')].filter(e=>e.textContent!==e.dataset[document.documentElement.lang]).length})`);
        assert.equal(state.lang,language,page); assert.equal(state.dir,language==='fa'?'rtl':'ltr',page);
        assert.equal(state.overflow,false,'Horizontal overflow '+width+' '+language+' '+page);
        assert.equal(state.headings,1,page); assert.equal(state.untranslated,0,page);
        if (page === '' || page === 'pages/projects.html') {
          assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-app-entry]')].map(link=>[link.dataset.appEntry,link.href])"), [
            ['intmed',projectOrigin+'/intmed/'], ['aus',projectOrigin+'/aus/']
          ], 'Project entries must stay on the .ir domain');
        }
        if(language==='en') assert.notEqual(state.title,faTitle,'Localized title '+page);
        checks++;
      }
      await evaluate("document.querySelector('[data-language-toggle]').click()");
    }
  }
  await navigate('');
  await evaluate("document.querySelector('.mobile-menu summary').focus(); document.querySelector('.mobile-menu summary').click()");
  assert.equal(await evaluate("document.querySelector('.mobile-menu').open"),true);
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});
  assert.equal(await evaluate("document.querySelector('.mobile-menu').open"),false);
  assert.equal(await evaluate("document.activeElement.tagName"),'SUMMARY');
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.animate-in')).animationName"),'none');
  await call('Emulation.setEmulatedMedia',{features:[]});
  // Blocked storage must not prevent language switching or link hydration.
  const {identifier} = await call('Page.addScriptToEvaluateOnNewDocument',{source:"Object.defineProperty(window,'localStorage',{get(){throw new Error('Storage blocked')}})"});
  await navigate('');
  await evaluate("document.querySelector('[data-language-toggle]').click()");
  assert.equal(await evaluate('document.documentElement.lang'),'en');
  await call('Page.removeScriptToEvaluateOnNewDocument',{identifier});
  // Exercise configured destinations and reject unsafe schemes, not just the default fallback.
  const config = await call('Page.addScriptToEvaluateOnNewDocument',{source:"addEventListener('DOMContentLoaded',()=>{window.SITE_LINKS={intmed:'/intmed/',aus:'/aus/',linkedin:'https://www.linkedin.com/in/example/',email:'mailto:public@example.com',phone:'tel:+982100000000',appointment:'javascript:alert(1)'};const s=document.createElement('script');s.src='/js/main.js';document.head.append(s)},{once:true})"});
  await navigate('pages/projects.html');
  // A separately appended local script may finish after load in cached runs.
  for(let i=0;i<40;i++) {
    if(await evaluate("document.querySelector('[data-destination=intmed]').pathname==='/intmed/'")) break;
    await new Promise(resolve=>setTimeout(resolve,25));
  }
  assert.equal(await evaluate("document.querySelector('[data-destination=intmed]').pathname"),'/intmed/');
  assert.equal(await evaluate("document.querySelector('[data-destination=aus]').pathname"),'/aus/');
  assert.equal(await evaluate("document.querySelector('[data-pending=intmed]').hidden"),true);
  await navigate('pages/appointments.html');
  assert.equal(await evaluate("document.querySelector('[data-pending=appointment]').hidden"),false);
  await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:config.identifier});
  // Remote app URLs must not replace the public .ir entry with a third-party host.
  const remoteConfig = await call('Page.addScriptToEvaluateOnNewDocument',{source:"addEventListener('DOMContentLoaded',()=>{window.SITE_LINKS={intmed:'https://external.example/intmed/',aus:'https://external.example/aus/'};const s=document.createElement('script');s.src='/js/main.js';document.head.append(s)},{once:true})"});
  await navigate('pages/projects.html');
  await evaluate("new Promise(resolve=>setTimeout(resolve,100))");
  assert.equal(await evaluate("document.querySelector('[data-destination=intmed]')."+(combined?'pathname':'hash')),combined?'/intmed/':'#intmed');
  assert.equal(await evaluate("document.querySelector('[data-destination=aus]')."+(combined?'pathname':'hash')),combined?'/aus/':'#aus');
  assert.equal(await evaluate("document.querySelector('[data-pending=intmed]').hidden"),combined);
  await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:remoteConfig.identifier});
  // JavaScript disabled: content and native mobile menu still work.
  await call('Emulation.setScriptExecutionDisabled',{value:true});
  await navigate('');
  assert.equal(await evaluate("document.querySelector('h1').textContent"),'دکتر امیرهوشنگ گرامی');
  assert.equal(await evaluate("document.querySelector('[data-language-toggle]').hidden"),true);
  assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-app-entry]')].map(link=>link.href)"),[projectOrigin+'/intmed/',projectOrigin+'/aus/']);
  await evaluate("document.querySelector('.mobile-menu summary').click()");
  assert.equal(await evaluate("document.querySelector('.mobile-menu').open"),true);
  await call('Emulation.setScriptExecutionDisabled',{value:false});
  if (combined) {
    await navigate('aus/');
    for (let i=0;i<100;i++) {
      if (await evaluate("document.querySelector('#stats').children.length>0")) break;
      await new Promise(resolve=>setTimeout(resolve,25));
    }
    assert.equal(await evaluate("document.querySelector('#load-error').hidden"),true);
    assert.equal(await evaluate("document.querySelector('#stats').children.length>0"),true,'AUS data loads under /aus/');
    await evaluate("document.querySelector('a[data-section=tracker]').click(); document.querySelector('#task-title').value='Synthetic subpath smoke test'; document.querySelector('#task-form').requestSubmit()");
    assert.equal(await evaluate("[...document.querySelectorAll('#task-list input[data-field=title]')].some(input=>input.value==='Synthetic subpath smoke test')"),true);
    assert.equal(await evaluate("localStorage.getItem('medpath.v2.tasks').includes('Synthetic subpath smoke test')"),true,'AUS task storage preserved');
    // Change the query too: an identical hash-only navigation has no load event.
    await navigate('aus/?smoke=reload#tracker');
    for (let i=0;i<100;i++) {
      if (await evaluate("[...document.querySelectorAll('#task-list input[data-field=title]')].some(input=>input.value==='Synthetic subpath smoke test')")) break;
      await new Promise(resolve=>setTimeout(resolve,25));
    }
    assert.equal(await evaluate("[...document.querySelectorAll('#task-list input[data-field=title]')].some(input=>input.value==='Synthetic subpath smoke test')"),true,'AUS task survives a fresh navigation under its own subpath');
    await navigate('intmed/');
    assert.equal(await evaluate("getComputedStyle(document.querySelector('#loginGate')).display!=='none'"),true,'IntMed login gate loads');
    assert.equal(await evaluate("typeof window.IntMedBackend"),'object','IntMed backend adapter is present');
    assert.equal(await evaluate("new URL(document.querySelector('link[rel=manifest]').getAttribute('href'),location.href).pathname"),'/intmed/manifest.webmanifest');
    const scope = await evaluate("Promise.race([navigator.serviceWorker.ready.then(registration=>new URL(registration.scope).pathname),new Promise(resolve=>setTimeout(()=>resolve('timeout'),7000))])");
    assert.equal(scope,'/intmed/','IntMed worker must not control the personal site or AUS');
    await navigate('');
    assert.equal(await evaluate("navigator.serviceWorker.controller === null"),true,'Personal homepage stays outside the IntMed worker scope');
    console.log('PASS: AUS loads all data under /aus/ and persists a synthetic local task; IntMed login, assets and backend adapter load under /intmed/; installed worker is scoped to /intmed/. No real user or API writes were made.');
  }
  await navigate('');
  await evaluate("document.documentElement.lang === 'en' && document.querySelector('[data-language-toggle]').click()");
  await evaluate("Promise.all(document.getAnimations().map(animation=>animation.finished.catch(()=>{})))");
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
  await writeFile('/tmp/gerami-mobile.png',Buffer.from((await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await writeFile('/tmp/gerami-desktop.png',Buffer.from((await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));
  assert.deepEqual(errors,[],'Runtime errors');
  assert.deepEqual(responses.filter(response=>response.status>=400),[],'HTTP failures');
  assert.deepEqual(requests.filter(url=>/^https?:/.test(url)&&!url.startsWith(baseURL+'/')),[],'Unexpected external network dependency');
  console.log('PASS: '+checks+' page/viewport/language combinations; native menu & Escape; reduced motion; blocked storage; configured and unsafe links; no JavaScript; no runtime or HTTP errors; no external requests.');
  console.log('Screenshots: /tmp/gerami-desktop.png /tmp/gerami-mobile.png');
} finally {
  socket?.close(); proc.kill('SIGTERM');
}
