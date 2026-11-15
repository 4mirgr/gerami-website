# Shared patient accounts and independent private identities

The website and Clinic use the same patient account/record authority: the Django application in `4mirgr/Clinic`, its dedicated PostgreSQL database and private document storage. A website signup never creates a second D1 patient account. IntMed and AUS accounts, backends, data and repositories remain independent.

## Patient entry and records

Public header sign-in/signup opens a same-origin modal without leaving the article. The links still work as a standalone `/account/` page. An embedded frame may only notify its verified same-origin parent; the parent rechecks the server session before showing an authenticated header. Credentials never enter persistent browser storage. Both themes/languages, local Vazirmatn, keyboard Escape and focus return are preserved.

`/account/` and native `/dash/portal/` read/write the same Clinic session/profile/documents. Complete names/phone create an explicitly owned new Patient record; never infer ownership of an existing clinical record from self-declared phone/email/national ID. Clinician notes remain distinct from patient-reported history/medications/allergies. Website account management never grants clinical staff groups or medical-record authority.

Medical documents remain in Clinic's existing private storage/model. Patient uploads are format-validated PDF/JPEG/PNG, at most 5 MiB and 100 documents per patient, with random paths and authenticated attachment-only downloads. The secretary and unrelated patients cannot download them. Format validation is not a malware-scanning claim; carry the Clinic handoff's operational requirements into its real deployment.

Activity tracking is initially off. Saving bounded search/article-opening events and sharing them with the clinician require separate explicit consent. Turning tracking off erases existing history and sharing; users can also erase history separately. Article events require eight visible seconds and describe opening, not proof of completed reading. Obvious contact identifiers/URLs are suppressed; no medical diagnoses are inferred. Recent events/topics are available in the patient account and to clinical managers only when sharing is enabled. Configure Clinic's `purge_portal_activity` job for inactive accounts' expired events.

## Same-origin bridge

`server/identity/clinic-bridge.mjs` uses a fixed HTTPS `CLINIC_ORIGIN` plus secret `CLINIC_PROXY_KEY`, or a trusted `CLINIC_APP` service binding with that key. It filters incoming cookies and headers, removes client owner claims/Authorization, bounds JSON/multipart requests, checks same-origin mutation requests, forwards Django CSRF, does not follow authentication redirects, and prevents private caching. File-upload authorization is checked before buffering the upload. Sensitive path validation applies to the pathname, preserving encoded Persian queries and OAuth parameters.

The API `/api/account/` delegates patient signup/login/profile/password/recovery/documents/privacy/activity and directory management to `/dash/api/portal/`. `patient-profile` maps specifically to Clinic profile, including when a separate website owner cookie also exists. New patient registration fails closed when Clinic is absent; there is no D1 fallback. `/dash/*` proxies to the real Clinic when configured, preserving its own staff/patient authorization. Without that connection, the existing owner-only work-in-progress entry remains honest.

Production Clinic session: `__Host-gerami-clinic; Path=/; Secure; HttpOnly; SameSite=Lax`; root CSRF cookie. Website and native clinic share it. Password changes/resets and account generations invalidate prior access; model writes recheck active status, generation and session hash under consistent row locks. Anonymous session responses may bootstrap CSRF but never return other users' profiles.

Only a server-verified GitHub website owner can create the short-lived HMAC assertion for account-management mutations. It binds timestamp, method, complete downstream path/query and body hash; no browser token or self-declared role grants it. Signed mutations still require native Django CSRF. This assertion does not grant medical-file access. Verified co-admins/clinic managers can read the user directory; clinical staff accounts remain protected.

## Separate website owner and AUS gate

The original `WEBSITE_DB` and `WEBSITE_PEPPER` are retained for the exact GitHub owner (`4mirgr`, numeric ID `208800626`, repository push permission) and opaque private-access sessions, not new patients. Dedicated production/preview D1 stores and migrations `0001_website_identity.sql` / `0002_auth_generation.sql` remain. Old internal D1-password migration regressions are retained separately; those signup/login routes are no longer publicly selected. No active patient data was migrated or fabricated.

Existing CMS GitHub secrets and `AUS_APP` binding remain unchanged. Public AUS cards/links remain removed. The all-path Pages middleware protects AUS static files and APIs, including encoded aliases; website members/co-admins cannot grant that access. Only the verified owner or the exact two configured existing native AUS subjects can enter. Native credentials stay native, with the bounded one-use handoff and verified password/refresh brokers outside the gate. IntMed/AUS account pools never merge with Clinic.

## Tests, source pin and release gate

`python3 scripts/check_site.py --browser` includes real workerd/D1 boundary tests and a real Django + Worker browser flow: header signup, shared private records, edits from both interfaces, consent/history/erasure, user management, mobile and Escape. `deploy/clinic-contract.json` pins the reviewed Clinic checkout used by CI; it is test input, not a Django deployment or automatic migration. Local active development can set `CLINIC_SOURCE` and `CLINIC_PYTHON`; default checks create an isolated temporary checkout/venv/database/storage and remove them afterward. No production credentials, users, records or recovery emails are tested.

A fresh `scripts/build_cloudflare.py --output <fresh-path>` still validates both pinned independent applications and their unchanged source boundaries. It never copies the Clinic backend, database, medical volume or secrets into public assets. Existing automatic maintenance changes only its explicitly permitted pins/development patches, not medical schemas/content/identity configuration.

Activation remains blocked by the missing permanent Clinic Python/Docker host, dedicated PostgreSQL, persistent private storage and paired secrets. Follow Clinic's `docs/SHARED_PORTAL.md`, including TLS, private backups/restore, migrations, static collection and retention job. Preview must use its own host/database/storage/secrets and must never point to production patient data. Cloudflare R2 was not enabled and billing was not changed. The earlier D1 quota error also prevented live owner/private authentication smoke; do not claim live activation until the real endpoints pass. Both new D1 stores had zero users at the initial checkpoint.

The scheduled conditional release was amended to require this shared Clinic architecture. It must not publish the superseded independent D1 patient-registration implementation. Wait for real HTTPS signup → website profile/upload → native clinic → native edit → website read, logout/revocation and cross-patient/secretary checks before merging/publishing the dependent website change. The native clinic remains unfinished in appointment/patient communication and other existing roadmap areas; no completed clinical system is claimed.
