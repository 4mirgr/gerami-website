# Restore the small public response

The owner confirmed that the prior stylesheet-inlining release displayed quickly
on their phone. The subsequent all-assets-in-HTML release regressed that same
connection to a blank page. External completion tests were insufficient to claim
recovery on the owner's carrier. Restore the small-response delivery adapter and
its established tests; retain inline public CSS, bounded public data, the local
font and immutable optimized files. Do not put the full font/images/runtime into
the initial HTML response.

Retain the eight-second server-session request deadline and all verified-owner
behavior. Preserve main's newer independent IntMed/AUS pins, the updated AUS
allowlist/build adapter and its regression checks. This is a selective source
revert, not a rollback of the whole production deployment to an older app build.

Run the full source/browser and fresh combined-build gates before the normal Git
rollout. Verify the deployed small HTML/inline-style markers and native app/admin
boundaries. The remaining incomplete font/image transfers on the carrier are an
open issue; do not describe restoring first paint as resolving that separate
problem. In particular, check range support and response-body progress on public
assets before proposing another transfer change.

`/asset-check.html?run=1` is a small standalone, credential-free diagnostic. It
compares an 8 KiB range with the full public font, checks font decoding and two
public images, and records header/body phases, received bytes and the path of a
controlling same-origin service worker. Each test has a six-second deadline.
Results stay on the user's device; no account endpoints, cookies or stored data
are read. It needs no separate JS or font download to display its controls. The
source unit tests cover ignored ranges and both header/body stalls.
