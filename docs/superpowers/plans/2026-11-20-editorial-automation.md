# Editorial automation implementation

- [x] Read existing private queue, bot and website contracts; compare live bot.
- [x] Add pure editorial validation/source/approval helpers and meaningful tests.
- [x] Add private SQL schema, atomic queue/revision/approval transitions and cron.
- [x] Add authenticated editorial Edge API using existing Gemini and Telegram.
- [x] Add same-origin website proxy and private admin inbox with image editing.
- [x] Extend existing bot only with namespaced website callbacks; regression test.
- [x] Add approved-content OIDC publisher, safe Git workflow and deployment receipt.
- [x] Add public tag/hashtag support and bounded populated homepage snapshots.
- [ ] Run complete source and assembled checks; obtain independent code review.
- [ ] Commit/push PRs, apply reviewed migration/functions, merge after CI and verify.
- [ ] Produce first private draft notification; report owner actions and exact state.

Primary paths: backend/editorial/schema.sql,
backend/editorial/functions/gerami-editorial/{index.ts,core.mjs},
functions/api/editorial/[[path]].js, admin/editorial.mjs,
scripts/editorial-publisher.mjs, .github/workflows/editorial-publish.yml,
scripts/test_editorial.mjs. IntMed patch belongs in its separate repository.
