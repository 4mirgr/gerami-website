// Dedicated GitHub OAuth application. No IntMed/AUS accounts or credentials.
export async function onRequestGet({ request, env }) {
  const origin = env.CMS_ORIGIN || 'https://drgerami-md.ir';
  if (new URL(request.url).origin !== origin) return new Response('Invalid origin', {status:403});
  if (!env.CMS_GITHUB_CLIENT_ID || !env.CMS_GITHUB_CLIENT_SECRET) return new Response('CMS login is not configured.', {status:503});
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const state = Array.from(bytes, b => b.toString(16).padStart(2,'0')).join('');
  const url = new URL('https://github.com/login/oauth/authorize');
  url.search = new URLSearchParams({client_id:env.CMS_GITHUB_CLIENT_ID, redirect_uri:origin + '/api/cms/callback', scope:'public_repo', state}).toString();
  return new Response(null, {status:302, headers:{Location:url.href,'Set-Cookie':`__Host-cms-state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,'Cache-Control':'no-store'}});
}
