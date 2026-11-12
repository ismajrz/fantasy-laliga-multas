// Service worker mínimo: guarda solo la "carcasa" de la web (HTML, estilos, JS, fuentes e imágenes)
// para que abra sin conexión. NUNCA guarda /api: los datos siempre vienen del servidor y, si no hay
// conexión, la página enseña su aviso de "Sin conexión".
// Al cambiar cualquier archivo de la web, sube VERSION para que los móviles descarguen lo nuevo.
const VERSION = 'v6-2';
const CACHE = 'fantasy-shell-' + VERSION;
const SHELL = [
  '/',
  '/css/styles.css',
  '/js/app.js', '/js/league.js', '/js/share.js', '/js/stats.js', '/js/history.js',
  '/fonts/barlow-400.woff2', '/fonts/barlow-500.woff2', '/fonts/barlow-600.woff2', '/fonts/barlow-700.woff2',
  '/fonts/barlow-condensed-600.woff2', '/fonts/barlow-condensed-700.woff2', '/fonts/barlow-condensed-800.woff2',
  '/img/laliga.png', '/img/favicon.svg', '/manifest.webmanifest',
  '/img/icons/icon-192.png', '/img/icons/icon-512.png', '/img/icons/apple-touch-icon.png',
  '/img/escudos/alaves.png',
  '/img/escudos/athletic.png',
  '/img/escudos/atletico.png',
  '/img/escudos/barcelona.png',
  '/img/escudos/betis.png',
  '/img/escudos/celta.png',
  '/img/escudos/deportivo.png',
  '/img/escudos/elche.png',
  '/img/escudos/espanyol.png',
  '/img/escudos/getafe.png',
  '/img/escudos/levante.png',
  '/img/escudos/malaga.png',
  '/img/escudos/osasuna.png',
  '/img/escudos/racing.png',
  '/img/escudos/rayo.png',
  '/img/escudos/real-madrid.png',
  '/img/escudos/real-sociedad.png',
  '/img/escudos/sevilla.png',
  '/img/escudos/valencia.png',
  '/img/escudos/villarreal.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('fantasy-shell-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return; // red, sin caché

  if (req.mode === 'navigate') {
    // Página: primero la red (para tener siempre la última versión); sin conexión, la guardada.
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('/', copy)); }
      return res;
    }).catch(() => caches.match('/')));
    return;
  }
  // Archivos estáticos: lo guardado al momento y se actualiza por detrás.
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    return (await net) || new Response('', { status: 504 });
  }));
});
