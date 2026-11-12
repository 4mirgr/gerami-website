// Only setup readiness is public; no key, token, account or session details.
export function onRequestGet({env}) {
 return Response.json({configured:Boolean(env.CMS_GITHUB_CLIENT_ID&&env.CMS_GITHUB_CLIENT_SECRET)},{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
