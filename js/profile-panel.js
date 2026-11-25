let profileHost;

export function renderProfilePanel(profile,{main,path,el,https,lang,text}){
  if(!profileHost){profileHost=main.querySelector('[data-profile-host]');if(!profileHost){profileHost=el('section','','cms-profile container');main.append(profileHost);}}profileHost.replaceChildren();
  if(path.endsWith('/about')){
   if(profile['bio_'+lang()])profileHost.append(el('p',profile['bio_'+lang()]));const entries=Array.isArray(profile.cv)?profile.cv:[];
   if(entries.length)profileHost.append(el('h2',text('مسیر حرفه‌ای و سوابق بالینی','Training and clinical experience')));
   for(const item of entries){const card=el('article','','career-entry');card.append(el('h3',item['title_'+lang()]),el('p',item['detail_'+lang()]));profileHost.append(card);}
  }else{
   const contact=[];
   if(typeof profile.email==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email))contact.push([profile.email,'mailto:'+profile.email]);
   if(typeof profile.phone==='string'&&/^\+?[0-9 -]{7,20}$/.test(profile.phone))contact.push([profile.phone,'tel:'+profile.phone]);
   if(https(profile.linkedin)&&/^(www\.)?linkedin\.com$/.test(new URL(profile.linkedin).hostname))contact.push(['LinkedIn',profile.linkedin]);
   if(https(profile.appointment))contact.push([text('دریافت نوبت','Book a visit'),profile.appointment]);
   if(contact.length)profileHost.append(el('h2',text('راه‌های ارتباط و مراجعه','Contact and visits')));
   for(const [label,href] of contact){const a=el('a',label,'button button-secondary');a.href=href;profileHost.append(a);}
  }
 }
