(() => {
  'use strict';
  const bookingHosts={'www.paziresh24.com':'paziresh24','paziresh24.com':'paziresh24','snapp.doctor':'snapp','drnext.ir':'drnext'};
  const surface=document.body.dataset.page;
  const consentKey='gerami-booking-counts';
  const privacyControl=document.querySelector('[data-booking-consent]');
  function optedIn(){
    try{return navigator.globalPrivacyControl!==true && navigator.doNotTrack!=='1' && localStorage.getItem(consentKey)==='yes';}
    catch{return false;}
  }
  if(privacyControl){
    privacyControl.hidden=false;
    const checkbox=privacyControl.querySelector('input');
    checkbox.checked=optedIn();
    checkbox.disabled=navigator.globalPrivacyControl===true||navigator.doNotTrack==='1';
    checkbox.onchange=()=>{try{if(checkbox.checked)localStorage.setItem(consentKey,'yes');else localStorage.removeItem(consentKey);}catch{}checkbox.checked=optedIn();};
  }
  if(['home','appointments'].includes(surface)){
    document.addEventListener('click',event=>{
      const link=event.target.closest?.('a[href]');
      if(!event.isTrusted || event.defaultPrevented || !link || link.protocol!=='https:' || !optedIn())return;
      const provider=bookingHosts[link.hostname];
      if(!provider)return;
      const payload={surface,provider};
      if(surface==='appointments' && document.referrer){
        const previous=new URL(document.referrer);
        const match=previous.origin===location.origin && /^\/articles\/(?:[a-z0-9-]+\/){0,2}([a-z0-9-]+)\/$/.exec(previous.pathname);
        if(match)payload.article=match[1];
      }
      fetch('/api/discussion/booking-click',{method:'POST',credentials:'omit',referrerPolicy:'no-referrer',keepalive:true,
        headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).catch(()=>{});
    });
  }

})();
