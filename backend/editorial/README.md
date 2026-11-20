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

Unique daily rows and row locks prevent duplicate generation. Default09:00 Tehran,
configurable/disableable in private admin. `tick(true)` is an explicit manual run,
not a way to ignore disabled automatic scheduling. Maximum three automatic attempts
per day; provider quota errors are visible and do not activate another paid model.
Notifications get at most three automatic attempts per saved revision; explicit
admin resend invalidates previous buttons. Status/errors are safe codes, not raw
provider responses. GitHub schedule is best effort, so approval does not promise
instant publication. All publisher checks run before push; unknown/pushed states
remain immutable until live article+cover verification or retry of the same content.

No automatic post is public before doctor approval. Inspect actual first draft and
Telegram receipt on activation. Do not fabricate a doctor approval to test production.
Private upload/revision retention should be reviewed before the storage quota fills;
no patient data or textbook figures are permitted in this workflow.
