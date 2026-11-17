import {clone} from '../js/site-model.mjs';
import {iconLabels,topicIds} from '../js/topics.mjs';
const path='content/topics.json';
let expandedTopic='';
export function topicEditor({store,group,node,field,button,edit,render,notice}){
 const data=clone(store.documents[path]);const section=group('شاخه‌ها و زیرشاخه‌های آموزش','هر موضوع، مسیر مستقل مرور پست‌هاست. شناسه‌ها در لینک‌ها استفاده می‌شوند؛ برای موضوعات دارای مقاله ثابت می‌مانند.');
 const newTopic=()=>{const topic={id:'topic-'+crypto.randomUUID().slice(0,8),fa:'موضوع جدید',en:'New topic',description_fa:'',description_en:'',icon:'medicine',children:[]};expandedTopic=topic.id;return topic;};
 const save=()=>edit(path,data);
 const referenced=id=>{const ids=topicIds(data,id);return (store.documents['content/articles.json']?.articles||[]).some(a=>ids.has(a.topic));};
 function draw(items,parent,child=false){
  for(const [index,item] of items.entries()){
   const box=node('details',undefined,child?'topic-editor-child':'topic-editor-node');box.dataset.topicId=item.id;box.open=index===0||item.id===expandedTopic||item.children.some(c=>c.id===expandedTopic);const summary=node('summary',item.fa);box.append(summary);
   const id=field(box,'شناسهٔ موضوع',item.id,value=>{item.id=value;save();},{help:'حروف انگلیسی کوچک، عدد و خط تیره؛ تغییر شناسه، نشانی آرشیو را تغییر می‌دهد.'});id.dir='ltr';id.readOnly=referenced(item.id);
   field(box,'عنوان فارسی',item.fa,value=>{item.fa=value;summary.textContent=value;save();});field(box,'English title',item.en,value=>{item.en=value;save();}).dir='ltr';
   field(box,'شرح فارسی',item.description_fa,value=>{item.description_fa=value;save();},{large:true});field(box,'English description',item.description_en,value=>{item.description_en=value;save();},{large:true}).dir='ltr';
   field(box,'آیکون',item.icon,value=>{item.icon=value;save();},{options:iconLabels});
   const controls=node('div',undefined,'inline-tools');
   for(const [caption,step] of [['بالاتر',-1],['پایین‌تر',1]]){const move=button(caption,()=>{const to=index+step;[items[index],items[to]]=[items[to],items[index]];save();render();});move.disabled=index+step<0||index+step>=items.length;controls.append(move);}
   controls.append(button(child?'حذف زیرموضوع':'حذف موضوع',()=>{if(referenced(item.id)){notice('ابتدا موضوع مقاله‌های مرتبط را تغییر دهید؛ هیچ مقاله‌ای نباید موضوع خود را از دست بدهد.',true);return;}items.splice(index,1);save();render();},'tool-button danger'));box.append(controls);
   if(!child){const children=node('div',undefined,'topic-editor-children');draw(item.children,children,true);box.append(children,button('افزودن زیرموضوع',()=>{item.children.push(newTopic());save();render();}));}
   parent.append(box);
  }
 }
 draw(data.topics,section);section.append(button('افزودن موضوع اصلی',()=>{data.topics.push(newTopic());save();render();}));
}
