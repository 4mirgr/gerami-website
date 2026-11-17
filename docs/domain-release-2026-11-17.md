# Main-domain visual release

The owner reports that the separate `chatgpt.site` address is blocked across
their networks and requests the latest design on `drgerami-md.ir`. The Sites
project is active/public, but its shared-domain Cloudflare firewall is outside
the owner's Cloudflare zone. This release publishes through the existing
GitHub → Cloudflare Pages integration; the primary domain does not depend on
the blocked Sites hostname. DNS, mail, existing Worker bindings and backend
accounts remain unchanged.

Port the reviewed Sites visual/content state `38e31fc` onto current production
main `f21c8a6`, preserving its bounded public-data hydration and inline theme
bootstrap. Include the supplied medical badges, distinct pastel overlays,
forest/mint day/night palette, generated control icons, final bilingual copy,
topic changes and mouse/touch carousel controls. The IntMed feature overview
is now a managed text block and is preserved by the assembly adapter.

Native Sites authentication is unavailable on the separate Pages origin.
The header instead uses `/admin/login.html` and the existing server-verified
CMS session, with the honest label “Admin sign in.” The exact verified owner
may see their name and sign out. It grants no patient/clinical role, and it
does not enable patient signup, records, uploads or booking.

Before production: complete `scripts/check_site.py --browser`, a fresh combined
`scripts/build_cloudflare.py`, exact-head CI and preview inspection. The account
regression tests synthetic anonymous/verified sessions, forged browser claims,
language changes and failed/successful logout. Production is updated only by
the existing Git deployment, followed by fresh domain/content/auth probes and
targeted cache invalidation if needed.
