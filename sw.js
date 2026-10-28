// Service worker : l'appli s'ouvre même sans réseau.
// Fichiers de l'appli : réseau d'abord (pour recevoir les mises à jour), sinon cache.
const CACHE = 'nutriscan-v5';
const FILES = ['./', './index.html', './styles.css', './app.js', './foods.js', './additives.js', './ingredients.js', './config.js', './cloud.js', './manifest.webmanifest', './icon.svg', './icon-180.png', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET') return;
  // Module de scan (CDN) : cache d'abord, pour que le scan marche aussi avec un réseau faible
  if (/html5-qrcode@2\.3\.8/.test(url.href)) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { const c = res.clone(); caches.open(CACHE).then(x => x.put(req, c)); return res; })));
    return;
  }
  if (url.origin !== location.origin) return; // Open Food Facts : toujours en direct
  e.respondWith(
    fetch(req)
      .then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});
