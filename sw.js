/* Clau Flix — Service Worker v4
   0) Mesma lógica da v3 (que corrigiu o ERR_FAILED do /index.html).
      Só troquei a versão do cache para v4 porque mudaram o index.html e o serie.html:
      com cache novo, os arquivos novos aparecem na hora em quem já usa o site.
   Correções desta versão:
   1) Navegação para "/index.html" (ou qualquer ".../pagina.html") não quebra mais.
      O Cloudflare Pages responde 308 em "/index.html" -> "/", e o navegador
      recusa uma resposta redirecionada quando é uma navegação (dava ERR_FAILED).
      Agora o worker pede direto o endereço final ("/" em vez de "/index.html").
   2) Qualquer resposta redirecionada é "limpa" antes de ser guardada/entregue.
   3) Cache com nome novo: apaga automaticamente os caches antigos (v1/v2/v3). */

const VERSAO = 'clauflix-v4';

const CACHE_ESTATICOS = `${VERSAO}-estaticos`;
const CACHE_DADOS = `${VERSAO}-dados`;

const BASE = ['/', '/serie'];
const DADOS = ['/catalogo.json', '/classificacao.json'];

/* "/index.html" -> "/", "/serie.html" -> "/serie" (URL final do Cloudflare Pages) */
function canonica(href) {
  const u = new URL(href);
  u.hash = '';
  if (u.pathname.endsWith('.html')) {
    const semExt = u.pathname.slice(0, -5);
    u.pathname = (semExt === '' || semExt === '/index') ? '/' : semExt;
  }
  return u.toString();
}

/* Uma resposta obtida seguindo redirecionamento não pode ser devolvida
   numa navegação nem guardada no cache. Recriar a resposta resolve. */
async function semRedirecionamento(resp) {
  if (!resp || !resp.redirected) return resp;
  const corpo = await resp.arrayBuffer();
  return new Response(corpo, {
    status: resp.status,
    statusText: resp.statusText,
    headers: resp.headers,
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_ESTATICOS);
      await Promise.all(BASE.map((url) => cache.add(url).catch(() => {})));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const nomes = await caches.keys();
      await Promise.all(
        nomes.filter((n) => !n.startsWith(VERSAO)).map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

/* catálogo e classificação: rede primeiro, cache só como reserva offline */
async function redePrimeiro(req, chave) {
  const cache = await caches.open(CACHE_DADOS);
  try {
    const resp = await semRedirecionamento(await fetch(req.url));
    if (resp && resp.ok) cache.put(chave, resp.clone());
    return resp;
  } catch (erro) {
    const salvo = await cache.match(chave);
    if (salvo) return salvo;
    throw erro;
  }
}

/* páginas e estáticos: cache primeiro, atualizando em segundo plano */
async function cachePrimeiro(event, req) {
  const alvo = canonica(req.url);
  const chave = new URL(alvo).pathname;
  const cache = await caches.open(CACHE_ESTATICOS);
  const salvo = await cache.match(chave);

  const rede = (async () => {
    try {
      const resp = await semRedirecionamento(await fetch(alvo));
      if (resp && resp.ok) await cache.put(chave, resp.clone());
      return resp;
    } catch (erro) {
      return null;
    }
  })();

  if (salvo) {
    event.waitUntil(rede);
    return salvo;
  }

  const resp = await rede;
  if (resp) return resp;

  if (req.mode === 'navigate') {
    const home = await cache.match('/');
    if (home) return home;
  }
  return new Response('Offline', { status: 503, statusText: 'Offline' });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (DADOS.includes(url.pathname)) {
    event.respondWith(redePrimeiro(req, url.pathname));
    return;
  }

  event.respondWith(cachePrimeiro(event, req));
});
