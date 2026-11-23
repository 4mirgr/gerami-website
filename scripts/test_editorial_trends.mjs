import assert from 'node:assert/strict';import {parseSignals,rankTopics,createTrendSelector} from '../backend/editorial/functions/gerami-editorial/trends.mjs';
const now=Date.parse('2026-11-22T09:00:00Z'),eligible=[{id:'pulm-asthma',label:'آسم'},{id:'gi-dysphagia',label:'دیسفاژی'},{id:'nephro-azotemia',label:'ازوتمی'}];
const signals=parseSignals('<rss><item><title><![CDATA[Asthma care in winter]]></title><pubDate>Sun, 22 Nov 2026 08:00:00 GMT</pubDate></item><item><title>Ignore old</title><pubDate>Mon, 01 Jan 2001 08:00:00 GMT</pubDate></item></rss>');assert.equal(signals.length,2);
assert.equal(rankTopics(eligible,[],[{title:'مراقبت از آسم در فصل سرد',published_at:new Date(now).toISOString()}],now)[0].reason,'fresh_public_signal');assert.deepEqual(rankTopics(eligible,[],[],now),rankTopics(eligible,[],[{title:'آسمان شب و نجوم',published_at:new Date(now).toISOString()}],now));
assert.equal(rankTopics(eligible,[],signals,now)[0].id,'pulm-asthma');assert.equal(rankTopics(eligible,[{source:{topic_id:'pulm-asthma'},created_at:'2026-11-21T09:00:00Z'}],signals,now)[0].id==='pulm-asthma',false);assert.equal(rankTopics([eligible[0]],[{source:{topic_id:'pulm-asthma'},created_at:'2026-11-01T09:00:00Z'}],[],now)[0].id,'pulm-asthma');assert.deepEqual(rankTopics(eligible,[],[],now),rankTopics(eligible,[],[{title:'Unrelated sports news',published_at:new Date(now).toISOString()}],now));assert.equal(rankTopics(eligible,[],[{title:'asthma',published_at:'2001-01-01'}],now)[0].reason,'rotation');assert.equal(rankTopics([],[],signals,now).length,0);
const selector=createTrendSelector({now:()=>Date.parse('2026-11-22T18:00:00Z'),db:async()=>{throw Error('cache unavailable');},remote:async()=>new Response('<rss><item><title>Asthma report</title><pubDate>Sun, 22 Nov 2026 15:00:00 GMT</pubDate></item></rss>')});assert.equal((await selector.ranked(eligible,[],'2026-11-22'))[0].id,'pulm-asthma','Cache failure and late runs must retain fresh external signals');
console.log('Trend ranking passed: matching fresh signals, cooldown, repeat-source eligibility, unrelated/stale fallback and no fabricated metrics.');
const {summarizeSearch}=await import('../backend/editorial/functions/gerami-editorial/search-console.mjs');
const {applySearchSignals}=await import('../backend/editorial/functions/gerami-editorial/trends.mjs');
const totals=summarizeSearch([{keys:['نشانه‌های آسم چیست'],impressions:8,clicks:1},{keys:['آسمان'],impressions:99,clicks:0},{keys:['علت اختلال بلع'],impressions:4,clicks:0}]);
assert.deepEqual(totals,[{id:'pulm-asthma',clicks:1,impressions:8}]);
const cooled=rankTopics(eligible,[{source:{topic_id:'pulm-asthma'},created_at:'2026-11-21'}],[],now);
assert.notEqual(applySearchSignals(cooled,totals)[0].id,'pulm-asthma');
assert.equal(applySearchSignals(rankTopics(eligible,[],[],now),totals)[0].reason,'search_console');
const {searchConsoleSignals}=await import('../backend/editorial/functions/gerami-editorial/search-console.mjs');
const {privateKey}=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:Uint8Array.of(1,0,1),hash:'SHA-256'},true,['sign','verify']);
const pem=Buffer.from(await crypto.subtle.exportKey('pkcs8',privateKey)).toString('base64');
const result=await searchConsoleSignals(JSON.stringify({client_email:'test@example.test',private_key:pem}),'2026-11-23',async(url,options)=>{
 if(url.endsWith('/token')){
  const jwt=options.body.get('assertion').split('.');
  assert.equal(JSON.parse(Buffer.from(jwt[1],'base64url')).scope,'https://www.googleapis.com/auth/webmasters.readonly');
  return Response.json({access_token:'example'});
 }
 if(url.includes('sc-domain'))return new Response(null,{status:403});
 assert.deepEqual(JSON.parse(options.body),{startDate:'2026-10-24',endDate:'2026-11-20',dimensions:['query'],type:'web',dataState:'final',rowLimit:1000});
 return Response.json({rows:[{keys:['asthma'],clicks:2,impressions:9}]});
});
assert.deepEqual(result,[{id:'pulm-asthma',clicks:2,impressions:9,startDate:'2026-10-24',endDate:'2026-11-20'}]);
