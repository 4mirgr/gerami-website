# AUS gateway activation

Pages serves the authenticated React shell at `/aus/`. Its Pages Function forwards
`/aus/api/*` through the service binding **`AUS_APP` → existing Worker
`immi-arash-amir`**, production environment. Add this binding in Cloudflare:
Workers & Pages → gerami-website → Settings → Bindings → Add → Service binding.
Configure Production and, if testing preview deployments, Preview separately;
redeploy after adding the binding. Do not create a replacement Worker, D1 database,
Supabase project or encryption key. Missing binding returns 503, never demo data.

The build's `_routes.json` must include only `/aus/api/*` and `/aus/supabase/*`;
root `/api/*` belongs to existing IntMed routing and must remain untouched.

The gateway preserves bearer authentication and all owner/profile parameters;
the existing Worker verifies tokens, approved membership and private ownership.
Writes require the browser's exact public Origin before translation to the fixed
Worker origin. Responses use `Cache-Control: no-store`. There are no gateway
credentials or request/response logs. The dedicated AUS Supabase project is
`waxpjylnvwqdlktayyww`, never the IntMed project.

Public config points login traffic to `/aus/supabase`. This proxy permits only
POST token (password/refresh_token), signup and logout. Signup's `redirect_to`
must equal the current public origin plus `/aus/`; add that exact URL to the
dedicated Supabase Auth redirect allowlist before enabling new email signups.
Existing password login does not need a database/account migration. Signup
still grants no workspace unless the existing private approved-account policy
allows that verified identity. No administrative Auth or REST endpoints are
proxied. Upstream redirects are rejected, not followed with credentials.

## OAuth limitation and safe activation

Existing owner-scoped Google/LinkedIn grants and integration status requests
continue through the existing Worker. They are neither deleted nor reassigned.
New Google start, LinkedIn connect and both callbacks return
`oauth_domain_setup_required` at the Pages address. The existing Worker address
continues to own its current OAuth flow.

The current backend validates callback paths `/api/google/callback` and
`/api/linkedin/callback`, configured origin and `__Host-` browser-state cookies.
Blindly rewriting their URLs to `/aus/api/*` would break browser binding. Do not
rewrite OAuth state, move cookies, change `GOOGLE_TOKEN_KEY`, rotate client
secrets or replace an owner's grants. Activating new connections on the `.ir`
address requires a separately reviewed coordinated backend callback/base-path
change, matching provider redirect registrations, browser-origin state tests,
then a real consent test separately for each doctor. Until then create/reconnect
integrations on the original Worker panel; existing connections remain usable.

Before attaching the main domain, check anonymous denial, each doctor's own
workspace and foreign-profile denial, expiry/logout and existing integration
status on Pages with real accounts. Mock tests (`node --test
scripts/test_aus_gateway.mjs`) do not establish live bindings, RLS or Iranian
network accessibility. A `.ir` domain on Cloudflare does not ensure availability
during international connectivity loss.
