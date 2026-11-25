const root=document.documentElement;
// Keep optional theme resources off the default first load.
const footer=document.querySelector('.footer-bottom');
if(footer&&window.HTMLDialogElement&&!(parent!==window&&new URLSearchParams(location.search).has('studio-preview'))){
 const button=document.createElement('button');button.type='button';button.className='button button-secondary appearance-launch';button.setAttribute('aria-haspopup','dialog');
 button.dataset.fa='تنظیمات ظاهر';button.dataset.en='Appearance settings';button.textContent=button.dataset[root.lang==='en'?'en':'fa'];footer.append(button);
 let wave;const load=()=>wave??=import('./settings.js?v=2').then(m=>m.enableAppearance(button)).catch(()=>{wave=null;});
 button.onclick=async()=>(await load())?.();
 try{if(localStorage.getItem('ahg-appearance')==='wave')load();}catch{}
}
