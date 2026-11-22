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
export function createTrendSelector({db,remote,now=Date.now}){
 async function ranked(eligible,recent,day){
  const records=await Promise.all(feeds.map(async feed=>{
   let record;try{record=(await db('gerami_editorial_trend_snapshots?day=eq.'+day+'&source=eq.'+feed.id+'&select=*'))[0];}catch{}
   if(!record){let signals=[],error=null;try{const r=await remote(feed.url,{signal:AbortSignal.timeout(8000)});signals=parseSignals(new TextDecoder().decode(await boundedBytes(r,feed.max_bytes||180000)));if(!signals.length)error='no_recent_items';}catch{error='feed_unavailable';}
    record={day,source:feed.id,region:feed.region,observed_at:new Date(now()).toISOString(),signals,error_code:error};try{await db('gerami_editorial_trend_snapshots?on_conflict=day,source',record,'POST');}catch{}
   }return (record.signals||[]).map(s=>({...s,source:feed.id,region:feed.region}));
  }));
  return rankTopics(eligible,recent,records.flat(),now());
 }
 return {ranked};
}
