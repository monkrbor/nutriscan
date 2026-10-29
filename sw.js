// Service worker : NutriScan marche hors ligne.
// - Fichiers de l'appli : réseau d'abord (pour recevoir les mises à jour), sinon la copie en cache.
// - Modules de scan et polices : gardés en cache pour scanner sans réseau.
// - Fiches et photos de produits déjà consultées : copie gardée pour les revoir hors ligne.
// - Photos des recettes (Pexels) : copie gardée quand le site l'autorise, sinon affichées en direct.
const CACHE = 'nutriscan-v10';
const RUNTIME = 'nutriscan-rt-v1';
const PHOTOS = 'nutriscan-photos-v1';
const FILES = ['./', './index.html', './styles.css', './app.js', './foods.js', './additives.js', './ingredients.js', './config.js', './cloud.js', './exercises.js', './figure.js', './recipes.js', './sport.js', './meals.js',
  './manifest.webmanifest', './icon.svg', './icon-180.png', './icon-192.png', './icon-512.png'];
const LIBS = ['https://cdn.jsdelivr.net/npm/barcode-detector@3.0.7/dist/iife/ponyfill.min.js', 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(FILES).catch(() => {});
    await Promise.all(LIBS.map(async u => { try { const r = await fetch(u, { mode: 'cors' }); if (r.ok) await c.put(u, r); } catch (err) { /* sera mis en cache au premier scan */ } }));
  })());
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== RUNTIME && k !== PHOTOS).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function trim(cacheName, max) {
  const c = await caches.open(cacheName), keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}
async function cacheFirst(req, cacheName) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') { const c = await caches.open(cacheName); c.put(req, res.clone()); }
  return res;
}
async function networkFirst(req, cacheName, max) {
  try {
    const res = await fetch(req);
    if (res.ok || res.status === 404) { const c = await caches.open(cacheName); c.put(req, res.clone()); if (max) trim(cacheName, max); }
    return res;
  } catch (err) {
    const hit = await caches.match(req, { ignoreSearch: false });
    if (hit) return hit;
    throw err;
  }
}

async function recipePhoto(req) {
  const c = await caches.open(PHOTOS);
  const hit = await c.match(req.url);
  if (hit) return hit;
  try {
    const res = await fetch(req.url, { mode: 'cors', credentials: 'omit' });
    if (res.ok) { c.put(req.url, res.clone()); trim(PHOTOS, 160); }
    return res;
  } catch (err) {
    return fetch(req); // pas d'accès CORS : affichée sans copie (ou erreur hors ligne → l'emoji reste)
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Modules de scan (lecteur de code-barres et son moteur WebAssembly)
  if (/barcode-detector@3\.0\.7|zxing-wasm@|html5-qrcode@2\.3\.8/.test(url.href)) { e.respondWith(cacheFirst(req, CACHE)); return; }
  // Polices
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') { e.respondWith(cacheFirst(req, RUNTIME)); return; }
  // Photos des recettes
  if (url.hostname === 'images.pexels.com') { e.respondWith(recipePhoto(req)); return; }
  // Photos de produits
  if (url.hostname === 'images.openfoodfacts.org') {
    e.respondWith(cacheFirst(req, RUNTIME).then(r => { trim(RUNTIME, 400); return r; }).catch(() => new Response('', { status: 504 })));
    return;
  }
  // Fiches et recherches de produits : en direct, avec la dernière copie si pas de réseau
  if (/(^|\.)openfoodfacts\.org$/.test(url.hostname)) { e.respondWith(networkFirst(req, RUNTIME, 400)); return; }
  // Sauvegarde en ligne : jamais en cache
  if (/supabase\.co$/.test(url.hostname)) return;
  if (url.origin !== location.origin) return;
  // Fichiers de l'appli
  e.respondWith(
    fetch(req)
      .then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; })
      .catch(async () => (await caches.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))
  );
});
