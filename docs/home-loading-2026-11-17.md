# Home-page loading repair — 2026-11-17

Owner reported slow opening of `drgerami-md.ir` and confirmed the public home
page, rather than IntMed, is the affected entry. No content, images, font,
layout, application pin, account, secret or access rule changes are included.

## Evidence and repair

A fresh external-browser observation returned the document in about 393 ms and
first contentful paint at 812 ms. That observation is outside the owner's
network, not an Iranian field measurement or a Core Web Vitals certification.
The live resource graph showed seven later `no-store` JSON requests for public
content/settings, plus a synchronous external theme script before paint. The
build already renders public settings into HTML, but hydration fetched them again.

The home-page build now includes a versioned, inert JSON snapshot of six existing
public documents. Script delimiters and HTML-sensitive characters are escaped;
the serialized snapshot is capped at 64 KiB. Oversized documents retain their
ordinary network fallback, so a growing article feed cannot expand HTML without
bound. The unused extra-page feed is fetched only on extra pages. No persistent
browser content cache is introduced: the snapshot belongs to the same atomic
Cloudflare deployment as its HTML. Missing/invalid snapshots use the original
network path, including the raw development template and other pages.

The exact existing repository theme script is inlined on the assembled home page
to remove a parser-blocking request. Its storage/media preference, one-logo
behavior, language support and event handlers are unchanged. Build code refuses
an unsafe closing-script sequence rather than inserting it. Existing asset
hashing remains in the normal assembled-build step.

## Verification

- Three Python regressions failed before repair, then passed: public allowlist,
  bounded feed fallback, escaping and unchanged source bytes.
- The built-home browser regression failed with seven data requests before the
  repair. It now renders all 12 topics with the content endpoints blocked and
  sends zero JSON requests. Translation, theme, draft-preview updates and the raw
  template fallback pass. This test is part of the regular browser gate.
- Five interleaved cold-context comparisons used a 390×844 viewport, 4× CPU
  throttling and an artificial 200 ms delay on each local request. Median article
  UI readiness changed from 1,090 ms to 829 ms; requests from 23 to 15; JSON
  requests from seven to zero. FCP medians were 740/704 ms and LCP 740/708 ms,
  too close and variable to claim a field paint improvement. These are synthetic
  diagnostics, not predicted speeds on the owner's connection.
- All 29 canonical content/asset files retain the same paths and SHA-256 hashes.
  The mounted IntMed and AUS releases and the admin/encoded-path protection are
  preserved. Their full combined build remains a mandatory production gate.

Local static/unit checks and focused browser suites passed. The local full
browser entry stopped at the pinned Decap CDN bundle because that dependency is
not available through this execution environment's network policy. Hosted CI
fetches and verifies that exact pinned bundle and must pass the complete browser
suite and a fresh combined Cloudflare build before main advances. No dependency
or security gate is skipped or replaced with fabricated output.
