import {failurePage} from '../../../server/cms-oauth-failure.mjs';

export function onRequestGet({request,env}) {
  const url = new URL(request.url);
  const origin = env.CMS_ORIGIN || 'https://drgerami-md.ir';
  const headers = new Headers({'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex'});
  const dashboard = url.searchParams.get('return') === 'dashboard';
  return failurePage('github_unavailable',headers,origin,dashboard,url.origin === origin,200);
}
