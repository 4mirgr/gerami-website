# Editorial image choice, taxonomy and SEO implementation plan

> Native execution in this session; use executing-plans task by task and a fresh final code reviewer.

**Goal:** Deliver every current draft with two topic-specific cover options, exact IntMed hierarchy and Harrison2025, and make approved content indexable.
**Architecture:** Private PostgreSQL cover library/options and atomic revision-bound selection extend the existing Edge bot. A pinned public taxonomy supports static topic/article generation; daily bounded public trend signals rank eligible source topics.
**Tech stack:** Existing JavaScript/Deno, PostgreSQL, Python static build, Telegram and GitHub OIDC.
**Spec:** `docs/superpowers/specs/2026-11-22-editorial-image-choice-topics-seo-design.md`.

## Constraints and review focus

- Preserve service-only RLS, live owner/chat checks, prompt/session binding and immutable approval; no public draft assets.
- Preserve172032 raw/57344 gzip source and28000 gzip root budgets, carrier recovery and independent IntMed/AUS/Clinic/Auth.
- Replaced choice buttons, simultaneous edits/selections and missing media must fail closed.
- Trend/feed/network failures must not block daily generation or introduce unsupported medical claims.
- Existing topic IDs and multiple articles in one child must survive; empty pages/drafts must not be indexed.

## Task1: Pinned taxonomy and static SEO

Files: `content/intmed-taxonomy.json`, `backend/editorial/functions/gerami-editorial/catalog.mjs`, `scripts/editorial-publisher.mjs`, `scripts/editorial_seo.py`, `scripts/site_studio.py`, `js/content.js`.
Interfaces: sourceTopic(sourceId) returns exact root/child metadata; articlePath(article) returns a unique nested URL; ensureArticleTopic(documents,taxonomy) adds only missing publication nodes.
- [ ] Test full pinned taxonomy, preserved aliases, missing-source denial, repeat articles, canonical/OG/JSON-LD/sitemap and no draft/empty-topic indexing.
- [ ] Implement source-to-child mapping and publisher admission; render complete static directory and article pages.
- [ ] Test built relative assets, real article links and unchanged first-paint/recovery budgets; commit.

## Task2: Private candidate media and owner selection

Files: `backend/editorial/cover-choice.sql`, `functions/gerami-editorial/{media,telegram,index,core}.mjs|ts`, `admin/editorial.mjs`, focused PostgreSQL/Telegram tests.
Interfaces: options(draft) yields two private candidate objects; select_cover binds active photo/revision/owner; notify sends two photos/full text and only arms approval for selected bytes.
- [ ] Test no approval without selected cover; wrong owner/revision/photo; selection/edit invalidation; failed partial delivery; custom image and retries.
- [ ] Implement service-only library/option ledger and one-use operations ingest; preserve storage byte limits and hashed media publication.
- [ ] Prepare six original topic-specific images privately, validate them and import only after reviewed deployment; commit code/tests.

## Task3: Background topic selection and editorial metadata

Files: `functions/gerami-editorial/trends.mjs`, generation integration, admin status, `docs/seo-editorial-2026-11-22.md`.
Interfaces: rankTopics(eligible,recent,signals,now) deterministically ranks topic IDs with freshness/cooldown; all public references show exactly Harrison2025.
- [ ] Test feed failure/staleness/unrelated trends, repeated source after cooldown and unchanged source integrity.
- [ ] Implement bounded public feed snapshot, honest provenance/fallback and repeat-angle material; document GSC owner connection and SEO backlog.

## Task4: Coherent release and real re-delivery

- [ ] Run focused SQL/Edge/publisher/SEO tests, complete source/browser profile, fresh pinned assembled build and artifact performance/recovery suite.
- [ ] Obtain fresh code review; PR/CI/exact-head merge; attach every PR and verify production.
- [ ] Apply tested migrations, deploy the reviewed function bundle, import private image pairs and migrate all existing drafts as new revisions without approval.
- [ ] Send all pending pairs via the existing bot; inspect redacted real delivery/state receipts; update handoff/checklist/release evidence.
