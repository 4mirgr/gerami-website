const failures = {
  oauth_state: [403, 'زمان ورود تمام شده یا مرورگر درخواست ورود را به خاطر نسپرده است. اتصال را در همین مرورگر دوباره شروع کنید.'],
  oauth_denied: [403, 'درخواست ورود در GitHub لغو شد. برای اتصال، دوباره وارد شوید و دسترسی مخزن سایت را تأیید کنید.'],
  oauth_expired: [400, 'کد یک‌بارمصرف GitHub منقضی شده یا قبلاً استفاده شده است. با دکمه زیر کد تازه بگیرید.'],
  oauth_config: [503, 'GitHub مشخصات برنامه ورود سایت را نپذیرفت. شناسه و کلید برنامه در تنظیمات سرور باید بررسی شوند.'],
  oauth_redirect: [503, 'نشانی بازگشت برنامه در GitHub باید با نشانی بازگشت سایت یکسان باشد.'],
  github_owner_required: [403, 'این حساب GitHub دسترسی لازم برای انتشار در مخزن سایت را ندارد. با حساب مدیر مخزن وارد شوید.'],
  github_rate_limited: [429, 'GitHub موقتاً تعداد درخواست‌ها را محدود کرده است. کمی بعد دوباره تلاش کنید.'],
  github_unavailable: [502, 'سرور سایت نتوانست پاسخ معتبر از GitHub دریافت کند. اتصال را دوباره شروع کنید.']
};
export const safe = value => JSON.stringify(value).replace(/</g,'\\u003c');

export function failurePage(code, headers, origin, dashboard, notify, status = failures[code][0]) {
  const message = failures[code][1];
  const nonce = crypto.randomUUID();
  headers.set('Content-Type','text/html; charset=utf-8');
  headers.set('Content-Security-Policy',`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'`);
  const retry = '/api/cms/auth' + (dashboard ? '?return=dashboard' : '');
  const alternate = code === 'github_unavailable' ? '<a href="/admin/#github-token-connect">اتصال با توکن مخزن در پنل</a>' : '';
  const payload = 'authorization:github:error:' + JSON.stringify({provider:'github',code,message});
  const script = notify ? `<script data-cfasync="false" nonce="${nonce}">try{window.opener?.postMessage(${safe(payload)},${safe(origin)});}catch(_){}</script>` : '';
  return new Response(`<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>اتصال به GitHub</title>
<style nonce="${nonce}">:root{color-scheme:light dark;font:1rem/1.9 system-ui,sans-serif}main{max-width:32rem;margin:10vh auto;padding:1.5rem}h1{font-size:1.4rem}nav{display:flex;flex-wrap:wrap;gap:1rem}a{padding:.3rem .7rem}</style>
<main><h1>اتصال به GitHub کامل نشد</h1><p>${message}</p><nav><a href="${retry}">شروع دوباره اتصال</a>${alternate}<a href="/admin/">بازگشت به داشبورد</a></nav></main>${script}</html>`,{status,headers});
}
