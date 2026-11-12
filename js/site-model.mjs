/* Shared, dependency-free contract for the public site and its manager. */
export const pages={home:'صفحهٔ اصلی',about:'دربارهٔ من',services:'حوزه‌های فعالیت',blog:'آموزش و مقالات',projects:'پروژه‌ها',contact:'ارتباط',appointments:'اطلاعات مراجعه',beyond:'فراتر از پزشکی'};
export const fonts={Vazirmatn:'وزیرمتن',Tahoma:'Tahoma',Arial:'Arial',system:'فونت سیستم'};
export const sections={hero:'معرفی و کارت‌های اصلی',explore:'مسیرهای دسترسی',projects:'پروژه‌ها',about:'معرفی کوتاه',education:'آموزش',articles:'تازه‌ترین مطالب'};
export const managedPaths=['content/appearance.json','content/navigation.json','content/extra-pages.json','content/site.json','content/articles.json',...Object.keys(pages).map(id=>`content/pages/${id}.json`)];
export const clone=value=>JSON.parse(JSON.stringify(value));
export function safeLink(value){
 if(typeof value!=='string'||value.length>2000||/[\s\\\u0000-\u001f]/.test(value))return false;
 if(value.startsWith('/')&&!value.startsWith('//')&&!value.includes('..'))return true;
 if(/^#[a-zA-Z0-9_-]+$/.test(value))return true;
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}
}
export const asset=value=>typeof value==='string'&&/^\/assets\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.(?:webp|png|jpe?g|avif|gif|svg)$/i.test(value)&&!value.includes('..');
export const pageSlug=value=>typeof value==='string'&&/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value)&&!['index','page','admin','api','intmed','aus',...Object.keys(pages)].includes(value);
function must(ok,message){if(!ok)throw Error(message);}
const string=(s,max=20000)=>typeof s==='string'&&s.length<=max;
export function validateDocument(path,data){
 must(managedPaths.includes(path),'مسیر این فایل قابل ویرایش نیست.');
 must(data&&typeof data==='object'&&!Array.isArray(data),'ساختار فایل معتبر نیست.');
 if(path==='content/appearance.json'){
  must(Object.hasOwn(fonts,data.font),'فونت معتبر نیست.');
  for(const [key,min,max] of [['fontSize',14,22],['lineHeight',1.4,2.4],['headingWeight',400,900],['radius',0,36],['width',960,1440]])must(Number.isFinite(data[key])&&data[key]>=min&&data[key]<=max,`مقدار ${key} خارج از محدوده است.`);
  for(const mode of ['light','dark']){
   must(data[mode]&&typeof data[mode]==='object','تنظیمات روز و شب لازم است.');
   for(const key of ['paper','white','ink','muted','wash','line','teal','button','buttonText'])must(/^#[0-9a-f]{6}$/i.test(data[mode][key]),`رنگ ${key} معتبر نیست.`);
   for(const key of ['logo','wallpaper','background'])must((key==='background'&&data[mode][key]==='')||asset(data[mode][key]),'لوگو و تصویر کارت باید از رسانه‌های همین سایت باشند.');
  }
  must(Array.isArray(data.sections)&&data.sections.length===Object.keys(sections).length&&new Set(data.sections.map(s=>s.id)).size===Object.keys(sections).length&&data.sections.every(s=>Object.hasOwn(sections,s.id)&&typeof s.visible==='boolean'),'بخش‌های صفحهٔ اصلی معتبر نیستند.');
  must(data.sections[0].id==='hero'&&data.sections[0].visible,'معرفی اصلی باید اولین بخش و قابل نمایش باشد.');
 }else if(path==='content/navigation.json'){
  let count=0;
  function list(items,depth){must(Array.isArray(items)&&depth<=3,'منو حداکثر سه سطح دارد.');for(const item of items){count++;must(count<=60,'حداکثر ۶۰ گزینه در منو مجاز است.');must(string(item.fa,120)&&item.fa.trim()&&string(item.en,120)&&item.en.trim(),'عنوان فارسی و انگلیسی منو لازم است.');must(safeLink(item.url),'آدرس منو باید مسیر سایت یا HTTPS معتبر باشد.');if(item.children?.length)list(item.children,depth+1);}}
  list(data.header,1);list(data.footer,1);must(data.header.length>0,'منوی اصلی نباید خالی باشد.');
 }else if(path==='content/extra-pages.json'){
  must(Array.isArray(data.pages)&&data.pages.length<=50,'حداکثر ۵۰ صفحه مجاز است.');const seen=new Set();
  for(const item of data.pages){must(pageSlug(item.slug)&&!seen.has(item.slug),'شناسهٔ صفحه تکراری یا رزرو شده است.');seen.add(item.slug);must(typeof item.published==='boolean','وضعیت صفحه معتبر نیست.');for(const key of ['title_fa','title_en','description_fa','description_en','body_fa','body_en'])must(string(item[key],100000),'متن صفحه معتبر نیست.');if(item.published)must(item.title_fa.trim()&&item.title_en.trim()&&item.body_fa.trim()&&item.body_en.trim(),'صفحهٔ منتشرشده به عنوان و متن در هر دو زبان نیاز دارد.');must(!item.image||asset(item.image),'تصویر صفحه معتبر نیست.');}
 }else if(path==='content/site.json'){
  for(const key of ['bio_fa','bio_en','email','phone','linkedin','appointment'])must(string(data[key]),'اطلاعات پروفایل معتبر نیست.');
  must(!data.email||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email),'ایمیل معتبر نیست.');
  must(!data.phone||/^\+?[0-9 -]{7,20}$/.test(data.phone),'تلفن معتبر نیست.');
  for(const key of ['linkedin','appointment'])must(!data[key]||data[key].startsWith('https://')&&safeLink(data[key]),'پیوند تماس باید HTTPS باشد.');
  if(data.linkedin)must(/^(www\.)?linkedin\.com$/.test(new URL(data.linkedin).hostname),'لینکدین باید از linkedin.com باشد.');
  must(Array.isArray(data.cv)&&data.cv.length<=100,'فهرست رزومه معتبر نیست.');
  for(const item of data.cv)for(const key of ['title_fa','title_en','detail_fa','detail_en'])must(string(item[key])&&item[key].trim(),'سوابق به عنوان و شرح دو زبان نیاز دارند.');
 }else if(path==='content/articles.json'){
  must(Array.isArray(data.articles)&&data.articles.length<=500,'فهرست مقالات معتبر نیست.');const seen=new Set();
  for(const item of data.articles){
   must(typeof item.slug==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug)&&!seen.has(item.slug),'شناسهٔ مقاله نامعتبر یا تکراری است.');seen.add(item.slug);
   must(['draft','published'].includes(item.status)&&['patients','professional'].includes(item.audience),'وضعیت یا مخاطب مقاله معتبر نیست.');
   for(const key of ['title_fa','title_en','body_fa','body_en','author','category'])must(string(item[key]??'',100000)&&(item.status!=='published'||item[key]?.trim()),'برای انتشار مقاله، عنوان و متن دو زبان، نویسنده و دسته‌بندی را کامل کنید.');
   for(const key of ['published_at','reviewed_at']){const date=item[key]||'';must((!date&&item.status==='draft')||/^\d{4}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date,'تاریخ انتشار و بازبینی معتبر نیست.');}
   must(!item.published_at||!item.reviewed_at||item.reviewed_at>=item.published_at,'تاریخ بازبینی نباید قبل از انتشار باشد.');
   must(!item.image||asset(item.image)&&item.image.startsWith('/assets/uploads/'),'تصویر مقاله را از رسانه‌های بارگذاری‌شده انتخاب کنید.');
   must(!item.sources||Array.isArray(item.sources)&&item.sources.length<=100,'منابع معتبر نیستند.');for(const source of item.sources||[])must(string(source.title)&&source.url?.startsWith('https://')&&safeLink(source.url),'منبع نیاز به عنوان و پیوند HTTPS دارد.');
  }
 }else{
  must(data.blocks&&typeof data.blocks==='object'&&!Array.isArray(data.blocks),'متن‌های صفحه لازم است.');
  must(Object.keys(data.blocks).length<=300,'تعداد متن‌ها بیش از حد مجاز است.');
  for(const [key,value] of Object.entries(data.blocks)){must(/^text-\d{3}$/.test(key)&&value&&string(value.fa)&&string(value.en),'شناسه یا ترجمهٔ متن معتبر نیست.');}
  must(data.links&&typeof data.links==='object'&&Object.keys(data.links).length<=100,'پیوندهای صفحه معتبر نیستند.');
  for(const [key,value] of Object.entries(data.links))must(/^link-\d{3}$/.test(key)&&safeLink(value),'نشانی پیوند معتبر نیست.');
 }
 must(JSON.stringify(data).length<=750000,'حجم فایل بیش از حد مجاز است.');return data;
}
export function validateSite(documents){
 for(const path of managedPaths)validateDocument(path,documents[path]);
 const available=new Set(['/','/index.html',...Object.keys(pages).filter(id=>id!=='home').map(id=>'/pages/'+id+'.html'),...documents['content/extra-pages.json'].pages.filter(item=>item.published).map(item=>'/pages/'+item.slug+'.html')]);
 const check=url=>{const path=url.split(/[?#]/)[0];if(path.startsWith('/pages/')&&!available.has(path))throw Error('پیوند به صفحهٔ ناموجود یا منتشرنشده: '+path);};
 const menu=items=>{for(const item of items){check(item.url);menu(item.children||[]);}};
 menu(documents['content/navigation.json'].header);menu(documents['content/navigation.json'].footer);
 for(const id of Object.keys(pages))for(const url of Object.values(documents[`content/pages/${id}.json`].links))check(url);
 return documents;
}
