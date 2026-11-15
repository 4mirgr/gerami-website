# Website accounts and private application access

The website now has a separate identity service in Pages Functions and dedicated D1 databases: `gerami-website-identity` (production) and `gerami-website-identity-preview` (previews). The schema is `deploy/migrations/0001_website_identity.sql`. These stores contain website profiles, salted password hashes, opaque session hashes, recovery requests, expiring reset-token hashes, rate buckets and management audit events. They do not contain patient data or copy IntMed/AUS account pools.

Bindings: `WEBSITE_DB`, secret `WEBSITE_PEPPER`, secret `AUS_ALLOWED_SUBJECTS`. Both environments use separate databases and peppers. The existing production `CMS_GITHUB_CLIENT_ID`, `CMS_GITHUB_CLIENT_SECRET` and `AUS_APP` service binding are preserved. The private subject map was configured from the two existing verified AUS memberships; it is not published in source or public configuration. Do not rotate the password pepper during routine deployments: existing hashes depend on it. Secrets never appear in browser responses.

## Entry points and authority

- Public header: login/signup at `/account/`.
- Ordinary members: their own website profile/password; public education and IntMed entry. Their email is explicitly marked unverified. Self-entered name/email never grants authority.
- Website owner: the existing GitHub identity `4mirgr` / numeric user `208800626`, verified server-side with repository write permission. Existing CMS sign-in can establish the website owner session without another credential. It remains the CMS publishing account, not an IntMed/AUS login.
- Owner hub: all website pages, Site Studio, user directory, IntMed, authenticated clinic entry `/dash/`, and the private workspace `/aus/`.
- Co-administrators: directory read access and clinic entry. Only the owner can change user roles/status, revoke other users' sessions or create reset links. Owner identity is protected from those operations.
- `/dash/` is an authenticated, clearly labeled work-in-progress page. It is not a completed patient-management system. A future clinic application must still enforce its own patient-data authority.

Website password authentication uses native `node:crypto` scrypt (`N=32768`, `r=8`, `p=3`, 16-byte random salt, 64-byte derived key) with a separate HMAC pepper. Session values have 256 bits of randomness, are stored only as SHA-256 hashes, and use Secure, HttpOnly, SameSite=Lax host cookies. Website sessions last at most 24 hours; every protected request rechecks active user status and current role. Role/status changes revoke sessions. Password changes and successful resets revoke prior sessions and reset tokens. Mutation endpoints require same-origin JSON and bounded bodies; authentication/recovery actions have IP and identity rate limits.

## Private AUS boundary

`functions/_middleware.js` protects navigation, static assets and APIs under `/aus` and `/aus/*`, plus `/dash` and build metadata. All paths pass Functions (`_routes.json` uses `/*`) so encoded private-route aliases cannot bypass the gate. Private responses are not cached or indexed. The original AUS Worker still independently verifies its own signed Supabase token and membership for its APIs.

AUS edge access requires the verified website owner or a separate private session for one of the exact two existing AUS subjects. A website member/co-admin cannot grant that capability to themselves or someone else. The private login broker calls only the existing AUS identity provider and Worker `/api/me`. The native session is transferred once through a bounded, 60-second `sessionStorage` handoff, removed before use and verified again by the native application. It never becomes a website role or a persistent website credential. An isolated build-copy bridge updates the edge session on native login/renewal and clears it after native logout; upstream source files remain unchanged.

Public cards, metadata and CMS links no longer advertise AUS. Public content/navigation URL validation rejects private workspace and clinic paths, including encoded spellings. The private app still uses its original accounts and data. Its existing password-recovery provider is available through a rate-limited broker; no real recovery emails are sent by automated tests.

## Account recovery

Public website recovery requests are recorded for the owner. After checking the claimant's identity, the owner can create a one-use, 15-minute reset link from user management. The UI explicitly says that no website email was sent. Reset secrets are in the link fragment and are stored as hashes server-side. Private AUS recovery uses its already configured identity provider when a person explicitly requests that action.

## Verification and operation

`python3 scripts/check_site.py --browser` includes real workerd/D1 identity tests, private subject and role isolation tests, browser signup/login/profile/admin flows, mobile/language/theme checks and public-link checks. Provider calls in these tests are mocked; production credentials and patient records are never used. A fresh `scripts/build_cloudflare.py --output <new-path>` also runs existing upstream gates and verifies unchanged source checkouts and protected route configuration.

Preview smoke tests must use the isolated preview store and remove their temporary users afterward. Never seed production users or impersonate the real owner for a test. Production health now expects anonymous AUS navigation to redirect to private sign-in and anonymous API access to return 401, rather than expecting a public app shell.

Deployments do not erase the account database. Apply only reviewed additive migrations, preserving secrets and bindings. Keep the private edge gate when rolling back UI changes; reverting to a pre-gate release would restore public delivery of the app shell. Automatic upstream updates continue through the existing tested, fixed-branch commit-pin workflow and cannot change identities or the allowlist.
