# Website maintenance contract

Preserve the user-selected Enfhess public layout, Dompet admin layout, Persian/English, day/night controls, single theme-aware logo and local Vazirmatn font. Do not invent medical qualifications, CV entries, publications, contact information or analytics.

IntMed and AUS remain independent. Keep their repository URLs, public directories, mounts, accounts, sessions, secrets and backends separate. Build only reviewed public AUS inputs in a temporary directory. Never copy the whole cloud/backend/private directories. Keep source checkouts unchanged. New frontend imports require a review and an explicit allowlist change.

Use `python3 scripts/check_site.py --browser` with a free port 4173; use `--reuse-server` only for an existing local server for this checkout. `CHROMIUM_PATH` selects the browser executable. `npm ci --ignore-scripts` installs development-only browser tooling, not website runtime dependencies.

Before production, run `python3 scripts/build_cloudflare.py` into a fresh output path. This validates content, protected boundaries, both upstreams and assembled public assets. A failed gate must not be bypassed, force-pushed or replaced with fabricated output.

Automatic maintenance may advance only full commit pins on the explicitly configured upstream branches and patch versions permitted by the existing npm range, after all browser and combined-build checks pass. Do not automatically change layouts, schema, source repositories, branches, mounts, accounts, secrets or medical content. If main moved during checks, abort the push and revalidate a fresh checkout. No force pushes. Production continues through the existing Cloudflare Git integration.

Use the user-supplied Codex Extended Library as an index: select at most two relevant guides initially, read pinned source documents and adapt them to the existing project and session authorization. Reference details are in `docs/site-review-2026-11-12.md`.
