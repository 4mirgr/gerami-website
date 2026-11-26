const DAY = 86_400_000;
const zone = 'Asia/Tehran';
const civilClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: zone, calendar: 'gregory', numberingSystem: 'latn',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});
// UTC here represents a civil date, so calendar navigation is independent of DST.
const persianDay = new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-latn', {timeZone:'UTC', day:'numeric'});
const persianMonth = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {timeZone:'UTC', month:'long', year:'numeric'});
const persianFull = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {timeZone:'UTC', dateStyle:'full'});
const number = new Intl.NumberFormat('fa-IR', {useGrouping:false});
const twoDigits = new Intl.NumberFormat('fa-IR', {minimumIntegerDigits:2, useGrouping:false});
const weekdays = ['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه'];
let sequence = 0;

export function tehranLocalMinute(instant = new Date()) {
  const p = Object.fromEntries(civilClock.formatToParts(instant).map(part => [part.type, part.value]));
  return p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute;
}

function epochDay(date) {
  const epoch = Date.parse(date+'T00:00:00Z');
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString().slice(0,10) !== date) {
    throw new RangeError('Invalid civil date');
  }
  return epoch / DAY;
}
function civilDate(day) { return new Date(day * DAY).toISOString().slice(0,10); }
function dayOfMonth(day) { return Number(persianDay.format(day * DAY)); }
function firstOfMonth(day) { return day + 1 - dayOfMonth(day); }
function weekIndex(day) { return (new Date(day * DAY).getUTCDay() + 1) % 7; }

export function movePersianMonth(day, step) {
  const first = firstOfMonth(day);
  const target = firstOfMonth(first + (step > 0 ? 32 : -1));
  const length = firstOfMonth(target+32) - target;
  return target + Math.min(dayOfMonth(day), length) - 1;
}

function normalize(value) {
  if (value == null || value === '') return tehranLocalMinute();
  if (value instanceof Date) return tehranLocalMinute(value);
  if (typeof value === 'string' && /^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    epochDay(value.slice(0,10));
    return value;
  }
  if (typeof value === 'string' && /^\d{4}-\d\d-\d\dT.+(?:Z|[+-]\d\d:\d\d)$/i.test(value)) {
    epochDay(value.slice(0,10));
    return tehranLocalMinute(new Date(value));
  }
  throw new RangeError('Expected a Tehran-local minute or an ISO instant with offset');
}

export function formatTehranDate(value,{time=false}={}) {
  if (value == null || value === '') return '';
  let local;
  try {
    local=typeof value==='string' && /^\d{4}-\d\d-\d\d$/.test(value)?normalize(value+'T00:00'):normalize(value);
  } catch (error) {
    if (error instanceof RangeError) return '';
    throw error;
  }
  const [date,clock]=local.split('T');
  return persianFull.format(epochDay(date)*DAY)+(time?'، '+clock.replace(/\d/g,d=>number.format(Number(d))):'');
}

function element(tag, text, cls) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (cls) node.className = cls;
  return node;
}
function button(text, label) {
  const node = element('button',text);
  node.type = 'button';
  if (label) node.setAttribute('aria-label',label);
  return node;
}
function clockSelect(label, limit) {
  const wrap = element('label', label), select = element('select');
  select.setAttribute('aria-label',label);
  for (let n=0; n<limit; n++) select.add(new Option(twoDigits.format(n), String(n).padStart(2,'0')));
  wrap.append(select);
  return {wrap, select};
}

