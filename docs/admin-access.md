# Independent administrator entry — 2026-11-16

Owner request: block public entry to `/admin` and `/dash`, publish completed increments for review, preserve the site/Clinic architecture and zero-payment constraint. This release is deliberately based on production main, separately from PR7's still-unconnected shared patient portal. It does not deploy patient registration, medical records or a Django runtime.

## Access contract

- Pages middleware runs before protected HTML, scripts and CMS configuration. Anonymous HTML navigation redirects to `/admin/login.html`; other protected requests receive 401. Encoded, mixed-case and slash aliases cannot bypass the gate. Only the exact login page/assets and shared provider helper are public under `/admin`.
- The public entry uses the existing dedicated GitHub OAuth app. Callback state/origin checks remain. The server verifies numeric GitHub owner `208800626`, login `4mirgr` and push permission on `4mirgr/gerami-website`; browser/localStorage role claims are insufficient.
- A 30-minute, origin-bound HMAC cookie unlocks the CMS shell. It is Secure/HttpOnly/SameSite=Lax, contains only signed owner/time/audience metadata and uses a domain-separated key from the existing CMS secret. No new secret, database, external identity service or billing activation is introduced. The provider bearer token is not placed in this cookie.
- This is a short-lived stateless entry cookie, not a replacement for existing GitHub write authorization or Clinic sessions. Logout clears this browser's entry cookie and local editor token. A previously copied cookie remains valid until expiry; this stage does not claim centralized/global cookie revocation. GitHub authorization can be revoked at GitHub, and the native Clinic session/medical roles remain separate.
- The existing single GitHub connection control signs out of the entry gate too. A failed server logout is reported rather than claiming confirmed server logout. Provider API failures deny entry. No default password or fabricated owner/staff account exists.
- `/dash/` in this independent release is an owner-only status page explaining that the actual Clinic backend is not connected. The CMS cookie grants no manager/secretary/patient role and must never substitute for Django's authorization. When merging this change into PR7, retain native Clinic authentication for its staff/patient/API routes; do not put the CMS shell gate in front of the shared patient portal.
- Existing layout, logo assets, local Vazirmatn, IntMed/AUS gateways and data are preserved. The new entry supports Persian/English, light/dark, keyboard focus and mobile. All-path function routing protects aliases; monitor the existing free account's request allowance without enabling billing/upgrades.

## Release and validation

Node22 tests reproduce the formerly public admin document and verify redirects, protected configuration, exact provider identity, missing permission, forged/expired/wrong-origin cookies, CSRF and logout headers. A real local HTTP/Chromium flow verifies anonymous/mobile entry, font/language/theme, server rejection of a forged browser identity, accepted signed cookie and browser logout. External GitHub replies in automated tests are synthetic; the test does not sign in as the real owner.

Run the full `python3 scripts/check_site.py --browser` and a fresh combined `build_cloudflare.py` before publishing. Read-only production health expects login redirects, never public editor HTML. Require exact-head CI and inspect the deployed preview, then merge only this independent increment with expected-head protection. Verify the real domain anonymously after Git deployment. Owner completes real GitHub consent themselves; do not claim actual owner sign-in from synthetic fixtures.

Source review found no Critical/Important issues. Three Minor findings were fixed with regressions: retryable logout and immediate iframe removal, persistent existing language/theme preference keys, and strict HTTPS origin validation in the production redirect probe. A language toggle resetting the live login status was also reproduced and corrected. Initial full Node22 browser checks and fresh combined build passed before these small fixes; final checks and deployment evidence are recorded in the pull request.

Shared Clinic/Neon/Render setup remains governed by Clinic `docs/ZERO_COST.md` and the PR7 activation gate. No production patient migration, email, Google action, DNS, D1/Supabase change or spending is part of this entry patch.
