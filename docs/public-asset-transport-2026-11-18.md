# Public asset delivery investigation

The owner's no-VPN device report at 07:25:29 UTC has a 193 ms HTML first
byte, a 197 ms favicon, no controlling service worker, and six-second
waiting-for-headers deadlines for both the full font and its 8 KiB range.
The background also times out; a 7,680-byte badge eventually completes in
5,599 ms. File size alone does not explain this report.

Cloudflare's Iran **eyeball** request groups for 07:24:30–07:27:00 UTC
contain HTTP/2 responses 206 for the font range and 200 for the background,
favicon and badge. Those aggregates support investigating response delivery
to the browser; they do not prove that the phone received the bytes or
identify the responsible network hop. They are not per-device request logs.
Foreign-hosted requests receive all the valid assets, with and without the
old random query, in 250–384 ms. That does not establish carrier recovery.

V1 also always added a random query and used no-store, unlike the site's
stable fingerprinted font URL. It measured a fresh edge key rather than the
actual asset/cache behavior. V2 uses the real site's font URL and stable
cache keys, records selected response/cache headers and resource timing,
and compares the exact same font/background bytes carried as binary files
and base64 text. SHA-256 and length checks precede font/image decoding.
The legacy range remains a separate explicit no-store test. A missed
six-second deadline is reported as such, not as proof of a server outage.

Only the standalone diagnostic and its two public text controls change.
The normal pages, initial response, font, supplied artwork, apps, account
boundaries, Cloudflare security and observability stay as deployed. Text
controls are not a new site dependency or an enabled production fallback.
Do not increase the initial HTML to embed the full assets again.

Validation: source/browser suite, fresh combined build and actual artifact
browser checks. The artifact check validates both transports against the
actual font and images. An on-device V2 result is still needed to decide
whether a text fallback or a different delivery edge addresses the affected
carrier. Do not claim that this diagnostic release fixes that connection.
