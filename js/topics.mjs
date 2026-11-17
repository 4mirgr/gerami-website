/* Stable topic identifiers; no HTML or executable icon data comes from the catalog. */
export const topicIcons={
 heart:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
 endocrine:'M8 3c-3 2-5 7-4 11s5 4 8 1c3 3 7 3 8-1s-1-9-4-11l-4 4Z M12 7v8',
 digestive:'M10 3v6c-6-2-8 5-5 9s12 5 15-1-2-12-7-8V3',
 lungs:'M12 3v10M12 8 8 6C5 8 2 15 4 19s6 1 8-3c2 4 6 7 8 3s-1-11-4-13l-4 2',
 kidney:'M8 3C1 5 1 16 6 20c5 4 8-5 4-7s1-6-2-10ZM16 3c7 2 7 13 2 17-5 4-8-5-4-7s-1-6 2-10Z',
 joint:'M5 3a3 3 0 0 0 0 6l3 3-3 3a3 3 0 1 0 4 4l3-3 3 3a3 3 0 1 0 4-4l-3-3 3-3a3 3 0 1 0-4-4l-3 3-3-3a3 3 0 0 0-4-2Z',
 blood:'M12 2S4 10 4 15a8 8 0 0 0 16 0C20 10 12 2 12 2ZM8 15a4 4 0 0 0 4 4',
 cell:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM7 7l1 1m8 8 1 1M7 17l1-1m8-8 1-1',
 microbe:'M17 8a7 7 0 1 1-10 0 7 7 0 0 1 10 0ZM12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2M9 12h.01M14 10h.01M13 15h.01',
 shield:'M12 3 3 7v5c0 5 5 8 9 10 4-2 9-5 9-10V7l-9-4ZM8 12l3 3 5-6',
 age:'M12 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6ZM7 22l2-7V9h6v6l2 7M9 12l-5 3m11-3 5 3M12 15v7',
 medicine:'M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z'
};
export const iconLabels={heart:'قلب',endocrine:'غدد',digestive:'گوارش',lungs:'ریه',kidney:'کلیه',joint:'مفاصل',blood:'خون',cell:'سلول',microbe:'عفونی',shield:'ایمنی',age:'سالمندی',medicine:'پزشکی'};
// Original illustrations supplied by the owner; labels remain in the topic text.
export const topicArt={heart:'heart',endocrine:'pancreas',digestive:'digestive',lungs:'lungs',kidney:'kidneys',joint:'joint',blood:'blood-cells',cell:'blood-cells',microbe:'infection',age:'stethoscope',medicine:'education'};
export const topicImageSources={};
export function validateTopics(data){
 if(!Array.isArray(data?.topics))throw Error('فهرست موضوعات معتبر نیست.');
 const seen=new Set();let count=0;
 function walk(nodes,depth){if(!Array.isArray(nodes)||depth>2)throw Error('موضوعات حداکثر دو سطح دارند.');for(const t of nodes){
  if(++count>100||!t||typeof t.id!=='string'||t.id.length>80||! /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(t.id)||seen.has(t.id))throw Error('شناسهٔ موضوع نامعتبر یا تکراری است.');seen.add(t.id);
  for(const key of ['fa','en'])if(typeof t[key]!=='string'||!t[key].trim()||t[key].length>100)throw Error('عنوان فارسی و انگلیسی موضوع لازم است.');
  for(const key of ['description_fa','description_en'])if(typeof t[key]!=='string'||t[key].length>300)throw Error('شرح موضوع معتبر نیست.');
  if(!Object.hasOwn(topicIcons,t.icon))throw Error('آیکون موضوع معتبر نیست.');
  if(!Array.isArray(t.children))throw Error('زیرموضوعات معتبر نیستند.');
  if(t.children.length)walk(t.children,depth+1);
 }}walk(data.topics,1);return data;
}
export function flattenTopics(data){
 const flat=[];for(const root of data?.topics||[]){flat.push({...root,rootId:root.id,path_fa:root.fa,path_en:root.en});for(const child of root.children||[])flat.push({...child,parentId:root.id,rootId:root.id,path_fa:root.fa+' / '+child.fa,path_en:root.en+' / '+child.en});}return flat;
}
export function topicIds(data,id){const flat=flattenTopics(data),node=flat.find(t=>t.id===id);return new Set(node?flat.filter(t=>t.id===id||t.parentId===id).map(t=>t.id):[]);}
export function topicIcon(name){if(topicArt[name]){const image=document.createElement('img');image.className='topic-art';image.src=topicImageSources[topicArt[name]]||'/assets/topics/'+topicArt[name]+'.webp';image.alt='';image.setAttribute('aria-hidden','true');image.width=128;image.height=128;image.loading='lazy';image.decoding='async';return image;}const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.35');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',topicIcons[name]||topicIcons.medicine);svg.append(path);return svg;}
