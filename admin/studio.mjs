import {GitHubSession,repository} from './github-session.mjs';
import {SiteStore} from './site-store.mjs';
import {pages,fonts,sections,clone,validateDocument,pageSlug} from '../js/site-model.mjs';
const $=id=>document.getElementById(id);
const node=(tag,text,className)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;if(className)element.className=className;return element;};
const button=(label,handler,className='tool-button')=>{const b=node('button',label,className);b.type='button';b.addEventListener('click',handler);return b;};
const session=new GitHubSession();const store=new SiteStore(session);const view=$('studio-fields');const preview=$('site-preview');
let loaded=false,currentPage='home',previewPage='home',selectedBlock='',undo=[],lastSnapshot='',syncing=false;
const routes={pages:'صفحه‌ها و متن‌ها',appearance:'ظاهر و هویت بصری',menus:'منوها و زیرمنوها',media:'کتابخانهٔ رسانه',history:'تاریخچه و بازیابی',articles:'مقالات و پیش‌نویس‌ها',profile:'رزومه و سوابق',contact:'اطلاعات تماس'};
const appearancePath='content/appearance.json';const menuPath='content/navigation.json';const extraPath='content/extra-pages.json';
let previewLanguage='fa',previewTheme='light',previewSize=1280;
function notice(message,error=false){$('studio-notice').textContent=message;$('studio-notice').classList.toggle('error',error);}
function attempt(action){return async()=>{try{await action();}catch(error){notice(error.message||'عملیات موفق نبود.',true);}};}
function edit(path,data){
 const snapshot=JSON.stringify(store.documents);if(snapshot!==lastSnapshot){undo.push(snapshot);undo=undo.slice(-40);lastSnapshot=snapshot;}
 store.edit(path,data);
}
let fieldSequence=0;
function label(title,input,help){const wrapper=node('label',undefined,'field');const heading=node('span',title);heading.id='field-label-'+(++fieldSequence);input.setAttribute('aria-labelledby',heading.id);wrapper.append(heading,input);if(help){const description=node('small',help);description.id='field-help-'+fieldSequence;input.setAttribute('aria-describedby',description.id);wrapper.append(description);}return wrapper;}
function field(parent,title,value,change,{type='text',help='',min,max,step,options,large=false}={}){
 let input;if(options){input=node('select');for(const [key,text] of Object.entries(options)){const option=node('option',text);option.value=key;input.append(option);}}else input=node(large?'textarea':'input');
 if(!options&&!large)input.type=type;
 if(type==='checkbox')input.checked=Boolean(value);else input.value=value??'';
 if(min!==undefined)input.min=min;if(max!==undefined)input.max=max;if(step!==undefined)input.step=step;
 if(type==='url'||type==='color'||type==='number')input.dir='ltr';
 input.addEventListener('input',()=>change(type==='checkbox'?input.checked:type==='number'||type==='range'?Number(input.value):input.value));parent.append(label(title,input,help));return input;
}
function group(title,description){const section=node('section',undefined,'settings-group');section.append(node('h3',title));if(description)section.append(node('p',description,'muted'));view.append(section);return section;}
function status(){
 const connected=session.state==='connected';const busy=['checking','connecting'].includes(session.state);
 $('github-state').textContent=connected?'متصل · '+session.login:session.state==='checking'?'بررسی اتصال…':session.state==='connecting'?'در انتظار ورود…':'قطع اتصال';
 $('github-state').dataset.state=session.state;$('github-connect').textContent=connected?'بررسی مجدد':'اتصال به GitHub';$('github-connect').disabled=busy;
 $('github-disconnect').hidden=!connected;$('connection-title').textContent=connected?'GitHub متصل است':'وضعیت اتصال GitHub';$('connection-message').textContent=session.message;
 $('connection-fallback').hidden=session.state!=='error';
 $('publish').disabled=!connected||!store.remoteReady||store.busy||store.count===0||store.conflicts.size>0;
 $('publish').textContent=store.busy?'در حال انجام…':'انتشار تغییرات'+(store.count?' ('+store.count+')':'' );
 $('draft-state').textContent=!loaded?'در حال دریافت فایل‌ها…':store.storageError?'ذخیرهٔ محلی ممکن نشد؛ این صفحه را نبندید.':store.count?store.count+' تغییر در پیش‌نویس'+(store.media.size?'؛ تصاویر نیز همراه انتشار ذخیره می‌شوند.':' محلی'):'همهٔ تغییرات ثبت شده‌اند';
 $('sync').disabled=!connected||store.busy;
 const conflicts=$('conflict-list');conflicts.replaceChildren();for(const path of store.conflicts){const box=node('div',undefined,'conflict');box.append(node('p','این فایل هم‌زمان تغییر کرده است: '+path),button('استفاده از آخرین نسخه',()=>{store.resolve(path,false);render();}),button('حفظ ویرایش من روی نسخهٔ جدید',()=>{if(confirm('نسخهٔ مخزن را بررسی کرده‌اید؟ ویرایش شما جایگزین محتوای این فایل خواهد شد.')){store.resolve(path,true);render();}}));conflicts.append(box);}
}
function sendPreview(){if(!loaded||!preview.contentWindow)return;preview.contentWindow.postMessage({type:'studio-draft',documents:store.documents,assets:Object.fromEntries(store.assetPreviews),language:previewLanguage,theme:previewTheme},location.origin);}
let previewTimer;store.addEventListener('change',()=>{status();clearTimeout(previewTimer);previewTimer=setTimeout(sendPreview,150);});
async function synchronize(){if(syncing||!loaded||session.state!=='connected')return;syncing=true;try{await store.synchronize();notice('آخرین نسخهٔ مخزن دریافت شد. پیش‌نویس‌های شما حفظ شدند.');render();}catch(error){notice(error.message,true);}finally{syncing=false;}}
session.addEventListener('change',()=>{status();if(session.state==='connected')synchronize();if(['disconnected','expired'].includes(session.state)){$('editor-slot').replaceChildren();window.dispatchEvent(new Event('cms-editor-reset'));}});
$('github-connect').addEventListener('click',()=>session.state==='connected'?session.verify():session.connect());
$('github-disconnect').addEventListener('click',()=>session.disconnect());
$('sync').addEventListener('click',synchronize);
$('publish').addEventListener('click',attempt(async()=>{
 const dirty=store.dirty;for(const path of dirty)validateDocument(path,store.documents[path]);
 const dialog=$('publish-dialog');$('publish-files').replaceChildren(...[...dirty,...store.media.keys()].map(path=>node('li',path)));dialog.showModal();
}));
$('publish-confirm').addEventListener('click',attempt(async()=>{
 $('publish-dialog').close();const publishedMedia=[...store.media.keys()];const result=await store.publish($('publish-note').value);gallery.push(...publishedMedia.map(path=>'/'+path));notice('تغییرات در GitHub ثبت شد. ساخت و انتشار Cloudflare آغاز می‌شود.');const link=node('a','مشاهدهٔ نسخهٔ ثبت‌شده');link.href='https://github.com/'+repository+'/commit/'+result.sha;link.target='_blank';link.rel='noopener';$('studio-notice').append(' ',link);render();
}));
$('undo').addEventListener('click',()=>{const value=undo.pop();if(!value)return;const previous=JSON.parse(value);for(const [path,data] of Object.entries(previous))store.edit(path,data);lastSnapshot='';render();});
 $('discard').addEventListener('click',()=>{if(store.count&&confirm('تمام پیش‌نویس‌های منتشرنشده کنار گذاشته شوند؟')){for(const path of store.dirty)store.discard(path);for(const [path,file] of store.media){URL.revokeObjectURL(file.url);store.assetPreviews.delete('/'+path);}store.media.clear();store.changed();undo=[];render();}});
