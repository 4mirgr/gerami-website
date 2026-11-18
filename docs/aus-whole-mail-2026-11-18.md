# AUS whole-mail frontend release — 2026-11-18

Advance only the AUS public commit pin to `a092661d2adf7d319a711e9730ffd4e3fd5bc5f0`. Keep IntMed at `c9c7a5b7d41bcc076dcfaa0b74bd0b64eae2674c` and preserve the latest public-site changes from `0c26e5add10a1dfde07e10dea09501fad3507071`.

The reviewed AUS build removed the vulnerable Vite chain and uses its existing pinned esbuild via `scripts/frontend.mjs`. The isolated public-input allowlist follows that exact builder. No backend directory, CV, mail, account, token, `.env` or other private source enters the published artifact. Mount, gateway and recovery guards remain unchanged.

The combined browser fixture for an absent public AUS card now tests the correct fragment-preservation behavior after an unsafe override; it must not invent a public private-project link. Invalid configuration keeps the existing unavailable warning visible. Actual `/aus/` login and gateway failures are still exercised separately.

Validation: seven adapter unit checks; full `check_site.py --browser`; fresh combined build of 464 public files with both upstream validators; combined Chromium check of 48 page/viewport/language combinations including actual AUS login, denied missing gateway, IntMed login/backend and scoped service worker. The local assembled preview uses the existing anonymous CMS-session handler, not a fabricated signed-in response. No provider action was used for validation.

Backend publication is separate: the existing AUS Worker was deployed with eight secrets preserved. Source runtime receipts live in the AUS repository. This host release neither reads private mail nor grants send consent.
