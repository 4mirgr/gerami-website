/* The existing CMS session verifies this site's exact owner on the server.
   It grants administration only, never patient access or a clinical role. */
(() => {
 const host=document.querySelector('[data-account-controls]');if(!host)return;
 const signin=host.firstElementChild.cloneNode(true);
 let authenticated=false;
 const label=(fa,en)=>document.documentElement.lang==='en'?en:fa;
 function render(){
  if(!authenticated){const link=signin.cloneNode(true);link.querySelector('span').textContent=label('ورود مدیریت','Admin sign in');host.replaceChildren(link);return;}
  const profile=document.createElement('span');profile.className='account-profile';
  const dot=document.createElement('span');dot.className='account-presence'+(navigator.onLine?'':' is-offline');dot.setAttribute('role','img');dot.setAttribute('aria-label',navigator.onLine?label('آنلاین','Online'):label('آفلاین','Offline'));
  const name=document.createElement('bdi');name.className='account-name';name.textContent=label('دکتر امیرهوشنگ گرامی','Dr. Amir Houshang Gerami');name.title=name.textContent;
  profile.append(dot,name);
  const logout=document.createElement('button');logout.type='button';logout.className='account-logout';logout.textContent=label('خروج','Log out');
  logout.addEventListener('click',async()=>{
   logout.disabled=true;
   try{
    const reply=await fetch('/api/cms/session',{method:'DELETE',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(8000)});
    if(!reply.ok)throw Error('logout_failed');
    try{localStorage.removeItem('decap-cms-user');}catch{}
    authenticated=false;render();
   }catch{logout.disabled=false;logout.textContent=label('تلاش دوباره','Retry');logout.title=label('خروج تأیید نشد؛ دوباره تلاش کنید.','Sign-out was not confirmed. Please retry.');}
  });
  host.replaceChildren(profile,logout);
 }
 async function refresh(){
  try{
   const response=await fetch('/api/cms/session',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},signal:AbortSignal.timeout(8000)});
   if(!response.ok)return;const data=await response.json();authenticated=data.authenticated===true;render();
  }catch{/* Keep the existing sign-in link during temporary network failures. */}
 }
 new MutationObserver(render).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
 addEventListener('online',render);addEventListener('offline',render);
 addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
 refresh();
})();
