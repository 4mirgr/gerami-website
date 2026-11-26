// Preserve the existing panel and its draft when this page was opened by the dashboard.
document.getElementById('use-token').addEventListener('click',event=>{
 if(!window.opener||window.opener.closed)return;
 try{
  if(window.opener.location.origin!==location.origin||!window.opener.document.getElementById('github-connect'))return;
  const fallback=event.currentTarget.href;
  window.opener.postMessage('gerami:github:use-saved-token',location.origin);
  window.opener.focus();
  event.preventDefault();
  // An active dashboard closes this popup. Recover if the opener was reloaded.
  setTimeout(()=>location.replace(fallback),700);
 }catch{/* The normal link also works when the opener is unavailable. */}
});
