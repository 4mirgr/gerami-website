/* Public destinations only. Never put credentials or private project content here.
   null keeps the visible, truthful "not available yet" fallback.
   The two static .ir entry buttons are always visible; they do not prove readiness.
   Set these project paths ONLY after the existing apps are deployed and tested.
   Project cards accept local subpaths or https://drgerami-md.ir subpaths only,
   never third-party app URLs. Use a server-side reverse proxy for remote apps. */
window.SITE_LINKS = Object.freeze({
  intmed: null,       // "/intmed/" once migration has passed validation
  aus: null,          // "/aus/" once deployed; NOT a private ChatGPT project URL
  linkedin: null,     // "https://www.linkedin.com/in/your-real-profile/"
  appointment: null,  // Your actual booking profile, not a provider's homepage
  email: null,        // "mailto:your-confirmed-public-email@example.com"
  phone: null         // "tel:+98..." (public contact number only)
});
