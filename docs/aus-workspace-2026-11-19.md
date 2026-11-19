# AUS workspace release — 19 November 2026

The AUS public build is pinned to `74718a063fa01048a3dd87a482a2d0be505d39cd`.
It refines clinic-specific GP application writing, adds private in-place letter
editing and adaptive templates, repairs narrow mobile batch-selection layouts,
and groups connection/source tools into compact expandable sections. Notification
counts use a yellow breathing halo with reduced-motion support.

The native public site changes through `5f9a65b` are preserved. IntMed remains
pinned to `c9c7a5b7d41bcc076dcfaa0b74bd0b64eae2674c`; this change grants no
shared account, mailbox or medical access.

Validation: complete native site checks, fresh combined Cloudflare build,
48 assembled page/viewport/language combinations, and actual AUS/IntMed login,
asset and worker-scope browser checks passed. No user messages were sent during
verification. Worker code and private schema deployment have separate receipts
in the AUS repository.
