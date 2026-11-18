/* Service worker simples do Clau Flix.
 * - Páginas e ícones: respondem do cache e atualizam em segundo plano.
 * - catalogo.json / classificacao.json: rede primeiro (dados frescos), cache se estiver offline.
 * - Imagens externas, vídeos e o proxy não são tocados (só mesma origem, só GET, sem Range).
 * Para forçar atualização do cache, aumente VERSAO. */
const VERSAO = 'clauflix-v1';
const BASE = ['/', '/index.html', '/serie.html', '/manifest.webmanifest', '/icones/logo.svg', '/icones/favicon-192.png'];
const DADOS = ['/catalogo.json', '/classificacao.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(BASE)).then(() => self.skipWaiting()).catch(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const guardar = (res) => {
    if (res && res.ok) { const copia = res.clone(); caches.open(VERSAO).then((c) => c.put(req, copia)); }
    return res;
  };

  if (DADOS.includes(url.pathname)) { // rede primeiro
    e.respondWith(fetch(req).then(guardar).catch(() => caches.match(req)));
    return;
  }

  // cache primeiro + atualização em segundo plano (páginas, ícones)
  e.respondWith(caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then((cache) => {
    const rede = fetch(req).then(guardar).catch(() => cache);
    return cache || rede;
  }));
});
