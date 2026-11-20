# Private daily public-health drafts

Owner authorization: one daily Persian draft from already published IntMed lessons,
points and flashcards; 3–5 natural, useful paragraphs for the public, Harrison
attribution, suitable editable image, tags/hashtags, private admin review and
explicit Telegram approval. Reuse the existing IntMed bot (owner confirmed),
Supabase project and configured Gemini. No new subscription or Clinic activation.

## Trust and data flow

1. Service-only Postgres queue schedules one daily job at 09:00 Asia/Tehran.
   A short-lived hashed capability wakes the editorial Edge Function. Bounded
   retries; daily unique key; provider exhaustion remains visible and retryable.
2. Read only the website-pinned published IntMed manifest/topic bytes and verify
   hashes against the live mounted app. Secondary-source provenance is retained;
   never invent independently verified Harrison pages. Model input is untrusted
   data, without tools. Fixed code chooses category/image/status, not the model.
3. Store drafts/revisions privately, never in public articles JSON. Live app-admin
   sessions protect the website proxy and Edge API independently. Reuse existing
   HttpOnly cookies. Secretary/user cannot access editorial drafts.
4. Send image and complete text to the existing configured private Telegram chat.
   Namespaced callbacks preserve existing IntMed commands/webhook. Approval binds
   exact revision, hash, message, chat, owner and expiry; edits invalidate it.
5. GitHub Actions OIDC on the exact website main workflow claims approved immutable
   content. No PAT/service key in Cloudflare or GitHub. Validate, build and commit
   only the article and reviewed public image, without force pushes. Publication
   is confirmed against deployed public bytes before Telegram reports success.

## Editorial rules

Natural written Persian, varied openings, short familiar sentences, explain jargon.
No robotic filler, invented patient stories, unsupported statistics or drug doses.
Cover definition, practical symptoms/challenges and general care/treatment as
supported by source. Doctor review remains required. Automatic covers use owned
topic artwork, not copied textbook figures or patient images. Admin may replace
the cover with a bounded private upload before approval. Tags/hashtags are editable.

## Performance and verification

No public runtime framework or model calls. Homepage snapshot includes bounded
published article metadata/excerpts only, with full bodies loaded on article pages.
Keep existing Iran asset recovery, first-response limits, auth and Clinic gates.
Test authorization, stale approval, concurrent claims, source hashes, retries,
provider failures, upload signatures and populated article delivery. Verify the
live bot source before patching; never replace newer live behavior blindly.

## Delivery state

Design accepted under standing implementation authorization. Implementation and
live activation are separate evidence; update PROJECT_HANDOFF and remaining-work
checklist with actual migrations, function versions, PRs and first draft receipt.
