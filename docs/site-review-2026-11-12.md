# Website review and automatic maintenance — 2026-11-12

## Reference and invariants

Applied the user-supplied `CODEX-EXTENDED-LIBRARY.md` selection process. It is a catalog, not a framework migration instruction. The two selected guides were:

- Code reviewer: https://github.com/alirezarezvani/claude-skills/blob/9ca476d8401f8750f92f4a7b31ec68efaa61ab02/engineering-team/skills/code-reviewer/SKILL.md (including its universal and JavaScript rules).
- GitHub Actions: https://github.com/sickn33/agentic-awesome-skills/blob/00f9c4077878be6ffcc093c099f05a6cccaf1b95/skills/github-actions/SKILL.md.

Keep Enfhess, Dompet, local Vazirmatn, one logo per identity slot, day/night and Persian/English. IntMed/AUS source repositories, public directories, mount points, accounts, backend services, secrets and data remain independent. No migration, new account, generated CV credential, fabricated article or analytics has been added.

## Findings and fixes

1. The latest AUS pin imported `cloud/evidence-deadline.mjs`, but the approved frontend input allowlist omitted it, causing the combined Vite build to fail. Reviewed that presentation-only module and added precisely that file; no whole cloud directory is copied. Added fixture coverage for its unchanged bytes. The real combined build then passed, including upstream tests and output verification.
2. Latest writing used JSON array position instead of publication date. Sort by date and use the newest three on the homepage. Patient/clinician links now apply the intended filter, including hash changes.
3. CMS-managed contact links did not hydrate all existing public links; biography/CV placeholders could contradict supplied content. Connect the existing safe link validator to profile updates, and hide CV placeholders when real entries exist. Test both with mocked verified profile content.
4. Publication had no public CMS schema gate. Validate bilingual published entries, statuses/audiences, dates, unique slugs, source URLs, local images, public contact fields and immutable integration boundaries. Drafts may remain incomplete. Every Cloudflare build now runs the non-browser website gate before fetching upstreams.
5. OAuth upstream requests had no explicit deadlines. Bound them to 15 seconds; public JSON requests use 10 seconds. Existing fail-closed owner/state/origin checks and popup recovery remain intact.
6. CMS code was version-pinned but lacked resource integrity. Added SRI to the pinned external bundle and a checksum for the test copy.
7. Browser tests depended on a machine-specific Chromium path. Support `CHROMIUM_PATH`; lock development tooling and supply the browser in CI.
8. Styles/scripts could mix browser-cached releases. Build first-party script/stylesheet URLs from their content hashes, and revalidate first-party HTML, content and admin files. Upstream application caches retain their existing scope.

## Automated operation

- Website verification runs on main pushes and pull requests, daily, and manually. It checks static structure/content, JavaScript syntax, security/unit/browser regressions, the real combined build, and keeps screenshots for 7 days.
- Daily/manual production probes are read-only: home, admin/editor, both app entry routes and local font. They do not sign in or send user messages.
- Weekly/manual maintenance (also run when its policy files change) prepares only full upstream commit pins on the already selected branches and patch updates allowed by the existing Playwright range. It validates fast-forward ancestry, runs all website/browser checks and the full combined build before committing. Main movement rejects the push; no force push or test bypass exists.
- IntMed currently uses its existing `claude/quirky-ride-mavb6b` branch; AUS uses `main`. These are explicit, not whichever branch becomes a repository default later.
- Only `deploy/projects.json`, `package.json` and `package-lock.json` may be committed by maintenance. Application source, layout, schema, identities and medical content are outside that automatic change set.
- GitHub Actions use immutable action SHAs, read-only permissions by default, no persisted checkout credentials, and a write token only in the tested-maintenance commit step. Dependabot proposes action updates separately.
- Existing Cloudflare Git integration remains the deployment mechanism. A build failure leaves the last successful deployment active. Content publication still requires the authenticated site owner.

## Validation and practical limits

`python3 scripts/check_site.py --browser` is the reproducible entry point. `--reuse-server` attaches only to a local server for this checkout. `DECAP_BUNDLE` may supply the integrity-checked pinned test bundle. `python3 scripts/build_cloudflare.py --output <fresh-directory>` runs upstream gates and checks the assembled artifact.

Production CV/contact/article data is currently empty. The admin can populate it; no data has been invented. Browser OAuth tests use mock GitHub responses and do not prove a real end-to-end owner consent/save. Maintenance can update mechanically specified versions; it does not invent new product features or silently rewrite the original structure. Action upgrade proposals require review. GitHub notifications report scheduled check failures through normal repository settings.

Rollback: revert the specific maintenance/content commit on main and let Cloudflare rebuild, or restore a previously successful Cloudflare deployment. Keep the Git source and production deployment consistent after an emergency rollback. Authentication/database data is not changed or rolled back by website builds.
