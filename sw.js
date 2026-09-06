/* Service Worker — AEM-CONSEIL PWA
   Stratégie :
   - Navigations (HTML)  → réseau d'abord, repli sur le cache (mode hors-ligne)
   - Ressources statiques → cache d'abord, mis à jour en arrière-plan
   Incrémente CACHE_VERSION à chaque mise en production pour purger l'ancien cache. */
const CACHE_VERSION = 'aem-v156';
const CACHE_NAME = `aem-conseil-${CACHE_VERSION}`;

/* Fichiers du « shell » applicatif, mis en cache à l'installation. */
const PRECACHE_URLS = [
  './',
  './index.html',
  './offline.html',
  './assets/articles.js',
  './assets/chat.js',
  './assets/analytics.js',
  './manifest.webmanifest',
  './assets/logo-full.png',
  './assets/logo-full-dark.png',
  './assets/logo-round.png',
  './assets/logo-mark-white.png',
  './assets/favicon-192.png',
  './assets/favicon-512.png',
  './assets/favicon-180.png'
];

/* Installation : pré-cache du shell. */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

/* Activation : suppression des anciens caches. */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

/* Récupération des requêtes. */
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // On ne gère que les GET.
  if (request.method !== 'GET') return;

  // Navigations (pages HTML) : réseau d'abord, mise en cache par URL, repli cache.
  // Chaque page (accueil SPA + pages statiques /ressources|/theme) est mise en
  // cache sous SA propre URL ; repli sur cette page, puis l'accueil hors-ligne.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request)
          .then((cached) => cached || caches.match('./index.html'))
          .then((c) => c || caches.match('./'))
          .then((c) => c || caches.match('./offline.html')))
    );
    return;
  }

  // Autres ressources : cache d'abord, puis réseau (et mise à jour en arrière-plan).
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          // On ne met en cache que les réponses valides (basic = même origine).
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
