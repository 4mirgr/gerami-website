# Personal website and independent CMS

User authorized continuation with the previously selected static site plus independent admin, now in both day and night themes. Preserve IntMed/AUS routes and credentials. Use the supplied logo in the header/favicon and supplied blue artwork in the hero. Keep the public site bilingual, responsive and usable without JavaScript. Do not invent CV credentials or articles.

Implementation choice: Decap CMS with GitHub editorial workflow, repository-backed JSON, uploaded images and independent GitHub OAuth. Draft changes use Git branches/PRs; only published articles render publicly. Git history supports recovery. Public content rendering uses text nodes; rich HTML is intentionally unsupported. Authentication is limited to the configured repository owner's account. Cloudflare secrets and OAuth app setup are deployment prerequisites. Never reuse AUS or IntMed sessions.

Day uses ice blue/white and ink typography; night uses midnight navy/cyan. Manual choice persists and system preference is the initial default. Static profile fallbacks remain available when scripts/network fail.
