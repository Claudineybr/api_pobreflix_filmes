/* Clau Flix — Service Worker v2
   Substitui o sw.js antigo.
   Correção principal: o cache antigo era servido primeiro para sempre
   (cache-first) e nunca era trocado, então o celular continuava abrindo
   um index.html velho com links para o domínio antigo.
   Nesta versão: nome de cache novo, troca imediata de versão e limpeza
   automática do cache antigo. */

const VERSAO = 'clauflix-v2';

const CACHE_ESTATICOS = `${VERSAO}-estaticos`;
const CACHE_DADOS = `${VERSAO}-dados`;

const BASE = [
  '/',
  '/index.html',
  '/serie.html',
];

const DADOS = [
  '/catalogo.json',
  '/classificacao.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_ESTATICOS);
      // addAll falha inteiro se um arquivo faltar: adiciona um por um
      await Promise.all(
        BASE.map((url) => cache.add(url).catch(() => {}))
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const nomes = await caches.keys();
      await Promise.all(
        nomes
          .filter((n) => !n.startsWith(VERSAO))
          .map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // catálogo e classificação: rede primeiro (dados sempre frescos),
  // cache só como reserva quando estiver offline
  if (DADOS.includes(url.pathname)) {
    event.respondWith(
      (async () => {
        try {
          const resp = await fetch(req);
          const cache = await caches.open(CACHE_DADOS);
          cache.put(req, resp.clone());
          return resp;
        } catch (e) {
          const cache = await caches.open(CACHE_DADOS);
          const salvo = await cache.match(req);
          if (salvo) return salvo;
          throw e;
        }
      })()
    );
    return;
  }

  // páginas e arquivos estáticos: cache primeiro, mas sempre tentando
  // atualizar em segundo plano para o próximo acesso
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_ESTATICOS);
      const salvo = await cache.match(req);

      const rede = fetch(req)
        .then((resp) => {
          if (resp && resp.ok) cache.put(req, resp.clone());
          return resp;
        })
        .catch(() => null);

      if (salvo) {
        event.waitUntil(rede);
        return salvo;
      }

      const resp = await rede;
      if (resp) return resp;

      if (req.mode === 'navigate') {
        const home = await cache.match('/index.html');
        if (home) return home;
      }
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    })()
  );
});
