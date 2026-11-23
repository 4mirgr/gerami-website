import {searchConsoleSignals} from './search-console.mjs';
import {boundedBytes} from './media.mjs';
const feeds=[{id:'google-trends-ir',region:'IR',url:'https://trends.google.com/trending/rss?geo=IR'},{id:'google-trends-us',region:'US',url:'https://trends.google.com/trending/rss?geo=US'},{id:'who-health-news',region:'global',max_bytes:900000,url:'https://www.who.int/rss-feeds/news-english.xml'}];
const text=value=>String(value||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim().slice(0,240);
export function parseSignals(xml){const signals=[];for(const block of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)){const title=text(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(block[1])?.[1]),date=Date.parse(text(/<pubDate\b[^>]*>([\s\S]*?)<\/pubDate>/i.exec(block[1])?.[1]));if(title&&Number.isFinite(date))signals.push({title,published_at:new Date(date).toISOString()});if(signals.length>=40)break;}return signals;}
export function rankTopics(eligible,recent,signals,now=Date.now()){
 if(!eligible.length)return [];
 const fresh=signals.filter(s=>{const age=now-Date.parse(s.published_at);return age>=-3600000&&age<=72*3600000;});
 const offset=Math.floor(now/86400000)%eligible.length,ordered=[...eligible.slice(offset),...eligible.slice(0,offset)];
 return ordered.map((topic,index)=>{const aliases={'pulm-asthma':['آسم'],'gi-dysphagia':['اختلال بلع','مشکل بلع'],'nephro-azotemia':['ازوتمی']};const tokens=[topic.label,...topic.id.split('-').slice(1),...(aliases[topic.id]||[])].map(t=>t.toLowerCase()).filter(t=>/[\u0600-\u06ff]/.test(t)?t.length>=3:t.length>=4);const matches=fresh.filter(s=>{const words=new Set(s.title.toLowerCase().match(/[\p{L}\p{N}]+/gu)||[]);return tokens.some(t=>{const parts=t.match(/[\p{L}\p{N}]+/gu)||[];return parts.length&&parts.every(word=>words.has(word));});});const ages=recent.filter(r=>r.source?.topic_id===topic.id).map(r=>(now-Date.parse(r.created_at))/86400000).filter(Number.isFinite),last=ages.length?Math.min(...ages):Infinity;const points=Math.min(20,matches.length*5);return {...topic,score:points-(last<7?1000:0),order:index,reason:points?'fresh_public_signal':'rotation',signal_count:matches.length,cooldown:last<7};}).sort((a,b)=>b.score-a.score||a.order-b.order);
}
export function applySearchSignals(ranked,signals){
 const scores=new Map(signals.map(row=>[row.id,row]));
 return ranked.map(topic=>{
  const found=scores.get(topic.id);
  if(!found)return topic;
  const points=Math.min(12,Math.floor(Math.log2(1+found.impressions))+Math.min(4,found.clicks));
  return {...topic,score:topic.score+points,reason:topic.signal_count?'search_and_trend':'search_console',search:{clicks:found.clicks,impressions:found.impressions,start:found.startDate,end:found.endDate}};
 }).sort((a,b)=>b.score-a.score||a.order-b.order);
}
export function createTrendSelector({db,remote,now=Date.now,searchCredentials}){
 async function search(day){
  if(!searchCredentials)return [];
  const source='google-search-console';
  try{
   const [cached]=await db('gerami_editorial_trend_snapshots?day=eq.'+day+'&source=eq.'+source+'&select=signals,error_code,observed_at');
   if(cached&&(!cached.error_code||now()-Date.parse(cached.observed_at)<3600000))return cached.signals||[];
  }catch{}
  let signals=[],error=null;
  try{signals=await searchConsoleSignals(searchCredentials,day);}catch{error='search_console_unavailable';}
  try{await db('gerami_editorial_trend_snapshots?on_conflict=day,source',{day,source,region:'site',observed_at:new Date(now()).toISOString(),signals,error_code:error},'POST');}catch{}
  return signals;
 }
 async function ranked(eligible,recent,day){
  const records=await Promise.all(feeds.map(async feed=>{
   let record;try{record=(await db('gerami_editorial_trend_snapshots?day=eq.'+day+'&source=eq.'+feed.id+'&select=*'))[0];}catch{}
   if(!record){let signals=[],error=null;try{const r=await remote(feed.url,{signal:AbortSignal.timeout(8000)});signals=parseSignals(new TextDecoder().decode(await boundedBytes(r,feed.max_bytes||180000)));if(!signals.length)error='no_recent_items';}catch{error='feed_unavailable';}
    record={day,source:feed.id,region:feed.region,observed_at:new Date(now()).toISOString(),signals,error_code:error};try{await db('gerami_editorial_trend_snapshots?on_conflict=day,source',record,'POST');}catch{}
   }return (record.signals||[]).map(s=>({...s,source:feed.id,region:feed.region}));
  }));
  return applySearchSignals(rankTopics(eligible,recent,records.flat(),now()),await search(day));
 }
 return {ranked};
}
