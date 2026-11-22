# Topic-matched two-cover editorial review and SEO

Owner explicitly requests implementation and re-delivery of every existing private
post, with two content-specific image choices (clinical/paraclinical/illustrative,
independent of topic badges), source display exactly `Harrison 2025`, exact IntMed
parent/topic placement, multiple distinct posts per topic, and background trend-aware
selection. Existing publication approval, verified source pins, privacy and performance
boundaries remain. Native implementation uses the current static site/Edge/PostgreSQL
stack; no framework, paid plan, new bot/account or public draft upload.

## Approaches and chosen implementation

Keep category badges unchanged. Original topic-specific clinical-style artwork and
explanatory illustrations provide the first three pairs; store both options privately
until selected and approved. A service-only reusable topic media library supports later
posts; bounded public-domain Commons discovery can propose new topics without a paid
image API. Do not silently use category badges or unrelated fallback art. Missing media
stays a visible private pending state. External metadata and trend titles are data,
never generation instructions or medical evidence.

A private cover-choice ledger binds candidate, saved revision, displayed photo and
owner. Two photos and complete title/body/source are sent before buttons are armed.
Choosing an image creates a new saved revision; only the chosen image's exact current
preview can approve publication. The other option remains switchable; any new edit
invalidates old approval. Custom photo replacement remains supported. No doctor
approval is simulated.

Mirror every pinned IntMed category/topic in a public static directory, retaining
existing website IDs/aliases. Keep the homepage's compact active catalog; publishing
ensures each actual article's exact child exists there. Full directory/leaf pages are
server-rendered and directly linked from navigation. Approved posts get distinct
canonical nested URLs, title/description/OG metadata, Article/Breadcrumb JSON-LD,
related posts and sitemap entries. Empty topic pages exist but are noindex and absent
from the sitemap. Multiple slugs in one child are valid; source topics may be revisited
with a cooldown and distinct editorial angle. Preserve the unchanged28,000B gzip root
and172,032/57,344B source budgets; do not increase loading dependencies.

Trend selection uses a bounded daily public feed with timestamp/region/source/error
provenance. Only matching published IntMed topics qualify. Fresh signals influence
ranking; absent/unavailable/stale signals safely fall back to rotation and cooldown.
No search-volume/SEO-rank claims are invented. GSC Wizard currently has no connected
property; owner connection is a future measurement prerequisite, not a reason to stop
this change. Record a practical SEO backlog and ownership actions.

## Acceptance

Re-prepare and deliver all three current private drafts, never publish them. Each
shows its precise parent/topic, `Harrison 2025`, complete text and two individually
selectable relevant images. Verify real photo delivery, SQL owner/revision/message/
selection binding, stale buttons, custom replacement and approved immutable publishing.
Test repeat-source selection, unavailable signals/media, static pages/no draft leakage,
multiple posts per topic, unique canonicals/sitemap and unchanged performance recovery.
PR/CI before merge/deployment; fresh assembled build; then apply migrations/deploy,
backfill existing drafts as new revisions and resend with safe operational receipts.
