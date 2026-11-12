# Independent website admin

Open `/admin/`. Decap CMS uses a dedicated GitHub OAuth App and only the configured GitHub owner (default `4mirgr`). It does not use IntMed/AUS sessions, databases or keys. Public pages have no CMS dependencies.

## Production setup
1. Register a GitHub OAuth App for the website. Homepage: `https://drgerami-md.ir`; callback: `https://drgerami-md.ir/api/cms/callback`.
2. Set Cloudflare Pages encrypted secrets `CMS_GITHUB_CLIENT_ID` and `CMS_GITHUB_CLIENT_SECRET`. Optional variables: `CMS_ORIGIN=https://drgerami-md.ir`, `CMS_ADMIN_LOGIN=4mirgr`. Never put the secret in Git, public config or chat.
3. Deploy this branch's reviewed changes using the existing combined build. The output includes `/api/cms/*` function routing and `/admin/config.yml`. No binding or database is needed.
4. Verify real owner login, unauthorized-account rejection, draft creation, preview, image upload, publication and rollback. Preview-domain login deliberately fails unless the origin and CMS backend base URL are configured consistently with a separate OAuth app.

## Editing
The Persian editor manages bilingual biography, CV, public contacts and articles. Each article has title/body in both languages, audience, category, author, publication/review dates, image and HTTPS sources. Bodies are plain text so stored scripts/HTML cannot execute. The generic Decap preview shows content; exact public layout is visible after a branch preview deployment.

Editorial workflow stores unpublished edits in Git branches/PRs. Keep status `draft` until ready; after publishing the workflow, set `published` to make the article visible. Draft article text in a public repository or in a merged JSON file is public information even when hidden from the site: do not use drafts for private patient data. Uploaded media lives in `assets/uploads`. Changes trigger the existing deployment workflow; this implementation does not publish the website automatically from the assistant session.

Public pages read `content/site.json` and `content/articles.json`. The home page shows the latest three published entries; Education provides search, audience filters and expandable full text. Static HTML remains the fallback if content cannot load. Restore an earlier Git commit to undo publication. Existing empty-state contact/CV text is retained until real content is supplied; replace the static fallback text when final content is approved.

## Checks
`node scripts/test_cms_oauth.mjs`
`node scripts/test_personal_site.mjs` (local server on port 4173 and Playwright required)
`python3 scripts/verify.py`
`node scripts/browser-check.mjs`

Production OAuth/login and Decap's external script require real deployment credentials and network access; mocked tests do not establish live authentication.

## Dompet dashboard

`/admin/` is the Persian RTL Dompet dashboard adapted from the user-supplied `dompet-10.rar` reference (Drive file `12uHRUcvT5rqWEA_gVOAzTni4YHdhP7Rz`). It supports day/night themes, a mobile sidebar, real public-file article/CV counts, recent entries, used-image gallery and setup readiness. Empty data stays empty; no finance/demo metrics are carried over.

The existing Decap editor is retained at `/admin/editor.html`, embedded when editing articles/profile/contacts and available separately. It is loaded lazily and retained when navigating to the dashboard so editing state is not destroyed. Authentication and saving remain GitHub-backed; the static dashboard only reads already-public content. Referenced article media is displayed in the dashboard; the complete upload library is managed in the editor's Media dialog. `/api/cms/status` returns only a configuration boolean with `Cache-Control: no-store`, never secret values or session information.

Validation: `node scripts/test_admin.mjs` tests real/empty counts, safe text, theme persistence, navigation, iframe preservation, mobile overflow and menu controls, and non-disclosure of OAuth configuration values.

## OAuth popup recovery

After GitHub validates the state and owner, the callback writes the same `decap-cms-user` GitHub session used by the pinned Decap client. The normal exact-origin/source handshake remains supported. If the browser loses the opener or its reply, the callback opens the standalone editor after 1.2 seconds; existing editors recover through a same-origin storage event. Token storage is the existing Decap browser credential model; nothing is placed in URLs or sent to another origin. Blocked storage with no usable handshake produces an actionable message instead of an endless completion screen.

Regression checks: `node scripts/test_cms_completion.mjs` tests completion without an opener. `node scripts/test_cms_session.cjs` verifies the real pinned Decap bundle restores the session against mocked GitHub responses (optional `DECAP_BUNDLE` selects a local copy of that same bundle). Real GitHub consent and the user's browser login still require user interaction.
