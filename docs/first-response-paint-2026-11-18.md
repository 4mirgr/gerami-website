# Public first-response rendering, 2026-11-18

The owner's phone could open `/favicon.svg` without VPN while the homepage stayed
blank. This narrows the problem beyond a blanket hostname/TLS failure; it does
not prove every subsequent request on that carrier is healthy.

The previous built HTML loaded `style.css` before its synchronous inline theme
bootstrap, followed by two additional stylesheets. With those CSS responses held
pending, Chromium remained in `readyState=loading`, `document.body` was absent,
and the paint entry list stayed empty. The new built-artifact regression failed
on that existing release because the hero never became visible. Failed requests
were deliberately held pending, not aborted: an abort would release the parser
and hide the actual failure mode.

The public asset adapter now embeds the exact three emitted stylesheets at their
original cascade positions. It preserves the theme bootstrap, all public styling,
local font, fingerprinted image/font URLs and lazy imagery. Scripts, fonts and
images can finish after the HTML starts displaying its static content. Article
and settings updates still come from the same reviewed build. This trades about
44 KB of repeated uncompressed CSS per HTML document for removing three requests
from the first-paint path; the compressed total remains small. The test budget
counts the HTML and subresources together so moving bytes into HTML cannot hide
payload growth.

Inlining is restricted to public pages and generated local runtime CSS, capped
at 96 KiB per page. Closing style tags, imports and unsupported media adapters
fail the build instead of being inserted unsafely. Packaging tests compare each
inline block to its emitted source and check that admin/functions are unchanged.
The deploy browser test holds every subresource pending and requires visible
content and a first contentful paint on home, about and blog. The existing full
browser and combined-build gates continue to cover the rest of the application.

The fresh combined artifact passed the pending-subresource test for all three
pages. Its normal local cold-load run transferred 99,571 HTML bytes and 338,035
subresource bytes (437,606 together), with zero repeat shared-asset requests on
the four inner-page navigations. The homepage HTML compresses to 21,666 bytes
with gzip. These local measurements establish the dependency and payload budget,
not the owner's carrier latency.

No DNS, WAF, middleware scope, app pins, accounts, cookies, service workers,
backend bindings or private APIs change. Production remains the existing GitHub
to Cloudflare Pages deployment. After release, verify actual production HTML and
the pending-subresource scenario again. Actual recovery on the owner's two
carrier connections still needs their confirmation; external test locations do
not establish that result.

Chromium is available in this environment. Installing an additional WebKit test
engine was attempted, but the download endpoints were denied by the execution
network. Do not describe the automated run as a real iPhone/WebKit verification.
