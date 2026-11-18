# Complete public delivery on interrupted connections

The owner confirmed the first-paint fix worked, but fonts, pictures and the final
load state still stalled on their mobile connection. The prior fault test only
required readable content; when strengthened to require the load event, actual
Vazirmatn and decoded pictures with subsequent requests held pending, the prior
artifact timed out. First paint alone was insufficient evidence of completion.

Live checks found the font and pictures present and valid. A separate hosted
browser loaded them, and four Iranian probes returned 200 for the 111 KB font,
the night wallpaper and a topic badge. These probes do not reproduce the owner's
exact carrier connection. The optional analytics-beacon hypothesis did not
reproduce the fault; do not describe it as the cause or disable monitoring as a
repair. Cloudflare RUM remains unchanged.

## Delivery change

The build now carries the reviewed variable font, small fixed design pictures
and public runtime inside each public HTML response. Font and image bytes are
unchanged. There is no dependency on a later font, wallpaper, badge or JS-module
download for this design to finish rendering. The public settings/data snapshot
and existing inline styles remain in place.

Image data appears once in an escaped JSON dictionary. Inert image templates
prevent premature external image fetches; the local inline runtime materializes
the original single image at each position. No-JS parsing sees the original
local image through `noscript`, including exactly one logo. Theme/preview source
adapters retain owner choices and prioritize preview blob URLs. Large/new or
external article images retain their normal published URL rather than being
read from the server as local files.

The public module adapter accepts only this site's reviewed named-import graph,
checks imported exports, preserves module scopes and dependency ordering, and
compile-checks the delivered program with Node. Unsupported imports/exports,
cycles or script breakouts fail the build. It uses no eval, third-party bundler,
new runtime dependency, protected admin code or independent app source.

Individual embedded files are limited to 128 KiB, embedded design bytes to
512 KiB and a public document to 512 KiB gzip / 1.5 MB raw. The default homepage
is about 404 KB gzip / 636 KB raw. This deliberately trades reuse of separate
cached asset requests for a bounded response on interrupted connections. The
only normal first-party request left after home HTML is the small, server-verified
owner session check; its GET and logout requests now have an eight-second
deadline, preserving the existing failure and confirmed-logout behavior.

Emitted original/fingerprinted files remain available. HTML revalidation, static
cache identities, protected admin/middleware, cookies, API policy and independent
IntMed/AUS pins and bindings are preserved. The latest main pin update is retained.
The combined verifier allows only the exact local favicon bytes as a data entry;
external entry-point scripts and other arbitrary data entry assets remain denied.

## Validation

- The old artifact fails the stronger interrupted-network completion test.
- The new artifact finishes home/about/blog with every post-HTML request held
  pending: the load event fires, actual Vazirmatn glyphs render, all pictures
  decode, and theme/language controls work.
- Normal navigation, bounded combined transfer, shared-asset reuse, public JSON
  fallback, one-logo no-JS/no-CSS behavior and runtime errors remain checked.
- Unit tests compare embedded images/font to their original bytes, preserve the
  exact CSS rules, reject unsafe/unsupported source, and retain external images.
- The full source browser suite and fresh combined independent-app build pass;
  CI and the real preview/production response are checked before completion.

This does not claim a measured carrier speed or a change to ISP filtering.
Production font/image completion is checked again after the Git-based rollout.
