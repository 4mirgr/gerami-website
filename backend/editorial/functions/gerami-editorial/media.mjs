import {sha,validImage} from './core.mjs';
import {sourceTopic,imageQueries} from './catalog.mjs';
export async function boundedBytes(response,limit=650000){
 if(!response.ok||Number(response.headers.get('Content-Length')||0)>limit)throw Error('invalid_image');
 const reader=response.body.getReader(),parts=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw Error('invalid_image');parts.push(value);}}finally{await reader.cancel().catch(()=>{});}
 const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}return bytes;
}
export function selectedDraft(d,o){return {...d,image:o.image,media_path:o.media_path,selected_cover_id:o.id,cover_sha256:o.sha256,cover_selected:true,source:{...d.source,cover:{candidate_id:o.id,sha256:o.sha256,label:o.label,provenance:o.provenance}}};}
const plain=s=>String(s||'').replace(/<[^>]*>/g,'').replace(/[\u0000-\u001f]/g,' ').trim();
export function commonsCandidate(page,query){
 const meta=page.imageinfo?.[0],extra=meta?.extmetadata||{},license=plain(extra.LicenseShortName?.value),licenseUrl=plain(extra.LicenseUrl?.value);
 if(meta?.mime!=='image/jpeg'||!(/^(Public domain|CC0|PDM)$/i.test(license)||/^https:\/\/creativecommons.org\/publicdomain\//.test(licenseUrl)))return null;
 const evidence=new Set(plain(page.title+' '+(extra.ObjectName?.value||'')+' '+(extra.ImageDescription?.value||'')).toLowerCase().match(/[a-z0-9]+/g)||[]),terms=query.toLowerCase().match(/[a-z0-9]+/g)||[],generic=new Set(['acute','chronic','medical','clinical','disease','syndrome','disorder','general','test','tests','care','image']);if(!terms.some(t=>t.length>=4&&!generic.has(t))||!terms.every(t=>evidence.has(t)))return null;
 let url;try{url=new URL(meta.thumburl||meta.url);}catch{return null;}
 if(url.origin!=='https://upload.wikimedia.org'||!url.pathname.startsWith('/wikipedia/commons/')||url.username||url.password||url.href.length>2000)return null;
 return {url:url.href,label:plain(extra.ObjectName?.value||page.title).slice(0,120),provenance:{kind:'public-domain',provider:'Wikimedia Commons',license,license_url:licenseUrl,source:'https://commons.wikimedia.org/?curid='+Number(page.pageid),artist:plain(extra.Artist?.value).slice(0,160)}};
}
export function createEditorialMedia({db,rpc,storage,remote,snapshot}){
 const fresh=async id=>(await db('gerami_editorial_drafts?id=eq.'+id+'&select=*'))[0];
 async function saveLibrary(topic,choices){
  sourceTopic(topic);if(!Array.isArray(choices)||choices.length!==2)throw Error('image_options_pending');
  const saved=[];for(let i=0;i<choices.length;i++){
   const c=choices[i],bytes=c.bytes||Uint8Array.from(atob(c.base64||''),v=>v.charCodeAt(0));if(!validImage(bytes,'image/jpeg'))throw Error('invalid_image');
   const digest=await sha(bytes),media_path='library/'+topic+'/'+digest+'.jpg',image='/assets/uploads/editorial-'+digest+'.jpg';
   const label=plain(c.label).slice(0,140);if(label.length<4)throw Error('invalid_image');
   await storage('object/gerami-editorial/'+media_path,{method:'POST',headers:{'Content-Type':'image/jpeg','x-upsert':'false'},body:bytes}).catch(async()=>{const existing=await boundedBytes(await storage('object/gerami-editorial/'+media_path));if(await sha(existing)!==digest)throw Error('invalid_image');});
   const provenance=c.provenance||{kind:'original-illustration',provider:'original editorial artwork',synthetic:true};
   const row={source_topic:topic,ordinal:i+1,label,media_path,image,sha256:digest,provenance,active:true};
   saved.push(row);
  }
  if(saved[0].sha256===saved[1].sha256)throw Error('invalid_options');
  return rpc('library_pair',{p_topic:topic,p_options:saved});
 }
 async function discover(topic){
  const query=imageQueries(topic)[0];
  const params=new URLSearchParams({action:'query',format:'json',generator:'search',gsrsearch:query+' filetype:bitmap',gsrnamespace:'6',gsrlimit:'12',prop:'imageinfo',iiprop:'url|mime|extmetadata',iiurlwidth:'1000'});
  const response=await remote('https://commons.wikimedia.org/w/api.php?'+params,{signal:AbortSignal.timeout(10000)}),data=JSON.parse(new TextDecoder().decode(await boundedBytes(response,350000)));
  const chosen=[];for(const p of Object.values(data.query?.pages||{})){
   const c=commonsCandidate(p,query);if(!c)continue;
   try{const bytes=await boundedBytes(await remote(c.url,{signal:AbortSignal.timeout(10000)}));if(!validImage(bytes,'image/jpeg'))continue;const digest=await sha(bytes);if(chosen.some(x=>x.digest===digest))continue;chosen.push({...c,bytes,digest});if(chosen.length===2)break;}catch{}
  }
  if(chosen.length!==2)throw Error('image_options_pending');return saveLibrary(topic,chosen);
 }
 async function ensure(d,{force=false}={}){
  if(d.cover_pack&&!force){const rows=await db('gerami_editorial_cover_options?draft_id=eq.'+d.id+'&pack_id=eq.'+d.cover_pack+'&select=*');if(rows.length===2&&d.topic===sourceTopic(d.source.topic_id).child.id&&d.source.reference==='Harrison 2025')return d;}
  // Older owner uploads predate cover-selection metadata; verify bytes before preserving.
  const oldImage=/^\/assets\/uploads\/editorial-([a-f0-9]{64})\.(jpg|webp)$/.exec(d.image||'');
  if(d.media_path&&!d.selected_cover_id&&!d.source.cover&&oldImage){const bytes=await boundedBytes(await storage('object/gerami-editorial/'+d.media_path)),mime=oldImage[2]==='webp'?'image/webp':'image/jpeg';if(!validImage(bytes,mime)||await sha(bytes)!==oldImage[1])throw Error('invalid_image');d={...d,cover_selected:true,selected_cover_id:null,cover_sha256:oldImage[1],source:{...d.source,cover:{provider:'owner-upload',sha256:oldImage[1],label:'تصویر انتخابی پزشک'}}};}
  const topic=d.source.topic_id;let library=await db('gerami_editorial_cover_library?source_topic=eq.'+topic+'&active=eq.true&select=*&order=ordinal.asc&limit=2');
  if(library.length!==2){await discover(topic);library=await db('gerami_editorial_cover_library?source_topic=eq.'+topic+'&active=eq.true&select=*&order=ordinal.asc&limit=2');}
  if(library.length!==2||library[0].sha256===library[1].sha256)throw Error('image_options_pending');
  const t=sourceTopic(topic),pack=crypto.randomUUID(),options=library.map((o,i)=>({...o,id:crypto.randomUUID(),ordinal:i+1}));
  const keepCustom=d.cover_selected&&!d.selected_cover_id&&d.media_path&&d.source.cover?.provider==='owner-upload'&&d.source.cover.sha256===d.cover_sha256;
  const source={...d.source,reference:'Harrison 2025',taxonomy:{source_id:t.source_id,root:t.root.id,child:t.child.id,path_fa:t.root.fa+' / '+t.child.fa}};if(!keepCustom)delete source.cover;
  const next={...d,topic:t.child.id,category:source.taxonomy.path_fa,source,cover_pack:pack,cover_required:true,cover_selected:!!keepCustom,selected_cover_id:null,cover_sha256:keepCustom?d.cover_sha256:null,media_path:keepCustom?d.media_path:null,image:keepCustom?d.image:options[0].image};next.snapshot_hash=await snapshot(next);
  await rpc('prepare_covers',{p_id:d.id,p_revision:d.revision,p_source:source,p_topic:next.topic,p_category:next.category,p_pack:pack,p_options:options,p_snapshot:next.snapshot_hash});return fresh(d.id);
 }
 async function options(d){let rows=await db('gerami_editorial_cover_options?draft_id=eq.'+d.id+'&pack_id=eq.'+d.cover_pack+'&select=*&order=ordinal.asc');if(rows.length!==2)throw Error('image_options_pending');
  if(d.cover_selected&&!d.selected_cover_id)rows=[{id:null,label:'تصویر انتخابی پزشک',image:d.image,media_path:d.media_path,sha256:d.cover_sha256,provenance:{provider:'owner-upload'}},rows.find(o=>o.sha256!==d.cover_sha256)];
  return rows;
 }
 async function load(o){const bytes=await boundedBytes(await storage('object/gerami-editorial/'+o.media_path));const mime=o.media_path.endsWith('.webp')?'image/webp':'image/jpeg';if(!validImage(bytes,mime)||await sha(bytes)!==o.sha256)throw Error('invalid_image');return {bytes,mime,hash:o.sha256};}
 async function choose(d,o,owner,cap=null){const next=selectedDraft(d,o);next.snapshot_hash=await snapshot(next);if(cap)return rpc('select_cover',{p_hash:cap.hash,p_message:cap.message,p_owner:owner,p_snapshot:next.snapshot_hash});return rpc('mutate',{p_id:d.id,p_action:'choose',p_revision:d.revision,p_data:{candidate_id:o.id,owner,snapshot_hash:next.snapshot_hash}});}
 return {ensure,options,load,choose,saveLibrary};
}
