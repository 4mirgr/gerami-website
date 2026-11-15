# Shared patient portal implementation plan

Spec: docs/superpowers/specs/2026-11-15-shared-patient-portal-design.md
Execution: native, as authorized by the owner's instructions to proceed without repeated confirmation. One fresh whole-change review after both repositories' tests.

Global constraints: preserve existing templates/themes/languages and independent IntMed/AUS; single Clinic patient authority; no real patient data, account seeding, emails, billing changes or deployment claims without live evidence. No worktrees in Clinic per AGENTS.md. Keep server role/CSRF/private-file checks. Baselines: website 24b35f3, Clinic e1f6dd6.

Review focus: cross-patient IDOR and account linking; self-elevation or forged owner assertions; CSRF/cookie proxy boundaries; consent revocation and sensitive search terms; attachment validation, private caching and absent-upstream failure.

## Task 1 — canonical Clinic patients
Interfaces: /dash/api/portal/{session,signup,login,logout,profile,password,recovery,privacy,activity,documents}; document UUID downloads; /dash/portal/; signed website-owner directory management. DTOs match website safe user/capabilities shape; sessions are HttpOnly root-path cookies; browser mutations retain Django CSRF. PortalAccount uses UUID, one-to-one Django user and optional explicitly owned Patient. No implicit record matching. SiteActivity is consent-gated, bounded and retained 90 days.
- [ ] Write/run failing Django tests for signup/CSRF, shared session, roles, own profile/file isolation, file rejection, activity opt-in/revoke/delete, forged assertions and suspension.
- [ ] Add models/migration and API/services; native patient UI; manager read-only submitted history and consented activity.
- [ ] Run complete Django suite, migration drift, browser checks and Node proxy tests. Update Clinic PROJECT_HANDOFF and commit.

## Task 2 — same-origin website bridge
Interfaces: fixed Clinic HTTPS origin + CLINIC_PROXY_KEY; request-size bounds, only same-origin JSON/multipart; preserve root session/CSRF cookies, no private caching; signed owner claims bound to timestamp/method/path/body. /dash/ proxy uses Clinic's own authority when configured. New website patient signup/login/profile/document/activity use Clinic only; owner/AUS endpoints stay local.
- [ ] Write/run failing proxy tests for absent/malformed origin, leaked/forged headers, redirects, cookies, upstream failure and bound bodies.
- [ ] Implement bridge and canonical account dispatch; retire public D1 signup fallback. Adapt existing tests to the new authority, keeping private/owner regressions.
- [ ] Run API/proxy and boundary suites; commit.

## Task 3 — header and shared patient UI
Interfaces: shared frontend account API/CSRF client; modal login/signup + full-page fallback; /account/#medical, #activity, #privacy; consented background search/article events.
- [ ] Add failing browser tests for in-place modal login/signup, Escape/focus/mobile, session refresh and private uploads/consent/history on the real local Clinic backend through the bridge.
- [ ] Implement UI and bounded event recording; keep incomplete fields and errors, no secrets in persistent browser storage.
- [ ] Run website and Clinic browser regressions; commit.

## Task 4 — verification and delivery
- [ ] Run whole website browser suite and fresh combined build, full Django/migration/Node/browser suite. Verify source pins unchanged and no sensitive files staged.
- [ ] One independent fresh review across both change ranges; fix Important/Critical findings once using failing regressions and green suites.
- [ ] Push both branches/PRs and persist the shared API/deployment contract and real remaining host/quota blockers. Amend the existing conditional release automation so it cannot publish the superseded account model or an unconnected Clinic.
- [ ] Deploy only when the actual Clinic host/PostgreSQL/private persistent storage and secrets are configured and real isolated-preview smoke succeeds; otherwise deliver concrete tested changes with an explicit activation blocker.
