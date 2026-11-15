const root=document.documentElement,hosts=[...document.querySelectorAll('[data-account-menu]')];
const preview=new URLSearchParams(location.search).has('studio-preview')&&parent!==window;
let state=null;
const tr=(fa,en)=>root.lang==='en'?en:fa;
function render(){for(const host of hosts){if(!state?.user&&!state?.private)continue;host.replaceChildren();const link=document.createElement('a');link.className='account-link';link.href='/account/';link.textContent=state.user&&['owner','admin'].includes(state.user.role)?tr('پنل مدیریت','Administration'):tr('حساب من','My account');host.append(link);if(state.user){const logout=document.createElement('button');logout.type='button';logout.className='account-link account-secondary';logout.textContent=tr('خروج','Sign out');logout.addEventListener('click',async()=>{logout.disabled=true;try{const response=await fetch('/api/account/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',cache:'no-store'});if(!response.ok)throw Error();try{localStorage.removeItem('decap-cms-user');}catch{}location.reload();}catch{logout.disabled=false;logout.textContent=tr('تلاش دوباره','Retry');}});host.append(logout);}}}
if(hosts.length&&!preview){
 try{state=await (await fetch('/api/account/session',{cache:'no-store',signal:AbortSignal.timeout(10000)})).json();render();}catch{/* Static sign-in and signup links remain available. */}
 new MutationObserver(render).observe(root,{attributes:true,attributeFilter:['lang']});
}
