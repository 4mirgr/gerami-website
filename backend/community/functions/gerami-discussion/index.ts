const base = Deno.env.get('SUPABASE_URL')!;
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
const site = 'https://drgerami-md.ir';
const uuid = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
const fail = (status:number, message:string) => new Response(JSON.stringify({error:message}), {status});
const json = (value:unknown) => Response.json(value, {headers:{'Cache-Control':'private, no-store'}});
async function rpc(name:string, body:object, identity?:string) {
 const res = await fetch(base+'/rest/v1/rpc/'+name, {method:'POST',headers:{apikey:identity?anon:service,
  Authorization:'Bearer '+(identity||service),'Content-Type':'application/json'},body:JSON.stringify(body),
  redirect:'error',signal:AbortSignal.timeout(9000)});
 if(!res.ok){
  const error=await res.json().catch(()=>({}));
  if(error.message==='rate_limited')throw fail(429,'rate_limited');
  if(error.message==='already_reviewed')throw fail(409,'already_reviewed');
  if(identity)throw fail(res.status>=500?503:401,'session_unavailable');
  throw fail(503,'database_unavailable');
 }
 return res.json();
}
let catalog = new Map<string,string>(), expires=0;
async function publishedPath(slug:string){
 if(Date.now()>=expires){
  const r=await fetch(site+'/content/articles.json',{signal:AbortSignal.timeout(6000),redirect:'error'});
  if(!r.ok)throw fail(503,'catalog_unavailable');
  const records=(await r.json()).articles;
  const next=new Map<string,string>();
  for(const row of records){
   if(row.status!=='published')continue;
   const path=row.url||'/articles/'+row.slug+'/';
   if(/^\/articles\/(?:[a-z0-9-]+\/){1,3}$/.test(path))next.set(row.slug,path);
  }
  catalog=next;expires=Date.now()+60000;
 }
 const path=catalog.get(slug);if(!path)throw fail(404,'not_published');return path;
}
async function deliver(){
 const key=Deno.env.get('GERAMI_RESEND_API_KEY'), from=Deno.env.get('GERAMI_COMMENT_FROM');
 if(!key||!from)return;
 for(let i=0;i<5;i++){
  const job=await rpc('gerami_discussion_mail',{p_action:'claim'});
  if(!job)return;
  let error=null;
  try{
   const sent=await fetch('https://api.resend.com/emails',{method:'POST',redirect:'error',signal:AbortSignal.timeout(7000),
    headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':'gerami-comment-'+job.id},
    body:JSON.stringify({from,to:[job.email],subject:'دیدگاه شما در سایت دکتر گرامی منتشر شد',
     text:'دیدگاه شما تأیید شد و اکنون زیر مطلب قابل مشاهده است.\n\n'+site+job.path+'#discussion'})});
   if(!sent.ok)error='provider_'+sent.status;
  }catch{error='delivery_unknown';}
  await rpc('gerami_discussion_mail',{p_action:'finish',p_id:job.id,p_lease:job.lease,p_error:error});
  if(error)return;
 }
}
async function payload(req:Request){
 const reader=req.body?.getReader();if(!reader)throw fail(400,'payload');
 const chunks:Uint8Array[]=[];let length=0;
 while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>12000){await reader.cancel();throw fail(413,'payload');}chunks.push(value);}
 try{return JSON.parse(await new Blob(chunks as BlobPart[]).text());}catch{throw fail(400,'payload');}
}
Deno.serve(async req=>{
 try{
  if(req.method!=='POST')throw fail(405,'method');
  const action=new URL(req.url).pathname.split('/').pop()||'';
  const p=await payload(req);
  if(!p||typeof p!=='object'||Array.isArray(p))throw fail(400,'payload');
  if(action==='booking-click'){
   if(Object.keys(p).some(k=>!['provider','surface','article'].includes(k))||!['paziresh24','snapp','drnext'].includes(p.provider)||!['home','appointments'].includes(p.surface))throw fail(400,'invalid_booking');
   const args={p_provider:p.provider,p_surface:p.surface};
   if(p.article!==undefined&&(p.surface!=='appointments'||typeof p.article!=='string'||p.article.length>200||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.article)))throw fail(400,'invalid_article');
   if(p.article&&await publishedPath(p.article).catch(()=>null))await rpc('gerami_booking_article_click',{...args,p_slug:p.article});
   else await rpc('gerami_booking_click',args);
   return json({ok:true});
  }
  if(action==='mail'){
   if(!uuid.test(p.ticket)||!await rpc('gerami_discussion_consume',{p_token:p.ticket}))throw fail(403,'denied');
   await deliver();return json({ok:true});
  }
  if(!['read','comment','like','unlike','list','review','booking-report'].includes(action))throw fail(404,'action');
  const token=(req.headers.get('Authorization')||'').replace(/^Bearer /,'');
  const viewer=token&&token!==anon?await rpc('gerami_account',{},token).catch(e=>{if(action==='read'&&e instanceof Response&&e.status===401)return null;throw e;}):null;
  if(action!=='read'&&!viewer?.id)throw fail(401,'sign_in_required');
  if(action==='booking-report'){
   if(viewer.role!=='admin')throw fail(403,'admin_required');
   const [rows,articles]=await Promise.all([rpc('gerami_booking_report',{}),rpc('gerami_booking_article_report',{})]);
   return json({rows,articles});
  }
  const data:Record<string,unknown>={};
  const positive=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>0;
  if(p.before!=null){if(!positive(p.before))throw fail(400,'cursor');data.before=p.before;}
  if(action==='list'||action==='review'){
   if(viewer.role!=='admin')throw fail(403,'admin_required');
   if(action==='list'){
    if(!['pending','approved','rejected'].includes(p.status))throw fail(400,'status');data.status=p.status;
   }else{
    if(!positive(p.id)||!['approved','rejected'].includes(p.decision))throw fail(400,'decision');
    data.id=p.id;data.decision=p.decision;
   }
  }else{
   if(typeof p.slug!=='string'||p.slug.length>200||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug))throw fail(400,'slug');
   data.slug=p.slug;
   if(action==='comment'||action==='like'){
    if(typeof p.request!=='string'||!uuid.test(p.request))throw fail(400,'request');
    data.request=p.request;data.path=await publishedPath(p.slug);
    data.name=action==='comment'?String(p.name||'').trim():'خواننده';
    data.body=action==='comment'?String(p.body||'').trim():'';
    if(!String(data.name).length||String(data.name).length>80||String(data.body).length>1600||(action==='comment'&&!data.body))throw fail(400,'text');
   }
  }
  const result=await rpc('gerami_discussion',{p_action:action,p_user:viewer?.id||null,p:data});
  if(action==='read')result.signedIn=Boolean(viewer?.id);
  if(action==='list'||action==='read')result.senderReady=Boolean(Deno.env.get('GERAMI_RESEND_API_KEY')&&Deno.env.get('GERAMI_COMMENT_FROM'));
  return json(result);
 }catch(e){return e instanceof Response?e:fail(503,'discussion_unavailable');}
});
