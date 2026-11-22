# Editorial backend deployment and operations

Canonical private schema: `schema.sql`. Inspect existing project first; apply as
migration `gerami_editorial_private_drafts_20261120` to existing
`upwbktvnybsjugdegjji`. No new project or billing upgrade. Run local SQL/Edge/API
contracts before applying. Deploy `functions/gerami-editorial/index.ts` and its
relative `core.mjs` together, explicitly **verify_jwt=false** per config.toml.
The handler itself authenticates live app-admin sessions, hashed two-minute cron
capabilities, same-project service callbacks, and signed fixed-workflow GitHub OIDC.
Do not disable its internal authentication or send service secrets to a browser.

Existing project secrets are reused in place: SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY,
GEMINI_API_KEY, optional INTMED_GEMINI_MODEL, TELEGRAM_BOT_TOKEN. Do not copy/export
secret values. Existing IntMed bot callback namespace patch is in its own repository;
its existing verify_jwt=false/webhook secret/menu must be preserved.

After function/UI/approved JPEG artwork are deployed, enable scheduler once:

```sql
select cron.schedule('gerami-editorial-daily','*/5 * * * *',
  'select public.gerami_editorial_tick()');
```

Unique rows per Tehran date and audience prevent duplicate generation. Default 09:00 Tehran,
configurable/disableable in private admin. `tick(true)` is an explicit manual run,
not a way to ignore disabled automatic scheduling. Maximum three automatic attempts
per edition per day; provider quota errors are visible and do not activate another paid model.
Notifications get at most three automatic attempts per saved revision; explicit
admin resend invalidates previous buttons. Status/errors are safe codes, not raw
provider responses. The exact main workflow also polls on its own installation/change to verify OIDC; this bootstrap does not prove scheduled execution. GitHub schedule is best effort, so approval does not promise
instant publication. All publisher checks run before push; unknown/pushed states
remain immutable until live article+cover verification or retry of the same content.

No automatic post is public before doctor approval. Inspect actual first draft and
Telegram receipt on activation. Do not fabricate a doctor approval to test production.
Private upload/revision retention should be reviewed before the storage quota fills;
no patient data or textbook figures are permitted in this workflow.

Live acceptance2026-11-20: existing botv19 and editorial functionv4, daily cron active.
A real private preview and revised plain-language version were delivered. Signed
GitHub main-workflow empty claim succeeded after installing the narrow private
owner boolean helper. Service-role SQL tests must stay realistic: service_role
has no SELECT on auth.users; do not solve that by broadening managed Auth grants.
Language checks allow at most one extra provider rewrite per generation attempt.
Actual doctor approval/public article publication is intentionally not simulated.
Final release receipt is recorded in the repository's annotated release tag.

Telegram controls2026-11-21: also apply `telegram-controls.sql` (including its narrow
mutation/tick fixes), and `operations.sql`; deploy `telegram.mjs` beside index/core.
Keep service-only grants and empty search_path. The bot must deploy its matching
immediate-ack/ForceReply namespace routing patch. Use one-use operation capability
requests for redacted health, resending current previews and empty publisher wake.
No credentials or unpublished previews belong in public Git. Immediate wake reuses
existing server-only INTMED_GITHUB_ACTIONS_TOKEN; it cannot approve or alter a draft.
Only an exact active photo control may approve. Edits require Reply to the current
15-minute prompt plus its session UUID/revision, and invalidate previous approval.


Topic-specific choices2026-11-22: apply `cover-choice.sql` after previous migrations;
deploy index/core/telegram/media/trends/catalog/publication plus taxonomy.json as one
bundle. Private import_covers admits two immutable original/topic-matched JPEGs;
resend_previews backfills pending drafts as new unapproved revisions, preserving
verified old owner JPEG/WebP uploads. Notification attempts have their own nonce;
retirement cannot invalidate a later attempt. Only selected image/current owner/photo/
revision can approve. Publication success requires actual canonical HTML+snapshot and
selected image bytes on the public domain. See the native spec/plan and SEO roadmap.

## Daily public and clinician editions

Deploy the complete gerami-editorial bundle, including clinical.mjs, then apply
daily-audiences.sql after cover-choice.sql. Keep the existing five-minute cron.
At the configured Tehran hour the scheduler enqueues one patients job and one
professional job. It dispatches them individually. Legacy rows default to patients.
A manual tick fills a missing edition for today and preserves existing approvals.

The public edition uses the plain-language editor. The professional edition takes
a whole published IntMed lesson section or three complete consecutive flashcards.
It records the manifest hash, build, Git pin and source item IDs. If a text cannot
fit, the selector tries another complete unit. It uses the same two-cover review
and topic taxonomy. Sources and daily rotation are scoped to the selected audience.
Each edition needs its own Telegram image choice and final approval.
