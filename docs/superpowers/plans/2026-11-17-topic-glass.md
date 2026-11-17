# Topic-first glass website implementation plan

> Execute inline with superpowers:executing-plans, then one fresh whole-branch review.

**Goal:** Strong refractive glass, a persistent floating header, and an editable internal-medicine topic-first reading experience.
**Architecture:** Keep the existing static build, shared schema validator and Git-backed Studio. Add one managed topic catalog, shared tree helpers, public topic navigation/filtering/pagination and a matching editor. No runtime dependencies.
**Spec:** `docs/topic-glass-2026-11-17.md`

## Global constraints

Keep FA/EN/RTL/day/night, local font/single logo, opaque fallback, real protected admin, existing article drafts/legacy categories, independent apps and patient/hosting pause. No medical claims/posts or secrets changed. Existing owner section IDs remain stable, but their labels and homepage roles may change with the explicitly authorized structure change.

## Review focus

- Deleted/reparented/relabelled topics with article references must remain consistent before publication.
- Sticky header with large text, open nested menus and keyboard anchor focus must remain usable.
- Empty catalog, empty/draft-only archive and malformed query parameters must retain honest fallbacks.
- Parent/child filters, audience/hash, search and page controls must compose and survive reload/language changes.
- Glass must show actual blurred artwork while remaining readable in both themes and without filter support.

## Task 1 — managed topic catalog and editor

Files: content/topics.json; js/topics.mjs; js/site-model.mjs; admin/studio.mjs; admin/index.html; preview dispatch; scripts/test_topics.mjs.
Interface: topics tree nodes {id,fa,en,description_fa,description_en,icon,children}; max depth2/max100 total; flattenTopics returns ancestors/path labels; topic article reference optional. validateSite rejects missing references. Managed topics use existing atomic Git publication.
- [x] Write schema/reference tests; observe RED on missing managed document.
- [x] Implement catalog validation, tree helpers and 12 educational branches with subtopics.
- [x] Add Studio topic editing/order/children, guarded deletion and article selection. Include topic data in preview messages.
- [x] Run catalog tests and existing Studio unit tests, then commit.

## Task 2 — topic-first public reading

Files: index.html; pages/blog.html; content/pages/{home,blog}.json; content/appearance.json; js/content.js; new browser regression.
- [x] Write a browser test for topic links/parent-child filtering/query reload/pagination with synthetic posts; observe RED.
- [x] Render topic carousel/directory from catalog; compose search/topic/audience filters in shareable URLs, 12-per-page archive and 6 latest home posts.
- [x] Preserve published-only display, Markdown/source/image safety, legacy categories, audience links and CMS section/text controls.
- [x] Test 27 synthetic records, drafts excluded, no-result/unknown-topic states, browser history and Studio preview editing. Commit.

## Task 3 — deep glass and persistent floating navigation

Files: css/glass.css; js/main.js; js/site-customizer.mjs; scripts/site_studio.py; browser regressions; report.
- [x] Observe RED for header position after real scroll, open menu bounds and anchor clearance.
- [x] Add global themed art, translucent blur surfaces, lit bevel edges and sticky inset header with compact mobile row and correctly anchored full-width menu. Measure actual header clearance.
- [x] Inspect fresh light/dark desktop/mobile screenshots against ZIP. Verify keyboard/swipe/RTL, reduced motion, no-filter/no-JS and no overlap.
- [ ] Run full browser suite and fresh combined build. Fresh independent review; fix important findings with RED→GREEN, then exact-head CI and Git deploy. Verify canonical domain and update report.
