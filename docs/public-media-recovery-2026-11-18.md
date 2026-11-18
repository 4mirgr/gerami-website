# Recover stalled public font and decorative images

The owner's MCI/no-VPN V2 report at 12:32:20 UTC still cannot receive
headers for the real fingerprinted font, the legacy 8 KiB range or either
base64 text control within six seconds. The background eventually succeeds
after about five seconds. The 14 ms badge has zero encoded resource bytes,
an older CF-Ray and no negotiated protocol in Resource Timing, consistent
with a browser cache response. It is not a fresh-download control. The
reported navigation is HTTP/2 with no controlling service worker.

Changing the file representation on the same delivery edge did not resolve
the affected connection. Do not enable a text fallback or embed the full
font/art into HTML. The provider/network hop responsible remains unproved.

An independent origin serves the exact public bytes from the existing
repository at commit `38519df205b699ac954eeba0d09276a6b376c46c`.
The full 111,152-byte font returned 200 on four Iranian probes (Arvan,
Fanap, Pishgaman and Hostiran) in 456–485 ms; these are not MCI probes.
Direct font/background/logo/badge requests also returned the expected
hashes with CORS support in hosted Chromium. These checks establish that
the alternative is valid, not that it is reachable from the owner's phone.

The small inline public recovery script retains same-origin delivery first.
Font and decorative CSS downloads use verified, cancellable fetches with a
1.8-second primary deadline; then they may use the independent origin with
a six-second deadline. Native CSS font/background requests cannot reliably
be cancelled after starting, so reviewed CSS uses a temporary local font
and transparent image variables until the exact real bytes arrive. The
font preload is removed only on public pages. Images retain real same-origin
sources for no-JavaScript rendering and use lazy loading so a stalled image
cannot hold the document load event. Visible images may use the same bounded
recovery. A noscript stylesheet restores the original CSS assets when JS is off.

Every request is credential-free and referrer-free; independent copies come
from a fixed public commit. Length and SHA-256 must match the local artifact
before installing a font/image Blob. Invalid or unavailable alternates are
rejected; the page keeps readable local text and neutral surfaces. Verified
objects are reused when language/theme controls restore a source URL. There
is at most one recovery job per reviewed asset per document. Offscreen lazy
images remain lazy. No font or raster bytes are embedded into the main HTML.

`deploy/public-asset-mirror.json` contains only the 18 reviewed public font
and decorative assets. Local copies must still match the pinned hashes or
the build stops. Uploaded content, executable modules, account endpoints,
admin shells, IntMed, AUS and private/clinical files are outside this map.
The script is embedded only in public HTML. DNS, Cloudflare security and
monitoring remain unchanged. The initial gzip HTML must remain below 28 KiB.

V3 of the standalone diagnostic compares the primary font/background with
the same bytes from the independent origin, validates their hashes and
decodes them. Previously issued immutable text control URLs remain available
for compatibility, but are no longer the proposed recovery path.

Validation includes the full source/browser suite and fresh combined build.
The native-request prototype still held the document load event, even after
replacement art appeared. The managed-fetch artifact fault test first failed on the prior release's indefinitely
pending font. It then passes with primary font/art responses deliberately
held: the font, logo and backgrounds recover and remain usable through
language/day/night changes. Another fault test rejects an equal-length,
corrupt alternate font while retaining readable text. Healthy local delivery
must not fetch any alternate copy. Hosted-browser tests and the final
on-device result must be reported separately; carrier recovery is not yet
confirmed at the time this change is prepared.
