/* Preserve already-issued IntMed recovery/invite links after moving the homepage.
   Tokens stay in the fragment on the same origin; no API calls or logging here. */
(() => {
  if (location.pathname !== '/' && location.pathname !== '/index.html') return;
  const values = new URLSearchParams(location.hash.slice(1));
  if (values.has('access_token') && ['recovery', 'invite'].includes(values.get('type'))) {
    location.replace('/intmed/' + location.search + location.hash);
  }
})();
