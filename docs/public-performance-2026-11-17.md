# Public loading performance, 2026-11-17

The owner reproduced slow loading on two networks. The deployed mint design at
2403db3 was measured in a separate hosted Chromium browser, with a cold cache,
390×844 viewport, 1.5 Mbps download, 150 ms latency and 4× CPU slowdown.
Two runs took 9.56–9.82 seconds to fire the load event, transferring 1,688,281
resource bytes. TTFB was 243–290 ms. The 810 KB header control sprite alone took
8.67 seconds; ten decorative 512px topic images added roughly 650 KB. The first
paint already happened earlier (1.02–1.43 seconds), so load completion must not
be described as the time before any content appeared.

The public site was already using local fonts, font-display:swap, a bounded
homepage data snapshot and Brotli. Account session checks are small and do not
block paint. Cloudflare Brotli is on, Rocket Loader is off. No speculative
network/security configuration changes were made. IntMed, AUS and admin login
were also navigated independently; the oversized sprite affects public pages,
not those independent apps. Source browser checks cover the full public page
set, languages, themes and responsive layouts.

## Changes

- Keep original owner artwork and generate reviewed WebP size derivatives:
  96px per header control and 192px topic badges, at quality 88. The sprite falls
  from 809,591 to 8,470 bytes; all eleven derivatives together are 90,452 bytes.
  `node scripts/prepare_web_images.mjs` regenerates them with ImageMagick. The
  production build does not install or execute image processing software.
- Public CSS, JS, module dependencies and the unchanged Vazirmatn font receive
  content-addressed deploy URLs. Imports propagate dependency fingerprints.
  Relocated model imports retain their root `/content/` fallback. Module preloads
  remove serial discovery of shared dependencies. A changed file always gets a
  new URL; long caching is restricted to fingerprinted runtime/image directories.
  Legacy unversioned files retain their existing revalidation policy.
- The existing bounded, safely escaped public-data snapshot now also covers
  each public inner page. Large feeds still fall back to JSON. Theme bootstrap
  stays before paint, preserving stored preferences and UI handlers.
- Do not move or cache protected admin files, sessions or private APIs. Preserve
  the existing all-path middleware boundary, owner verification, mounts,
  independent app pins, gateway bindings and backend configuration.

## Validation

The complete source browser suite and a fresh combined Cloudflare build passed.
New packaging tests check fingerprint integrity, importer invalidation, safe
public-data boundaries, exact admin/function preservation and relocated URLs.
The built-artifact browser test checks actual module/image/font decoding, a
450 KB resource-transfer ceiling, zero JSON requests on home and four inner
pages, and browser reuse of shared immutable files. Its local uncompressed
HTTP run transferred 383,110 resource bytes and made zero new shared-asset
network requests across those four navigations. This is an artifact budget,
not a field speed claim; production is measured again after deployment.

The CI workflow runs the same artifact test after its fresh combined build.
There are no public npm runtime dependencies or new third-party CDN requests.
Synthetic throttling describes a repeatable comparison; it cannot guarantee
latency or availability for every Iranian carrier or international route.
