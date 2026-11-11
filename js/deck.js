(() => {
 const deck=document.querySelector('.feature-deck'); if(!deck)return;
 const cards=[...deck.querySelectorAll('[data-feature]')];let active=1;
 const controls=deck.querySelector('.deck-controls');controls.hidden=false;
 function show(next){active=(next+cards.length)%cards.length;cards.forEach((card,i)=>{card.dataset.position=i===active?'active':i===(active+1)%3?'next':'previous';card.querySelectorAll('a').forEach(a=>a.tabIndex=i===active?0:-1);});deck.querySelectorAll('.deck-dots i').forEach((dot,i)=>dot.classList.toggle('active',i===active));}
 deck.querySelector('[data-deck-prev]').addEventListener('click',()=>show(active-1));
 deck.querySelector('[data-deck-next]').addEventListener('click',()=>show(active+1));
 show(active);
})();
