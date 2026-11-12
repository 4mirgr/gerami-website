# Site Studio — approved scope, 2026-11-12

The owner requests a comprehensive content and visual manager, a single real GitHub connection indicator, image editing, nested menus, bilingual page editing, and correct directional arrows. The owner has already authorized implementation and publication without repeated design approval.

Keep Enfhess, Dompet, local Vazirmatn, light/dark, bilingual content and independent IntMed/AUS integrations. Add a native Site Studio inside Dompet, preserving the existing Decap article/CV editor as an advanced editor. Use the same GitHub OAuth session for all tools. Verify the account and repository write permission before reporting connected.

Managed JSON documents supply appearance, page text, navigation and extra pages. All built-in bilingual text gets stable editable keys. Defaults preserve the current site. Preview runs in an embedded public page and accepts drafts only from its same-origin parent. Drafts persist locally; publication writes reviewed dirty JSON files atomically through GitHub Git Data APIs with conflict checks and a non-forced ref update. Revision restore first creates a local draft. Uploaded media is re-encoded, resized and edited in the browser, then committed only under assets/uploads. No arbitrary scripts/CSS or private app configuration can be edited through this manager.

Implement in sequence: shared model and validation; public customization/rendering; global OAuth state and Git store; native editing tools and media; integration and responsive styling; model/browser/combined-build checks; publish through existing Git integration and verify live assets. Automated maintenance keeps its existing limited scope.
