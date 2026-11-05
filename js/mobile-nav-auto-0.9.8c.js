/* DaRoPlan 0.9.8c: chowanie nawigacji podczas przewijania TREŚCI panelu. */
(()=>{'use strict';
  const nav=document.querySelector('.bottom-nav');
  const panel=document.getElementById('infoPanel');
  if(!nav||!panel)return;
  const mq=window.matchMedia('(max-width:700px)');
  const targets=[document.getElementById('layersMenu'),document.getElementById('infoContent')].filter(Boolean);
  const previous=new WeakMap();
  let deltaDown=0;
  function visible(){nav.classList.remove('dp-nav-auto-hidden');deltaDown=0;}
  function panelOpen(){return !panel.classList.contains('hidden') && panel.dataset.sheetState!=='hidden';}
  function onScroll(event){
    if(!mq.matches){visible();return;}
    const el=event.currentTarget;
    const now=el.scrollTop;
    const last=previous.has(el)?previous.get(el):now;
    previous.set(el,now);
    if(!panelOpen()){visible();return;}
    const diff=now-last;
    if(now<=4 || diff < -3){visible();return;}
    if(diff>0){
      deltaDown+=diff;
      if(deltaDown>=14 && now>18)nav.classList.add('dp-nav-auto-hidden');
    }
  }
  targets.forEach(el=>el.addEventListener('scroll',onScroll,{passive:true}));
  // Wybór modułu i pełne schowanie panelu przywracają menu.
  nav.addEventListener('click',visible);
  const observer=new MutationObserver(()=>{
    if(!mq.matches || !panelOpen())visible();
    else if(panel.dataset.sheetState==='half')visible();
  });
  observer.observe(panel,{attributes:true,attributeFilter:['class','data-sheet-state']});
  if(mq.addEventListener)mq.addEventListener('change',visible);
  else mq.addListener(visible);
  visible();
})();