/** Gregorian Tehran-local value: YYYY-MM-DDTHH:mm, or YYYY-MM-DD in dateOnly mode. */
export function createTehranPicker({value, label='تاریخ و ساعت انتشار', dateOnly=false, allowEmpty=false} = {}) {
  if (!document.querySelector('link[data-tehran-calendar]')) {
    const css = element('link'); css.rel='stylesheet'; css.dataset.tehranCalendar='';
    css.href=new URL('./tehran-calendar.css',import.meta.url).href;
    document.head.append(css);
  }
  function fieldValue(input) {
    if (allowEmpty && !input) return '';
    if (dateOnly && typeof input==='string' && /^\d{4}-\d\d-\d\d$/.test(input)) input+='T00:00';
    const minute=normalize(input);
    return dateOnly?minute.slice(0,10):minute;
  }
  let saved=fieldValue(value), dialog, cursor, chosen, caption, grid, hours, minutes;
  const id='tehran-calendar-'+(++sequence);
  const host=element('div','','tehran-picker'), trigger=button('');
  host.dir='rtl'; host.lang='fa';
  trigger.className='tehran-calendar-trigger'; trigger.setAttribute('aria-haspopup','dialog');
  trigger.setAttribute('aria-expanded','false');
  host.append(trigger);

  function showValue() {
    trigger.textContent=formatTehranDate(saved,{time:!dateOnly})||'انتخاب تاریخ';
    trigger.setAttribute('aria-label',label+'، '+trigger.textContent+' به وقت تهران');
  }
  function draw(focus=false) {
    const first=firstOfMonth(cursor), end=firstOfMonth(first+32);
    const today=epochDay(tehranLocalMinute().slice(0,10));
    caption.textContent=persianMonth.format(first*DAY);
    grid.replaceChildren();
    for (let n=0; n<weekIndex(first); n++) grid.append(element('span'));
    for (let day=first; day<end; day++) {
      const cell=button(number.format(day-first+1),persianFull.format(day*DAY));
      cell.dataset.day=String(day);
      cell.tabIndex=day===cursor?0:-1;
      cell.setAttribute('aria-pressed',String(day===chosen));
      if (day===today) cell.setAttribute('aria-current','date');
      grid.append(cell);
    }
    if (focus) grid.querySelector('[tabindex="0"]').focus();
  }
  function buildDialog() {
    dialog=element('dialog','','tehran-calendar'); dialog.id=id;
    dialog.setAttribute('aria-labelledby',id+'-title');
    const title=element('h3',label); title.id=id+'-title';
    const header=element('div','','tehran-month'), prev=button('ماه قبل'), next=button('ماه بعد');
    caption=element('strong'); caption.setAttribute('aria-live','polite');
    prev.onclick=()=>{cursor=movePersianMonth(cursor,-1);draw();};
    next.onclick=()=>{cursor=movePersianMonth(cursor,1);draw();};
    header.append(prev,caption,next);
    const week=element('div','','tehran-week');
    week.setAttribute('aria-hidden','true');
    for(const name of weekdays) week.append(element('span',name));
    grid=element('div','','tehran-days');grid.setAttribute('role','group');grid.setAttribute('aria-label','انتخاب روز');
    grid.onclick=e=>{const cell=e.target.closest('button[data-day]');if(cell){chosen=cursor=Number(cell.dataset.day);draw(true);}};
    grid.onkeydown=e=>{
      const day=Number(e.target.dataset.day);
      if(!Number.isInteger(day))return;
      switch(e.key){
        case 'ArrowLeft':cursor=day+1;break;
        case 'ArrowRight':cursor=day-1;break;
        case 'ArrowDown':cursor=day+7;break;
        case 'ArrowUp':cursor=day-7;break;
        case 'Home':cursor=day-weekIndex(day);break;
        case 'End':cursor=day+6-weekIndex(day);break;
        case 'PageDown':cursor=movePersianMonth(day,1);break;
        case 'PageUp':cursor=movePersianMonth(day,-1);break;
        default:return;
      }
      e.preventDefault();draw(true);
    };
    const clock=element('fieldset','','tehran-clock');
    if(!dateOnly){
      hours=clockSelect('ساعت',24);minutes=clockSelect('دقیقه',60);
      clock.append(element('legend','زمان به وقت تهران (۲۴ ساعته)'),hours.wrap,minutes.wrap);
    }
    const actions=element('div','','tehran-actions'), save=button(dateOnly?'ثبت تاریخ':'ثبت تاریخ و ساعت'), cancel=button('انصراف');
    cancel.onclick=()=>dialog.close();
    save.onclick=()=>{
      saved=civilDate(chosen)+(dateOnly?'':'T'+hours.select.value+':'+minutes.select.value);
      showValue();dialog.close();host.dispatchEvent(new Event('change',{bubbles:true}));
    };
    actions.append(save,cancel);
    if(allowEmpty){
      const clear=button('پاک کردن تاریخ');
      clear.onclick=()=>{saved='';showValue();dialog.close();host.dispatchEvent(new Event('change',{bubbles:true}));};
      actions.append(clear);
    }
    dialog.append(title,header,week,grid);if(!dateOnly)dialog.append(clock);
    dialog.append(actions);host.append(dialog);
    trigger.setAttribute('aria-controls',id);
    dialog.addEventListener('change',e=>e.stopPropagation());
    dialog.addEventListener('close',()=>{trigger.setAttribute('aria-expanded','false');trigger.focus({preventScroll:true});});
    dialog.onclick=e=>{
      if(e.target!==dialog)return;
      const r=dialog.getBoundingClientRect();
      if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();
    };
  }
  trigger.onclick=()=>{
    if(!dialog)buildDialog();
    const [date,time]=(saved||tehranLocalMinute()).split('T');
    chosen=cursor=epochDay(date);
    if(!dateOnly)[hours.select.value,minutes.select.value]=time.split(':');
    draw();
    dialog.style.removeProperty('left');dialog.style.removeProperty('top');
    dialog.showModal();trigger.setAttribute('aria-expanded','true');
    if(innerWidth>=640){
      const r=trigger.getBoundingClientRect(),w=dialog.offsetWidth,h=dialog.offsetHeight;
      const left=Math.max(8,Math.min(r.right-w,innerWidth-w-8));
      const top=r.bottom+h+8<=innerHeight?r.bottom+4:Math.max(8,r.top-h-4);
      dialog.style.left=left+'px';dialog.style.top=top+'px';
    }
    grid.querySelector('[tabindex="0"]').focus({preventScroll:true});
  };
  showValue();
  return {element:host,get value(){return saved;},set value(next){saved=fieldValue(next);showValue();}};
}
