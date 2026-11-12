# Personal Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver day/night identity and an independent content management implementation.

**Architecture:** Static HTML with optional local JSON rendering. Decap writes content to GitHub; Cloudflare Functions handle its dedicated OAuth handshake.

**Tech Stack:** HTML, CSS, browser JavaScript, Decap CMS, Cloudflare Pages Functions.

**Spec:** ../specs/2026-11-11-personal-site-design.md

## Global Constraints
Preserve IntMed/AUS accounts and routes. No invented credentials or articles. Bilingual and responsive. No third-party assets on public pages.

## Review Focus
Blocked storage must not break themes. Drafts must remain hidden. HTML in content must render as text. OAuth rejects invalid origin/state/account. Build must include CMS routes/config without expanding upstream public file types.

### Task 1: Identity and themes
Files: assets/*, all public HTML, css/style.css, js/theme.js.
- [x] Copy original supplied artwork; export favicon.
- [x] Add pre-paint system/manual theme with safe storage fallback.
- [x] Verify both languages, responsive layout and disabled JavaScript.

### Task 2: Content and admin
Files: admin/*, content/*.json, js/content.js.
- [x] Configure editorial workflow, CV/contact, image upload, article audience/category/sources/dates.
- [x] Render published entries safely; add search/audience filter and recent writing.
- [x] Test drafts, language updates, search and unsafe source URLs.

### Task 3: Independent OAuth and delivery
Files: functions/api/cms/*, scripts/build_cloudflare.py, scripts/test_cms_oauth.mjs, docs/admin.md.
- [x] Test missing setup, invalid state/origin, unauthorized account and success.
- [x] Implement OAuth with HttpOnly state cookie and exact-origin messaging.
- [x] Include admin/content/assets and CMS API routes in assembled output.
- [ ] Configure production OAuth credentials and verify real login/publish on the domain.