for(const dialog of document.querySelectorAll('dialog')){dialog.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>dialog.close()));dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});}
function previewURL(){const extra=previewPage.startsWith('extra:');if(extra){const slug=previewPage.slice(6);return '/pages/studio-preview.html?studio-preview=1&slug='+encodeURIComponent(slug);}return (previewPage==='home'?'/index.html':'/pages/'+previewPage+'.html')+'?studio-preview=1';}
function setPreview(page=currentPage){previewPage=page;preview.src=previewURL();}
function fitPreview(){const stage=$('preview-stage');const scale=Math.min(1,stage.clientWidth/previewSize);preview.style.width=previewSize+'px';preview.style.height=Math.round(780/scale)+'px';preview.style.transform=`scale(${scale})`;stage.style.height='780px';}
new ResizeObserver(fitPreview).observe($('preview-stage'));
$('preview-device').addEventListener('change',event=>{previewSize=Number(event.target.value);fitPreview();});
$('preview-language').addEventListener('change',event=>{previewLanguage=event.target.value;sendPreview();});
$('preview-theme').addEventListener('change',event=>{previewTheme=event.target.value;sendPreview();});
$('preview-expand').addEventListener('click',()=>{$('studio-view').classList.toggle('preview-expanded');fitPreview();});
window.addEventListener('message',event=>{
 if(event.origin!==location.origin||event.source!==preview.contentWindow)return;
 if(event.data?.type==='studio-ready')sendPreview();
 if(event.data?.type==='studio-select'&&Object.hasOwn(pages,event.data.page)){currentPage=event.data.page;selectedBlock=event.data.key;location.hash='pages';render();const input=view.querySelector(`[data-block="${selectedBlock}"]`);input?.scrollIntoView({block:'center',behavior:'smooth'});input?.focus();}
});
function pageEditor(){
 const top=group('ویرایش صفحه','متن‌ها را از این فهرست یا با کلیک روی متن در پیش‌نمایش انتخاب کنید. عنوان مرورگر و توضیح جست‌وجو نیز قابل ویرایش‌اند.');
 field(top,'صفحه',currentPage,value=>{currentPage=value;selectedBlock='';render();setPreview();},{options:pages});
 const search=field(top,'جست‌وجوی متن','',value=>{for(const row of view.querySelectorAll('.text-block'))row.hidden=!row.textContent.toLowerCase().includes(value.toLowerCase())&&!([...row.querySelectorAll('textarea')].some(input=>input.value.toLowerCase().includes(value.toLowerCase())));},{type:'search'});search.placeholder='بخشی از متن را بنویسید…';
 const path=`content/pages/${currentPage}.json`;const data=clone(store.documents[path]);
 const blockGroup=group('متن‌های فارسی و انگلیسی');
 for(const [key,block] of Object.entries(data.blocks)){const details=node('details',undefined,'text-block');details.open=key===selectedBlock;const summary=node('summary',block.fa.slice(0,85)||key);details.append(summary);
  const input=field(details,'فارسی',block.fa,value=>{block.fa=value;summary.textContent=value.slice(0,85)||key;edit(path,data);},{large:true});input.dataset.block=key;
  const en=field(details,'English',block.en,value=>{block.en=value;edit(path,data);},{large:true});en.dir='ltr';blockGroup.append(details);
 }
 const links=group('پیوندها و دکمه‌های صفحه','پیوندهای مستقیم IntMed و AUS و اطلاعات تماس از تنظیمات مستقل خود استفاده می‌کنند.');
 for(const [key,url] of Object.entries(data.links))field(links,'پیوند '+key,url,value=>{data.links[key]=value;edit(path,data);},{help:'مسیر داخلی با / شروع شود یا HTTPS معتبر باشد.'});
 extraPages();
}
function articleEditor(){
 const path='content/articles.json';const data=clone(store.documents[path]);
 const section=group('مقالات و پیش‌نویس‌ها','هر مقاله را با دو زبان، مخاطب، دسته‌بندی، منابع و تاریخ بازبینی مدیریت کنید. پیش‌نویس‌ها در سایت عمومی نمایش داده نمی‌شوند.');
 section.append(button('نوشتن مقالهٔ جدید',()=>{data.articles.unshift({slug:'article-'+Date.now().toString(36),status:'draft',audience:'patients',category:'',title_fa:'مقالهٔ جدید',title_en:'',body_fa:'',body_en:'',author:'',published_at:'',reviewed_at:'',image:'',sources:[]});edit(path,data);render();}),button('پیش‌نمایش مقالات',()=>setPreview('blog')));
 for(const [index,item] of data.articles.entries()){
  const box=node('details',undefined,'text-block');box.open=index===0;const summary=node('summary',(item.title_fa||item.slug)+' · '+(item.status==='published'?'منتشرشده':'پیش‌نویس'));box.append(summary);
  for(const [key,title] of [['title_fa','عنوان فارسی'],['title_en','English title'],['slug','شناسهٔ یکتا'],['category','دسته‌بندی'],['author','نویسنده']])field(box,title,item[key],value=>{item[key]=value;edit(path,data);});
  field(box,'مخاطب',item.audience,value=>{item.audience=value;edit(path,data);},{options:{patients:'بیماران و خانواده‌ها',professional:'پزشکان و همکاران'}});
  markdown(box,'متن فارسی',item.body_fa,value=>{item.body_fa=value;edit(path,data);});markdown(box,'English content',item.body_en,value=>{item.body_en=value;edit(path,data);}).dir='ltr';
  for(const [key,title] of [['published_at','تاریخ انتشار'],['reviewed_at','تاریخ بازبینی']])field(box,title,item[key],value=>{item[key]=value;edit(path,data);},{type:'date'});
  field(box,'تصویر مقاله',item.image,value=>{item.image=value;edit(path,data);},{help:'نشانی /assets/uploads/... را از رسانه‌ها کپی کنید.'});
  const sources=node('div',undefined,'sources-editor');sources.append(node('h4','منابع'));box.append(sources);
  for(const [sourceIndex,source] of (item.sources||[]).entries()){const row=node('div',undefined,'source-row');field(row,'عنوان منبع',source.title,value=>{source.title=value;edit(path,data);});field(row,'پیوند منبع',source.url,value=>{source.url=value;edit(path,data);},{type:'url'});row.append(button('حذف منبع',()=>{item.sources.splice(sourceIndex,1);edit(path,data);render();}));sources.append(row);}
  sources.append(button('افزودن منبع',()=>{(item.sources??=[]).push({title:'',url:'https://'});edit(path,data);render();}));
  field(box,'وضعیت نمایش',item.status,value=>{item.status=value;edit(path,data);summary.textContent=(item.title_fa||item.slug)+' · '+(value==='published'?'منتشرشده':'پیش‌نویس');},{options:{draft:'پیش‌نویس',published:'منتشرشده'}});
  box.append(button('حذف مقاله',()=>{if(confirm('این مقاله حذف شود؟')){data.articles.splice(index,1);edit(path,data);render();}},'tool-button danger'));section.append(box);
 }
}
function profileEditor(contactOnly=false){
 const path='content/site.json';const data=clone(store.documents[path]);
 if(!contactOnly){const section=group('معرفی و رزومه','فقط سوابق و اطلاعات تأییدشدهٔ خود را وارد کنید.');field(section,'معرفی فارسی',data.bio_fa,value=>{data.bio_fa=value;edit(path,data);},{large:true});field(section,'English bio',data.bio_en,value=>{data.bio_en=value;edit(path,data);},{large:true}).dir='ltr';section.append(button('پیش‌نمایش رزومه',()=>setPreview('about')));
 for(const [index,item] of data.cv.entries()){const box=node('details',undefined,'text-block');box.open=true;box.append(node('summary',item.title_fa||'سابقهٔ جدید'));for(const [key,title] of [['title_fa','عنوان فارسی'],['title_en','English title'],['detail_fa','شرح فارسی'],['detail_en','English description']])field(box,title,item[key],value=>{item[key]=value;edit(path,data);},{large:key.startsWith('detail')}).dir=key.endsWith('_en')?'ltr':'rtl';box.append(button('حذف سابقه',()=>{data.cv.splice(index,1);edit(path,data);render();}));section.append(box);}
 section.append(button('افزودن سابقه',()=>{data.cv.push({title_fa:'',title_en:'',detail_fa:'',detail_en:''});edit(path,data);render();}));}
 const contact=group('اطلاعات تماس و مراجعه','فیلدهای خالی به بازدیدکننده نمایش داده نمی‌شوند.');for(const [key,title] of [['email','ایمیل عمومی'],['phone','تلفن عمومی'],['linkedin','لینکدین'],['appointment','لینک نوبت‌دهی']])field(contact,title,data[key],value=>{data[key]=value;edit(path,data);}).dir='ltr';contact.append(button('پیش‌نمایش اطلاعات تماس',()=>setPreview('contact')));
}
function markdown(parent,title,value,change){const area=field(parent,title,value,change,{large:true,help:'Markdown: **پررنگ**، *تأکید*، ## تیتر، - فهرست، [عنوان](https://...)'});area.rows=10;const tools=node('div',undefined,'inline-tools');for(const [caption,start,end] of [['پررنگ','**','**'],['تأکید','*','*'],['تیتر','## ',''],['پیوند','[','](https://example.com)']])tools.append(button(caption,()=>{const a=area.selectionStart,b=area.selectionEnd;area.setRangeText(start+area.value.slice(a,b)+end,a,b,'select');area.dispatchEvent(new Event('input'));area.focus();}));area.parentElement.after(tools);return area;}
function extraPages(){
 const data=clone(store.documents[extraPath]);const section=group('صفحه‌های جدید','صفحهٔ مستقل با نشانی اختصاصی بسازید؛ برای نمایش در منو از بخش منوها استفاده کنید. انتشار صفحه نیاز به عنوان و متن هر دو زبان دارد.');
 section.append(button('افزودن صفحه',()=>{data.pages.push({slug:'new-page-'+Date.now().toString(36),published:false,title_fa:'صفحهٔ جدید',title_en:'New page',description_fa:'',description_en:'',body_fa:'',body_en:'',image:''});edit(extraPath,data);render();}));
 for(const [index,item] of data.pages.entries()){
  const box=node('details',undefined,'text-block');box.append(node('summary',item.title_fa||item.slug));
  field(box,'عنوان فارسی',item.title_fa,value=>{item.title_fa=value;edit(extraPath,data);});field(box,'English title',item.title_en,value=>{item.title_en=value;edit(extraPath,data);});
  field(box,'شناسهٔ نشانی',item.slug,value=>{item.slug=value;edit(extraPath,data);},{help:'مثال: health-guide → /pages/health-guide.html'});
  for(const [key,title] of [['description_fa','توضیح جست‌وجو فارسی'],['description_en','English description']])field(box,title,item[key],value=>{item[key]=value;edit(extraPath,data);});
  markdown(box,'متن فارسی',item.body_fa,value=>{item.body_fa=value;edit(extraPath,data);});markdown(box,'English content',item.body_en,value=>{item.body_en=value;edit(extraPath,data);}).dir='ltr';
  field(box,'مسیر تصویر',item.image,value=>{item.image=value;edit(extraPath,data);},{help:'تصویر را در رسانه‌ها ویرایش و نشانی آن را کپی کنید.'});
  field(box,'انتشار عمومی',item.published,value=>{item.published=value;edit(extraPath,data);},{type:'checkbox'});
  box.append(button('پیش‌نمایش این صفحه',()=>{if(pageSlug(item.slug)){setPreview('extra:'+item.slug);}else notice('شناسهٔ صفحه معتبر نیست.',true);}),button('افزودن به منوی اصلی',()=>{if(!pageSlug(item.slug)){notice('شناسهٔ صفحه معتبر نیست.',true);return;}const menus=clone(store.documents[menuPath]);menus.header.push({fa:item.title_fa,en:item.title_en,url:'/pages/'+item.slug+'.html',children:[]});edit(menuPath,menus);notice('به پیش‌نویس منوی اصلی اضافه شد.');}),button('حذف صفحه',()=>{if(confirm('این صفحه حذف شود؟ پیوندهای آن را هم از منو حذف کنید.')){data.pages.splice(index,1);edit(extraPath,data);render();}},'tool-button danger'));section.append(box);
 }
}
function appearanceEditor(){
 const data=clone(store.documents[appearancePath]);const change=()=>edit(appearancePath,data);
 const type=group('فونت و چیدمان','وزیرمتن به‌صورت محلی بارگذاری می‌شود. تنظیمات مدیریت از فونت سایت مستقل است.');
 field(type,'فونت سایت',data.font,value=>{data.font=value;change();},{options:fonts});
 for(const [key,title,min,max,step] of [['fontSize','اندازهٔ متن پایه',14,22,1],['lineHeight','فاصلهٔ خطوط',1.4,2.4,0.05],['headingWeight','ضخامت عنوان‌ها',400,900,100],['radius','گردی گوشه‌ها',0,36,1],['width','عرض محتوا',960,1440,20]])field(type,title,data[key],value=>{data[key]=value;change();},{type:'number',min,max,step});
 for(const [mode,title] of [['light','حالت روشن / روز'],['dark','حالت تیره / شب']]){
  const section=group(title);const colors=node('div',undefined,'color-fields');section.append(colors);
  for(const [key,label] of [['paper','زمینهٔ صفحه'],['white','زمینهٔ کارت'],['ink','متن اصلی'],['muted','متن فرعی'],['wash','زمینهٔ بخش‌ها'],['line','خط و حاشیه'],['teal','رنگ شاخص'],['button','زمینهٔ دکمه'],['buttonText','متن دکمه']])field(colors,label,data[mode][key],value=>{data[mode][key]=value;change();},{type:'color'});
  for(const [key,label] of [['logo','لوگوی سربرگ'],['wallpaper','تصویر کارت اصلی'],['background','تصویر پس‌زمینهٔ سایت (اختیاری)']])field(section,label,data[mode][key],value=>{data[mode][key]=value;change();},{help:'مسیر /assets/... را از کتابخانهٔ رسانه انتخاب کنید. پس‌زمینهٔ خالی یعنی رنگ زمینه.'});
  section.append(button('نمایش این حالت',()=>{previewTheme=mode;$('preview-theme').value=mode;sendPreview();}));
 }
 const section=group('بخش‌های صفحهٔ اصلی','نمایش و ترتیب بخش‌ها؛ معرفی اصلی همیشه ابتدای صفحه می‌ماند.');
 for(const [index,item] of data.sections.entries()){const row=node('div',undefined,'section-row');field(row,sections[item.id],item.visible,value=>{item.visible=value;change();},{type:'checkbox'}).disabled=item.id==='hero';
  if(index>1)row.append(button('بالا',()=>{[data.sections[index-1],data.sections[index]]=[item,data.sections[index-1]];change();render();}));
  if(index>0&&index<data.sections.length-1)row.append(button('پایین',()=>{[data.sections[index+1],data.sections[index]]=[item,data.sections[index+1]];change();render();}));section.append(row);
 }
}
function menuEditor(){
 const data=clone(store.documents[menuPath]);const save=()=>edit(menuPath,data);
 function renderItems(list,host,depth){
  for(const [index,item] of list.entries()){
   const box=node('details',undefined,'menu-item');box.open=true;box.append(node('summary',item.fa||'گزینهٔ جدید'));
   field(box,'عنوان فارسی',item.fa,value=>{item.fa=value;save();});field(box,'English title',item.en,value=>{item.en=value;save();});
   field(box,'آدرس',item.url,value=>{item.url=value;save();},{help:'مسیر داخلی مانند /pages/about.html یا نشانی HTTPS'});
   field(box,'انتخاب صفحه','',value=>{if(value){item.url=value;save();render();}},{options:{'':'انتخاب…',...Object.fromEntries(Object.entries(pages).map(([key,title])=>[key==='home'?'/index.html':`/pages/${key}.html`,title])),...Object.fromEntries(store.documents[extraPath].pages.filter(p=>p.published).map(p=>['/pages/'+p.slug+'.html',p.title_fa]))}});
   const actions=node('div',undefined,'inline-tools');
   if(index>0)actions.append(button('بالا',()=>{[list[index-1],list[index]]=[item,list[index-1]];save();render();}));
   if(index<list.length-1)actions.append(button('پایین',()=>{[list[index+1],list[index]]=[item,list[index+1]];save();render();}));
   if(depth<3)actions.append(button('افزودن زیرمنو',()=>{(item.children??=[]).push({fa:'زیرمنوی جدید',en:'New submenu',url:'/index.html',children:[]});save();render();}));
   actions.append(button('حذف',()=>{list.splice(index,1);save();render();},'tool-button danger'));box.append(actions);if(item.children?.length)renderItems(item.children,box,depth+1);host.append(box);
  }
 }
 for(const [key,title] of [['header','منوی اصلی و موبایل'],['footer','دسترسی سریع پایین صفحه']]){const section=group(title,'تا سه سطح زیرمنو؛ ترتیب با بالا و پایین تغییر می‌کند.');renderItems(data[key],section,1);section.append(button('افزودن گزینه',()=>{data[key].push({fa:'گزینهٔ جدید',en:'New item',url:'/index.html',children:[]});save();render();}));}
}
let gallery=[];
async function mediaEditor(){
 const section=group('کتابخانهٔ رسانه','تصویر را بارگذاری، برش، چرخش و تنظیم نور کنید. نسخهٔ بهینهٔ WebP ساخته می‌شود و فایل اصلی تغییر نمی‌کند. تصاویر نیز با دکمهٔ انتشار ذخیره می‌شوند.');
 const upload=node('input');upload.type='file';upload.accept='image/png,image/jpeg,image/webp,image/avif';upload.addEventListener('change',attempt(async()=>{if(upload.files[0])await openImage(upload.files[0]);}));section.append(label('افزودن و ویرایش تصویر',upload));
 const grid=node('div',undefined,'studio-gallery');section.append(grid);
 const assets=new Map([['/assets/identity/logo-day.webp','لوگوی روز'],['/assets/identity/logo-night.webp','لوگوی شب'],['/assets/identity/wallpaper-day.webp','تصویر روز'],['/assets/identity/wallpaper-night.webp','تصویر شب'],...gallery.map(path=>[path,path.split('/').pop()]),...[...store.media.keys()].map(path=>['/'+path,'پیش‌نویس جدید'])]);
 for(const [path,title] of assets){const card=node('article',undefined,'media-card');const img=node('img');img.src=store.assetPreviews.get(path)||path;img.alt=title;img.loading='lazy';card.append(img,node('p',title));
  card.append(button('ویرایش تصویر',attempt(async()=>{const response=await fetch(img.src);if(!response.ok)throw Error('دریافت تصویر ممکن نشد.');await openImage(await response.blob());})),button('کپی نشانی',attempt(async()=>{await navigator.clipboard.writeText(path);notice('نشانی تصویر کپی شد: '+path);})),node('code',path));
  const use=node('select');for(const [value,text] of Object.entries({'':'استفاده برای…','light.logo':'لوگوی روز','dark.logo':'لوگوی شب','light.wallpaper':'کارت روز','dark.wallpaper':'کارت شب','light.background':'پس‌زمینهٔ روز','dark.background':'پس‌زمینهٔ شب'})){const opt=node('option',text);opt.value=value;use.append(opt);}use.addEventListener('change',()=>{if(!use.value)return;const [mode,key]=use.value.split('.');const data=clone(store.documents[appearancePath]);data[mode][key]=path;edit(appearancePath,data);notice('تصویر به پیش‌نویس ظاهر اضافه شد.');use.value='';});card.append(use);
  if(store.media.has(path.slice(1)))card.append(button('حذف پیش‌نویس تصویر',()=>{if(JSON.stringify(store.documents).includes(path)){notice('این تصویر در پیش‌نویس استفاده شده است؛ ابتدا آن را جایگزین کنید.',true);return;}URL.revokeObjectURL(store.media.get(path.slice(1)).url);store.media.delete(path.slice(1));store.assetPreviews.delete(path);store.changed();render();},'tool-button danger'));
  grid.append(card);
 }
 if(session.state==='connected')section.append(button('دریافت همهٔ تصاویر مخزن',attempt(async()=>{const files=await session.api('/repos/'+repository+'/contents/assets/uploads?ref=main').catch(error=>{if(error.status===404)return [];throw error;});gallery=files.filter(file=>file.type==='file'&&/\.(webp|png|jpe?g|avif)$/i.test(file.name)).map(file=>'/'+file.path);render();})));
}
let imageBitmap,rotation=0;
$('image-dialog').addEventListener('close',()=>{imageBitmap?.close();imageBitmap=null;});
async function openImage(blob){
 if(blob.size>20*1024*1024)throw Error('حجم تصویر باید کمتر از ۲۰ مگابایت باشد.');
 if(!['image/jpeg','image/png','image/webp','image/avif'].includes(blob.type))throw Error('تصویر PNG، JPEG، WebP یا AVIF انتخاب کنید.');
 imageBitmap?.close();imageBitmap=await createImageBitmap(blob);if(imageBitmap.width*imageBitmap.height>64000000){imageBitmap.close();throw Error('ابعاد تصویر بسیار بزرگ است.');}
 rotation=0;$('image-ratio').value='original';$('image-brightness').value='100';$('image-contrast').value='100';$('image-x').value='50';$('image-y').value='50';drawImage();$('image-dialog').showModal();
}
function drawImage(){
 if(!imageBitmap)return;const rotated=rotation%180!==0;const w=rotated?imageBitmap.height:imageBitmap.width,h=rotated?imageBitmap.width:imageBitmap.height;
 const temp=document.createElement('canvas');temp.width=w;temp.height=h;const ctx=temp.getContext('2d');ctx.translate(w/2,h/2);ctx.rotate(rotation*Math.PI/180);ctx.drawImage(imageBitmap,-imageBitmap.width/2,-imageBitmap.height/2);
 const ratio=$('image-ratio').value==='original'?w/h:Number($('image-ratio').value);let cw=w,ch=w/ratio;if(ch>h){ch=h;cw=h*ratio;}
 const scale=Math.min(1,1600/Math.max(cw,ch));const canvas=$('image-canvas');canvas.width=Math.max(1,Math.round(cw*scale));canvas.height=Math.max(1,Math.round(ch*scale));const output=canvas.getContext('2d');output.filter=`brightness(${$('image-brightness').value}%) contrast(${$('image-contrast').value}%)`;output.drawImage(temp,(w-cw)*Number($('image-x').value)/100,(h-ch)*Number($('image-y').value)/100,cw,ch,0,0,canvas.width,canvas.height);$('image-dimensions').textContent=canvas.width+' × '+canvas.height+' px';
}
for(const id of ['image-ratio','image-brightness','image-contrast','image-x','image-y'])$(id).addEventListener('input',drawImage);
$('image-rotate').addEventListener('click',()=>{rotation=(rotation+90)%360;drawImage();});
$('image-save').addEventListener('click',attempt(async()=>{const blob=await new Promise(resolve=>$('image-canvas').toBlob(resolve,'image/webp',0.88));if(!blob)throw Error('ساخت تصویر ممکن نشد.');const path=await store.stageImage(blob);$('image-dialog').close();notice('تصویر به پیش‌نویس اضافه شد: '+path);render();}));
async function historyEditor(){const section=group('تاریخچه و بازیابی','بازیابی، نسخهٔ انتخابی را به پیش‌نویس تبدیل می‌کند. پیش از انتشار آن را در پیش‌نمایش بررسی کنید. تاریخچه شامل متن‌ها، ظاهر، منوها، مقاله‌ها و رزومه است.');
 if(session.state!=='connected'){section.append(node('p','پس از اتصال GitHub، تاریخچهٔ فایل‌های سایت در دسترس است.'));return;}
 section.append(button('دریافت تاریخچه',attempt(async()=>{const rows=node('div');section.append(rows);for(const commit of await store.history()){const row=node('div',undefined,'history-row');row.append(node('strong',commit.commit.message.split('\n')[0]),node('small',new Date(commit.commit.author.date).toLocaleString('fa-IR')));const link=node('a','مشاهده در GitHub');link.href='https://github.com/'+repository+'/commit/'+commit.sha;link.target='_blank';link.rel='noopener';row.append(link,button('بازیابی در پیش‌نویس',attempt(async()=>{if(!confirm('این نسخه در پیش‌نویس بارگذاری شود؟'))return;await store.restore(commit.sha);notice('نسخهٔ انتخابی در پیش‌نویس آمادهٔ بررسی است.');render();})));rows.append(row);}})));
}
function render(){if(!loaded)return;view.replaceChildren();const route=location.hash.slice(1);if(!Object.hasOwn(routes,route))return;
 if(route==='articles')articleEditor();if(route==='profile')profileEditor();if(route==='contact')profileEditor(true);if(route==='pages')pageEditor();if(route==='appearance')appearanceEditor();if(route==='menus')menuEditor();if(route==='media')mediaEditor();if(route==='history')historyEditor();status();sendPreview();
}
function route(){const route=location.hash.slice(1);$('studio-view').hidden=!Object.hasOwn(routes,route);$('publish-bar').hidden=!loaded;if(Object.hasOwn(routes,route))render();}
window.addEventListener('hashchange',route);
window.addEventListener('beforeunload',event=>{if(store.storageError&&store.count||store.busy){event.preventDefault();event.returnValue='';}});
try{await store.load();loaded=true;route();setPreview();status();if(session.state==='connected')await synchronize();}catch(error){notice(error.message,true);}
