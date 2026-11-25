import siteArt from './site-artwork.json' with {type:'json'};
import {sha,validImage} from './core.mjs';
import {sourceTopic,imageQueries} from './catalog.mjs';
export async function boundedBytes(response,limit=650000){
 if(!response.ok||Number(response.headers.get('Content-Length')||0)>limit)throw Error('invalid_image');
 const reader=response.body.getReader(),parts=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw Error('invalid_image');parts.push(value);}}finally{await reader.cancel().catch(()=>{});}
 const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}return bytes;
}
export function selectedDraft(d,o){return {...d,image:o.image,media_path:o.media_path,selected_cover_id:o.id,cover_sha256:o.sha256,cover_selected:true,source:{...d.source,cover:{candidate_id:o.id,sha256:o.sha256,label:o.label,provenance:o.provenance}}};}
const plain=s=>String(s||'').replace(/<[^>]*>/g,'').replace(/[\u0000-\u001f]/g,' ').trim();
const branding=/(?:\b(?:logos?|icons?|emblems?|badges?|favicons?|logotypes?|wordmarks?|wallpapers?)\b|لوگو|آیکون|نشان(?:واره| تجاری)|پوستر تبلیغاتی)/iu;
const normalize=s=>plain(s).toLowerCase().replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/[‌_]/g,' ');
const words=s=>normalize(s).match(/[\p{L}\p{N}]+/gu)||[];
// Recognize clinical concepts across Persian copy and English Commons captions.
const concepts=[
 ['inhaler','اسپری','استنشاقی','سالبوتامول','salbutamol','albuterol','bronchodilator'],
 ['spirometry','اسپیرومتری','اسپیرومتر','fev1','spirometer'],
 ['peak flow','اوج جریان','پیک فلو'],['oxygen','اکسیژن','کانول','cannula'],
 ['creatinine','کراتینین','egfr','فیلتراسیون','glomerular filtration'],
 ['swallowing','بلع','videofluoroscopy','ویدئوفلوروسکوپی'],['endoscopy','آندوسکوپی','اندوسکوپی'],
 ['ultrasound','سونوگرافی'],['radiograph','رادیوگرافی','x-ray'],
 ['insulin','انسولین'],['tablet','قرص'],['injection','تزریق'],['electrocardiogram','ecg','نوار قلب'],
 ['rehabilitation','بازتوانی'],['blood pressure','فشار خون','sphygmomanometer']
];
const stop=new Set(words('بیماری بیماریهای بیمار برای درباره های این آن که شده است درمان روش روشهای مدیریت health disease clinical medical patient with from'));
function clinicalScore(label,copy={}){
 const description=normalize(label),terms=new Set(words(description).filter(w=>w.length>2&&!stop.has(w)));
 function match(text){
  const source=normalize(text);
  const overlap=new Set(words(source).filter(w=>terms.has(w))).size;
  const related=concepts.filter(group=>group.some(w=>description.includes(w))&&group.some(w=>source.includes(w))).length;
  return overlap+related*3;
 }
 return 5*match(copy.title)+3*match(copy.summary)+match((copy.paragraphs||[]).join(' '));
}
export function rankedPair(options,copy){
 const usedLabels=new Set(),usedHashes=new Set();
 return options.filter(o=>o.sha256&&!siteArt[o.sha256]&&!branding.test(o.label))
  .map(o=>({o,score:clinicalScore(o.label+' '+(o.provenance?.description||''),copy)}))
  .sort((a,b)=>b.score-a.score).filter(({o})=>{
   const label=normalize(o.label);if(usedLabels.has(label)||usedHashes.has(o.sha256))return false;
   usedLabels.add(label);usedHashes.add(o.sha256);return true;
  }).slice(0,2).map(({o})=>o);
}
export function commonsCandidate(page,query){
 const meta=page.imageinfo?.[0],extra=meta?.extmetadata||{},license=plain(extra.LicenseShortName?.value),licenseUrl=plain(extra.LicenseUrl?.value);
 if(meta?.mime!=='image/jpeg'||!(/^(Public domain|CC0|PDM)$/i.test(license)||/^https:\/\/creativecommons.org\/publicdomain\//.test(licenseUrl)))return null;
 const description=plain(extra.ImageDescription?.value),subject=plain(page.title+' '+(extra.ObjectName?.value||'')+' '+description);
 if(branding.test(subject))return null;
 const evidence=new Set(plain(page.title+' '+(extra.ObjectName?.value||'')+' '+(extra.ImageDescription?.value||'')).toLowerCase().match(/[a-z0-9]+/g)||[]),terms=query.toLowerCase().match(/[a-z0-9]+/g)||[],generic=new Set(['acute','chronic','medical','clinical','disease','syndrome','disorder','general','test','tests','care','image']);if(!terms.some(t=>t.length>=4&&!generic.has(t))||!terms.every(t=>evidence.has(t)))return null;
 let url;try{url=new URL(meta.thumburl||meta.url);}catch{return null;}
 if(url.origin!=='https://upload.wikimedia.org'||!url.pathname.startsWith('/wikipedia/commons/')||url.username||url.password||url.href.length>2000)return null;
 return {url:url.href,label:plain(extra.ObjectName?.value||page.title).slice(0,120),provenance:{kind:'public-domain',provider:'Wikimedia Commons',description:description.slice(0,350),license,license_url:licenseUrl,source:'https://commons.wikimedia.org/?curid='+Number(page.pageid),artist:plain(extra.Artist?.value).slice(0,160)}};
}
export function createEditorialMedia({db,rpc,storage,remote,snapshot}){
 const fresh=async id=>(await db('gerami_editorial_drafts?id=eq.'+id+'&select=*'))[0];
 async function saveLibrary(topic,choices){
  sourceTopic(topic);if(!Array.isArray(choices)||choices.length!==2)throw Error('image_options_pending');
  const saved=[];for(let i=0;i<choices.length;i++){
   const c=choices[i],bytes=c.bytes||Uint8Array.from(atob(c.base64||''),v=>v.charCodeAt(0));if(!validImage(bytes,'image/jpeg'))throw Error('invalid_image');
   const digest=await sha(bytes),media_path='library/'+topic+'/'+digest+'.jpg',image='/assets/uploads/editorial-'+digest+'.jpg';
   const label=plain(c.label).slice(0,140);if(siteArt[digest]||branding.test(label)||label.length<4)throw Error('invalid_image');
   await storage('object/gerami-editorial/'+media_path,{method:'POST',headers:{'Content-Type':'image/jpeg','x-upsert':'false'},body:bytes}).catch(async()=>{const existing=await boundedBytes(await storage('object/gerami-editorial/'+media_path));if(await sha(existing)!==digest)throw Error('invalid_image');});
   const provenance=c.provenance||{kind:'original-illustration',provider:'original editorial artwork',synthetic:true};
   const row={source_topic:topic,ordinal:i+1,label,media_path,image,sha256:digest,provenance,active:true};
   saved.push(row);
  }
  if(saved[0].sha256===saved[1].sha256)throw Error('invalid_options');
  return rpc('library_pair',{p_topic:topic,p_options:saved});
 }
 async function discover(topic,copy={}){
  const query=imageQueries(topic)[0];
  const params=new URLSearchParams({action:'query',format:'json',generator:'search',gsrsearch:query+' filetype:bitmap',gsrnamespace:'6',gsrlimit:'28',prop:'imageinfo',iiprop:'url|mime|extmetadata',iiurlwidth:'1000'});
  const response=await remote('https://commons.wikimedia.org/w/api.php?'+params,{signal:AbortSignal.timeout(10000)}),data=JSON.parse(new TextDecoder().decode(await boundedBytes(response,350000)));
  const prior=await db('gerami_editorial_cover_library?source_topic=eq.'+topic+'&select=sha256,provenance');
  const seen=new Set(prior.map(o=>o.sha256)),sources=new Set(prior.map(o=>o.provenance?.source).filter(Boolean));
  const candidates=Object.values(data.query?.pages||{}).map(page=>commonsCandidate(page,query)).filter(Boolean);
  candidates.sort((a,b)=>clinicalScore(b.label+' '+b.provenance.description,copy)-clinicalScore(a.label+' '+a.provenance.description,copy));
  const chosen=[];for(const c of candidates){
   if(sources.has(c.provenance.source)||chosen.some(o=>normalize(o.label)===normalize(c.label)))continue;
   try{const bytes=await boundedBytes(await remote(c.url,{signal:AbortSignal.timeout(10000)}));if(!validImage(bytes,'image/jpeg'))continue;const digest=await sha(bytes);if(seen.has(digest)||siteArt[digest])continue;seen.add(digest);sources.add(c.provenance.source);chosen.push({...c,bytes,digest});if(chosen.length===2)break;}catch{}
  }
  if(chosen.length!==2)throw Error('image_options_pending');return saveLibrary(topic,chosen);
 }
 async function ensure(d,{force=false}={}){
  if(d.cover_pack&&!force){const rows=await db('gerami_editorial_cover_options?draft_id=eq.'+d.id+'&pack_id=eq.'+d.cover_pack+'&select=*');if(rankedPair(rows,d.content).length===2&&d.topic===sourceTopic(d.source.topic_id).child.id&&d.source.reference==='Harrison 2025')return d;}
  // Older owner uploads predate cover-selection metadata; verify bytes before preserving.
  const oldImage=/^\/assets\/uploads\/editorial-([a-f0-9]{64})\.(jpg|webp)$/.exec(d.image||'');
  if(d.media_path&&!d.selected_cover_id&&!d.source.cover&&oldImage){const bytes=await boundedBytes(await storage('object/gerami-editorial/'+d.media_path)),mime=oldImage[2]==='webp'?'image/webp':'image/jpeg';if(!validImage(bytes,mime)||await sha(bytes)!==oldImage[1])throw Error('invalid_image');d={...d,cover_selected:true,selected_cover_id:null,cover_sha256:oldImage[1],source:{...d.source,cover:{provider:'owner-upload',sha256:oldImage[1],label:'تصویر انتخابی پزشک'}}};}
  const topic=d.source.topic_id;const candidates=async()=>rankedPair(await rpc('unused_candidates',{p_topic:topic}),d.content);
  let library=await candidates();
  if(library.length!==2){await discover(topic,d.content);library=await candidates();}
  if(library.length!==2||library[0].sha256===library[1].sha256)throw Error('image_options_pending');
  const t=sourceTopic(topic),pack=crypto.randomUUID(),options=library.map((o,i)=>({...o,id:crypto.randomUUID(),ordinal:i+1}));
  const keepCustom=d.cover_selected&&!d.selected_cover_id&&d.media_path&&d.source.cover?.provider==='owner-upload'&&d.source.cover.sha256===d.cover_sha256;
  const source={...d.source,reference:'Harrison 2025',taxonomy:{source_id:t.source_id,root:t.root.id,child:t.child.id,path_fa:t.root.fa+' / '+t.child.fa}};if(!keepCustom)delete source.cover;
  const next={...d,topic:t.child.id,category:source.taxonomy.path_fa,source,cover_pack:pack,cover_required:true,cover_selected:!!keepCustom,selected_cover_id:null,cover_sha256:keepCustom?d.cover_sha256:null,media_path:keepCustom?d.media_path:null,image:keepCustom?d.image:options[0].image};next.snapshot_hash=await snapshot(next);
  await rpc('prepare_unique',{p_id:d.id,p_revision:d.revision,p_source:source,p_topic:next.topic,p_category:next.category,p_pack:pack,p_options:options,p_snapshot:next.snapshot_hash});return fresh(d.id);
 }
 async function options(d,{includeBoth=false}={}){let rows=await db('gerami_editorial_cover_options?draft_id=eq.'+d.id+'&pack_id=eq.'+d.cover_pack+'&select=*&order=ordinal.asc');if(rows.length!==2)throw Error('image_options_pending');
  if(d.cover_selected&&!d.selected_cover_id)rows=[{id:null,label:'تصویر انتخابی پزشک',image:d.image,media_path:d.media_path,sha256:d.cover_sha256,provenance:{provider:'owner-upload'}},...(includeBoth?rows:rows.filter(o=>o.sha256!==d.cover_sha256).slice(0,1))];
  return rows;
 }
 async function load(o){const bytes=await boundedBytes(await storage('object/gerami-editorial/'+o.media_path));const mime=o.media_path.endsWith('.webp')?'image/webp':'image/jpeg';if(!validImage(bytes,mime)||await sha(bytes)!==o.sha256)throw Error('invalid_image');return {bytes,mime,hash:o.sha256};}
 async function choose(d,o,owner,cap=null){const next=selectedDraft(d,o);next.snapshot_hash=await snapshot(next);if(cap)return rpc('select_cover',{p_hash:cap.hash,p_message:cap.message,p_owner:owner,p_snapshot:next.snapshot_hash});return rpc('mutate',{p_id:d.id,p_action:'choose',p_revision:d.revision,p_data:{candidate_id:o.id,owner,snapshot_hash:next.snapshot_hash}});}
 return {discover,ensure,options,load,choose,saveLibrary};
}
