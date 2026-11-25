// Visitor-only preferences. Nothing is written to Studio, the account or the server.
const root = document.documentElement;
const colors = [
  ['blue', 'آبی', 'Blue'], ['warm', 'گرم (نارنجی / قرمز)', 'Warm (orange / red)'],
  ['violet', 'بنفش', 'Violet'], ['green', 'سبز', 'Green'], ['neutral', 'خنثی', 'Neutral'],
];
const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
const save = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
export function enableAppearance() {
  const sheet = document.createElement('link');
  sheet.rel = 'stylesheet';
  sheet.href = '/assets/glass/waves/settings.css?v=3';
  document.head.append(sheet);
  const choices = rows => rows.map(([key,fa,en]) => `<option value="${key}" data-fa="${fa}" data-en="${en}">${fa}</option>`).join('');
  const dialog = document.createElement('dialog');
  dialog.className = 'appearance-dialog';
  dialog.setAttribute('aria-labelledby','appearance-heading');
  dialog.innerHTML = `
    <div class="appearance-content">
      <h2 id="appearance-heading" data-fa="نمای ظاهری سایت" data-en="Site appearance">نمای ظاهری سایت</h2>
      <p data-fa="انتخاب‌ها در همین مرورگر ذخیره می‌شوند." data-en="Your choices are saved in this browser.">انتخاب‌ها در همین مرورگر ذخیره می‌شوند.</p>
      <label><span data-fa="تم" data-en="Theme">تم</span>
        <select name="style">${choices([['classic','پل طلایی (پیش‌فرض)','Golden Gate (default)'],['wave','موج شیشه‌ای','Glass Wave']])}</select>
      </label>
      <div class="appearance-options" hidden>
        <label><span data-fa="رنگ" data-en="Color">رنگ</span><select name="color">${choices(colors)}</select></label>
        <label><span data-fa="روشنایی" data-en="Brightness">روشنایی</span>
          <select name="brightness">${choices([['light','روشن','Light'],['dark','تیره','Dark']])}</select>
        </label>
      </div>
      <button type="button" class="appearance-close" data-fa="بستن" data-en="Close">بستن</button>
    </div>`;
  const mode = dialog.querySelector('[name=style]');
  const color = dialog.querySelector('[name=color]');
  const brightness = dialog.querySelector('[name=brightness]');
  const options = dialog.querySelector('.appearance-options');
  const saved = read('ahg-wave-color');
  color.value = colors.some(([id]) => id === saved) ? saved : 'blue';

  function sync() {
    const lang = root.lang === 'en' ? 'en' : 'fa';
    dialog.querySelectorAll('[data-fa]').forEach(el => { el.textContent = el.dataset[lang]; });
    mode.value = root.dataset.wave ? 'wave' : 'classic';
    options.hidden = mode.value !== 'wave';
    brightness.value = root.dataset.theme === 'dark' ? 'dark' : 'light';
  }
  function apply() {
    if (mode.value === 'wave') root.dataset.wave = color.value;
    else delete root.dataset.wave;
    save('ahg-appearance', mode.value);
    save('ahg-wave-color', color.value);
    sync();
  }
  mode.addEventListener('change', apply);
  color.addEventListener('change', apply);
  brightness.addEventListener('change', () => {
    if (brightness.value !== root.dataset.theme) document.querySelector('[data-theme-toggle]')?.click();
    sync();
  });

  dialog.querySelector('.appearance-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => document.getElementById('account-trigger')?.focus());
  new MutationObserver(sync).observe(root,{attributes:true,attributeFilter:['lang','data-theme']});
  if (read('ahg-appearance') === 'wave') root.dataset.wave = color.value;
  document.body.append(dialog);
  sync();
  return () => { sync(); if (!dialog.open) dialog.showModal(); };
}
