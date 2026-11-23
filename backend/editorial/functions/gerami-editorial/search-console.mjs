// Query text is processed in memory. Only counts keyed by the public IntMed topic are cached.
import {allTopics} from './catalog.mjs';

const normalize=value=>String(value||'').toLowerCase().normalize('NFKC').replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const extra={'pulm-asthma':['آسم','asthma'],'gi-dysphagia':['اختلال بلع','مشکل بلع','dysphagia'],'nephro-azotemia':['ازوتمی','آزوتمی','azotemia']};
const phrases=allTopics().map(({source_id,child})=>({
 id:source_id,words:[child.fa,child.en,child.id.replace(/-/g,' '),...(extra[source_id]||[])].map(normalize).filter(x=>x.length>=3)
}));

export function summarizeSearch(rows){
 const totals=new Map();
 for(const row of rows){
  if(!Array.isArray(row.keys)||row.keys.length!==1||!Number.isSafeInteger(row.clicks)||!Number.isSafeInteger(row.impressions)||row.clicks<0||row.impressions<row.clicks)continue;
  const query=' '+normalize(row.keys[0])+' ';
  const matches=phrases.filter(topic=>topic.words.some(word=>query.includes(' '+word+' ')));
  if(matches.length!==1)continue;
  const id=matches[0].id, total=totals.get(id)||{id,clicks:0,impressions:0};
  total.clicks+=row.clicks;total.impressions+=row.impressions;totals.set(id,total);
 }
 return [...totals.values()].filter(row=>row.impressions>=5);
}
const base64url=bytes=>btoa(String.fromCharCode(...bytes)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const segment=value=>base64url(new TextEncoder().encode(JSON.stringify(value)));
export async function searchConsoleSignals(credentials,day,request=fetch){
 const {client_email,private_key}=JSON.parse(credentials);
 const key=Uint8Array.from(atob(private_key.replace(/-----[^-]+-----|\s/g,'')),c=>c.charCodeAt(0));
 const signingKey=await crypto.subtle.importKey('pkcs8',key,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 const tokenUrl='https://oauth2.googleapis.com/token',iat=Math.floor(Date.now()/1000);
 const claims={iss:client_email,scope:'https://www.googleapis.com/auth/webmasters.readonly',aud:tokenUrl,iat,exp:iat+600};
 const unsigned=segment({alg:'RS256',typ:'JWT'})+'.'+segment(claims);
 const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',signingKey,new TextEncoder().encode(unsigned));
 const options={method:'POST',redirect:'error',signal:AbortSignal.timeout(8000)};
 const session=await request(tokenUrl,{...options,body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:unsigned+'.'+base64url(new Uint8Array(signature))})});
 if(!session.ok)throw Error('search_auth_unavailable');
 const {access_token}=await session.json();if(!access_token)throw Error('search_auth_unavailable');
 const dateBefore=n=>new Date(Date.parse(day+'T00:00:00Z')-n*86400000).toISOString().slice(0,10);
 const startDate=dateBefore(30),endDate=dateBefore(3);
 for(const property of ['sc-domain:drgerami-md.ir','https://drgerami-md.ir/']){
  const res=await request('https://www.googleapis.com/webmasters/v3/sites/'+encodeURIComponent(property)+'/searchAnalytics/query',{
   ...options,signal:AbortSignal.timeout(8000),headers:{Authorization:'Bearer '+access_token,'Content-Type':'application/json'},
   body:JSON.stringify({startDate,endDate,dimensions:['query'],type:'web',dataState:'final',rowLimit:1000})
  });
  if(res.status===403||res.status===404)continue;
  if(!res.ok)throw Error('search_data_unavailable');
  const result=await res.json();
  return summarizeSearch(result.rows||[]).map(row=>({...row,startDate,endDate}));
 }
 throw Error('search_property_unavailable');
}
