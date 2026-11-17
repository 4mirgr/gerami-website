These size derivatives come from the owner's original artwork in
`assets/ui/material-controls.png` and `assets/topics/*.webp`, which remain intact.
Regenerate with `node scripts/prepare_web_images.mjs` (ImageMagick required only
for that maintenance command). Review the small rendered controls and badges.
The build verifies content fingerprints before granting immutable cache headers.
See `docs/public-performance-2026-11-17.md` for measurements and scope.
