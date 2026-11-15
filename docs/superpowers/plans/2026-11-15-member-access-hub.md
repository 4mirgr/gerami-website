# Member access and private application hub implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add public login/signup, an owner administration hub and website user management, protect the unfinished clinic entry, and make the AUS application private to its existing two identities.

**Architecture:** Website accounts and opaque sessions live in a new, dedicated Cloudflare D1 database. Use native Node crypto password derivation, HttpOnly Secure host cookies, strict request origins, prepared SQL, bounded bodies, rate limits and server-side roles. The existing verified GitHub owner can establish an owner session. AUS identities are verified through their existing backend, then receive a separate edge session; no IntMed/AUS credentials, schemas or account pools are migrated.

**Tech Stack:** Existing static bilingual Enfhess/Dompet/Vazirmatn UI; Cloudflare Pages Functions; native Node crypto; D1 SQLite; existing GitHub OAuth and AUS service binding.

**Spec:** The owner's 2026-11-15 message requesting header login/signup, an administration directory including /dash, user management, and private AUS access.

## Global constraints

- Preserve current selected templates, light/dark, Persian/English and local Vazirmatn.
- Keep upstream repositories, sources, pins, mounts, accounts, data and sessions independent.
- No patient records are handled here; /dash is an authenticated, honest work-in-progress entry.
- Do not grant privileges from self-declared names/emails. Only verified GitHub owner proof establishes owner, and only existing AUS subjects can establish private access.
- Never return password hashes, session tokens, backend secrets or user directories in public responses/assets/Git content.
- Do not send email or messages. Recovery requests and owner-created one-use reset links are explicit UI actions; no fake email-delivery claim.
- Existing website builds remain the deployment path. No force pushes or bypassed verification.

## Review focus

- Self-registration/profile updates must never elevate roles or grant AUS/clinic access.
- Expired, revoked or suspended accounts must lose access even with an existing cookie.
- Private URLs/assets/API must fail closed, including Pages previews, trailing paths and unauthenticated navigation.
- Failed sign-in/recovery must avoid identity enumeration, abusive repeated work and secret logging.
- Public templates, content/customization and automatic builds must not reintroduce private project links/cards.

### Task 1: Website identity and management API

**Files:** server/identity/{crypto,db,accounts,private-access}.mjs; functions/api/account/[[route]].js; deploy/migrations/0001_website_identity.sql; scripts/test_website_identity.mjs.
**Interfaces:** GET session returns safe user/private profile and derived capabilities; POST signup/login/logout/profile/password/recovery/github/private-login/private-session; privileged paginated user listing, role/status editing, session revocation and reset-link creation.

- [ ] Write security/permission, password/session, concurrency and SQLite integration tests.
- [ ] Implement dedicated schema, standard salted password hashing, opaque hashed sessions, request validation and role checks.
- [ ] Preserve incomplete/failed UI actions without exposing passwords or granting authority from email.
- [ ] Provision separate production/preview D1 databases and additive binding configuration, preserving existing secrets/services.

### Task 2: Account UI and admin directory

**Files:** account/index.html; account/account.mjs; account/account.css; js/account-menu.mjs; all public header templates; admin/index.html; dash/index.html; public customization model/content.
**Interfaces:** Public header shows login/signup or the authenticated account panel. Owner hub includes public sections, Site Studio, IntMed, users, clinic /dash and private workspace. Normal members cannot see privileged/private destinations.

- [ ] Add browser tests for mobile/bilingual/theme header, signup/login, role-specific hub, user filtering/editing and protected actions.
- [ ] Implement accessible forms, safe text rendering, honest unverified-email state, current-password changes and one-time recovery UI.
- [ ] Link existing CMS GitHub session to server-verified owner session; add user management/hub entry to Site Studio.
- [ ] Add authenticated /dash placeholder without inventing a functioning clinic or patient data.

### Task 3: Private AUS boundary and public removal

**Files:** functions/_middleware.js; server/identity/private-access.mjs; scripts/build_cloudflare.py; scripts/aus_frontend_adapter.py; js/deck.js; public templates/JSON; scripts/verify*.py; existing browser/gateway/health tests.
**Interfaces:** Every /aus and /aus/* request is protected before static/API handling. Existing two identities keep their own native login/session. Private login can reuse their existing session; no broader user/admin role can grant access to a third AUS identity.

- [ ] Test unauthenticated/private/member/owner/disabled/expired paths, assets, APIs, invalid origins, wrong issuer/subject and old public links.
- [ ] Remove AUS cards, buttons, descriptions and destinations from public pages and prevent public navigation/custom-page links to private routes.
- [ ] Keep the actual pinned AUS frontend build and backend binding; add only a reviewed access-session bridge if native-session refresh requires it.
- [ ] Adapt old two-public-project expectations to one public IntMed entry plus private AUS gate; never remove independent-app validation.

### Task 4: Verify and publish

- [ ] Run meaningful native-runtime/SQLite tests, complete browser suite, a fresh combined build and independent code review.
- [ ] Exercise preview deployment against an isolated preview identity database; never seed fake production users or use production patients.
- [ ] Publish through reviewed GitHub changes and existing Cloudflare integration.
- [ ] Verify live header/account endpoints, anonymous private denial, public absence of AUS, and preserved IntMed/native backend boundaries.
