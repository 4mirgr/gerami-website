/* Retire ONLY the former root IntMed worker during the hostname cutover.
   No localStorage, sessionStorage, account or study data is changed. */
'use strict';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    if (new URL(self.registration.scope).pathname !== '/') return;
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('intmed-pwa-')).map(key => caches.delete(key)));
    await self.registration.unregister();
  })());
});
