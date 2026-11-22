/* Clau Flix — player próprio + escolha "Como deseja assistir?" (Player Interno / Rave).
 * Usado por index.html e serie.html:  ClauPlayer.escolher({...})  ou  ClauPlayer.abrir({...})
 *
 * opts = {
 *   chave:     id para salvar o progresso (ex.: link do filme ou "serie:nome:t1e2")
 *   videoUrl:  link do vídeo (.mp4 ou embed)       titulo / subtitulo: textos da barra superior
 *   link:      página original (.html) — usada no Rave e no erro
 *   workerUrl: proxy para vídeos http://           proximo: () => void | null  (botão "Próximo episódio")
 *   rotuloProximo: texto opcional do botão         aoFechar: () => void   aoIniciar: () => void (ao escolher Player/Rave)
 *   segmentos: trechos para o botão "Pular" (estilo Netflix). Aceita um array [{tipo, ini, fim}] (segundos), uma Promise
 *              desse array ou uma função que devolve um dos dois (só é chamada quando o Player Interno abre).
 *              tipo: 'intro' | 'recap' | 'credits' | 'preview'.  fim: null = até o fim do vídeo.
 *              Sem segmentos (ou em embed/iframe) o botão nunca aparece. Tecla "S" aciona o botão.
 * }
 *
 * ClauPlayer.buscarSegmentos(tmdbId, temporada, episodio) -> Promise<[{tipo, ini, fim}]>   (TheIntroDB; filme: só tmdbId)
 *   Nunca rejeita: falha de rede, 404 ou título sem dados = [].
 *   Uso: segmentos: () => ClauPlayer.buscarSegmentos(18165, 1, 3)
 */
(() => {
  'use strict';
  if (window.ClauPlayer) return;

  const LS_PROGRESSO = 'clauFlix_progresso_v1';
  const MAX_PROGRESSOS = 60;

  const ICONES = {
    play: '<path d="M8 5v14l11-7z"/>',
    pause: '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>',
    voltar: '<path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z"/>',
    volta10: '<path d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"/>',
    avanca10: '<g transform="translate(24 0) scale(-1 1)"><path d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"/></g>',
    som: '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05A4.5 4.5 0 0 0 16.5 12z"/>',
    mudo: '<path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zM19 12c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>',
    pip: '<path d="M19 11h-8v6h8v-6zm4 8V4.98C23 3.88 22.1 3 21 3H3c-1.1 0-2 .88-2 1.98V19c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 .02H3V4.97h18v14.05z"/>',
    tela: '<path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>',
    proximo: '<path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>',
    pessoas: '<path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>',
  };
  const svg = (n, t = 24) => `<svg viewBox="0 0 24 24" width="${t}" height="${t}" fill="currentColor" aria-hidden="true">${ICONES[n]}</svg>`;

  const CSS = `
  .cp-escolha{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.72);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);opacity:0;pointer-events:none;transition:opacity .25s}
  .cp-escolha.on{opacity:1;pointer-events:auto}
  .cp-card{width:100%;max-width:440px;padding:26px 22px 18px;border-radius:22px;background:rgba(14,18,16,.96);border:1px solid rgba(255,255,255,.12);box-shadow:0 24px 70px rgba(0,0,0,.7);text-align:center;color:#fff;font-family:inherit;transform:translateY(10px) scale(.97);transition:transform .25s}
  .cp-escolha.on .cp-card{transform:none}
  .cp-card h2{margin:0 0 4px;font-size:1.3rem;font-weight:800}
  .cp-card .cp-t{margin:0 0 18px;font-size:.85rem;color:#a3a3a3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .cp-op{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;margin:0 0 10px;padding:15px 16px;border-radius:12px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.07);color:#fff;font:inherit;font-weight:700;font-size:.95rem;cursor:pointer;transition:background .2s,transform .2s,border-color .2s}
  .cp-op:hover,.cp-op:focus-visible{background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.3);transform:translateY(-1px);outline:none}
  .cp-op small{display:block;font-weight:500;font-size:.72rem;color:#a3a3a3;margin-top:2px}
  .cp-op span{text-align:left}
  .cp-op.rave{border-color:rgba(255,194,51,.4);background:rgba(255,194,51,.08)}
  .cp-cancelar{background:none;border:0;color:#a3a3a3;font:inherit;font-size:.9rem;padding:10px;cursor:pointer}
  .cp-cancelar:hover{color:#fff}

  .cp-root{position:fixed;inset:0;z-index:10001;background:#000;color:#fff;font-family:inherit;display:none;user-select:none;-webkit-user-select:none;touch-action:manipulation}
  .cp-root.on{display:block}
  .cp-root *{box-sizing:border-box}
  .cp-root{--cp-acc:#6A5ACD}
  .cp-root video,.cp-root iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#000;display:block}
  .cp-root video{object-fit:contain}
  .cp-ov{position:absolute;inset:0;z-index:10;display:flex;flex-direction:column;justify-content:space-between;background:linear-gradient(to bottom,rgba(0,0,0,.85) 0%,rgba(0,0,0,0) 25%,rgba(0,0,0,0) 70%,rgba(0,0,0,.9) 100%);transition:opacity .4s}
  .cp-ov.oculto{opacity:0;cursor:none}
  .cp-ov.oculto *{pointer-events:none}
  .cp-ov.so-topo{background:linear-gradient(to bottom,rgba(0,0,0,.85) 0%,rgba(0,0,0,0) 30%)}
  .cp-topo{display:flex;align-items:center;gap:20px;padding:30px 40px}
  .cp-voltar{display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:50%;border:0;background:rgba(255,255,255,.1);color:#fff;cursor:pointer;transition:.2s;flex-shrink:0}
  .cp-voltar:hover{background:rgba(255,255,255,.25);transform:scale(1.06)}
  .cp-meta{display:flex;flex-direction:column;min-width:0}
  .cp-titulo{font-size:22px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .cp-sub{font-size:13px;color:#a3a3a3;margin-top:4px;font-weight:500}
  .cp-marca{margin-left:auto;display:flex;align-items:center;gap:8px;font-weight:800;font-size:.95rem;flex-shrink:0}
  .cp-marca img{width:30px;height:30px}
  .cp-centro{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:5;pointer-events:none}
  .cp-spin{width:60px;height:60px;border:4px solid rgba(255,255,255,.12);border-left-color:var(--cp-acc);border-radius:50%;animation:cpgira 1s linear infinite;display:none}
  @keyframes cpgira{to{transform:rotate(360deg)}}
  .cp-baixo{padding:0 40px 25px;display:flex;flex-direction:column;gap:15px}
  .cp-linha{display:flex;gap:12px;align-items:center;min-height:0}
  .cp-prox{display:none;align-items:center;gap:8px;margin-left:auto;height:38px;padding:0 16px;border-radius:4px;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.15);color:#fff;font:inherit;font-size:12px;font-weight:700;cursor:pointer;transition:.2s}
  .cp-prox:hover{background:rgba(255,255,255,.28)}
  .cp-continuar{align-self:center;display:none;align-items:center;gap:18px;padding:10px 18px;border-radius:12px;background:rgba(10,10,10,.95);border:1.5px solid rgba(255,255,255,.2);font-size:.82rem;box-shadow:0 10px 30px rgba(0,0,0,.8)}
  .cp-continuar strong{color:var(--cp-acc)}
  .cp-continuar button{font:inherit;font-size:.75rem;font-weight:800;text-transform:uppercase;letter-spacing:.5px;border-radius:6px;padding:6px 14px;cursor:pointer;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.1);color:#fff}
  .cp-continuar button.sim{background:var(--cp-acc);border-color:transparent}
  .cp-continuar button.sim:hover{filter:brightness(1.1);transform:scale(1.05)}
  .cp-tl{display:flex;align-items:center;gap:15px;width:100%}
  .cp-barra{--h:4px;flex:1;height:22px;position:relative;cursor:pointer;touch-action:none}
  .cp-tl:hover .cp-barra{--h:6px}
  .cp-barra::before,.cp-buf,.cp-prog{content:'';position:absolute;left:0;top:50%;height:var(--h);margin-top:calc(var(--h) / -2);border-radius:3px;transition:height .1s,margin-top .1s}
  .cp-barra::before{right:0;background:rgba(255,255,255,.2)}
  .cp-buf{width:0;background:rgba(255,255,255,.2)}
  .cp-prog{width:0;background:#fff}
  .cp-prog::after{content:'';position:absolute;right:-6px;top:50%;width:12px;height:12px;border-radius:50%;background:#fff;transform:translateY(-50%) scale(0);transition:transform .1s}
  .cp-tl:hover .cp-prog::after,.cp-barra:focus-visible .cp-prog::after{transform:translateY(-50%) scale(1)}
  .cp-tempo{font-size:13px;font-weight:500;color:rgba(255,255,255,.9);font-feature-settings:"tnum";white-space:nowrap}
  .cp-bar{display:flex;align-items:center;justify-content:space-between;width:100%}
  .cp-esq,.cp-dir{display:flex;align-items:center;gap:25px}
  .cp-ic{display:flex;align-items:center;justify-content:center;background:none;border:0;color:rgba(255,255,255,.88);cursor:pointer;padding:4px;transition:.2s}
  .cp-ic:hover{color:#fff;transform:scale(1.12)}
  .cp-vol{display:flex;align-items:center;gap:8px}
  .cp-vol input{width:0;height:4px;-webkit-appearance:none;appearance:none;background:rgba(255,255,255,.25);border-radius:2px;outline:none;cursor:pointer;transition:width .3s;overflow:hidden}
  .cp-vol:hover input,.cp-vol input:focus{width:74px}
  .cp-vol input::-webkit-slider-thumb{-webkit-appearance:none;width:10px;height:10px;border-radius:50%;background:#fff;box-shadow:-100px 0 0 100px var(--cp-acc)}
  .cp-hud{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) scale(.9);z-index:30;display:inline-flex;align-items:center;gap:10px;padding:13px 22px;border-radius:999px;background:rgba(15,15,20,.85);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.18);font-size:.95rem;font-weight:700;pointer-events:none;opacity:0;transition:opacity .18s,transform .18s;white-space:nowrap}
  .cp-hud.on{opacity:1;transform:translate(-50%,-50%) scale(1)}
  .cp-toast{position:absolute;left:50%;bottom:110px;transform:translateX(-50%) translateY(20px);z-index:40;background:rgba(15,15,20,.9);border:1px solid rgba(255,255,255,.18);backdrop-filter:blur(10px);color:#fff;padding:10px 24px;border-radius:30px;font-size:.85rem;font-weight:600;opacity:0;pointer-events:none;transition:.35s;box-shadow:0 10px 25px rgba(0,0,0,.5);max-width:90%}
  .cp-toast.on{opacity:1;transform:translateX(-50%)}
  .cp-pular{position:absolute;right:40px;bottom:150px;z-index:30;display:none;align-items:center;gap:8px;height:44px;padding:0 26px;border-radius:4px;border:0;background:#fff;color:#000;font:inherit;font-weight:800;font-size:14px;letter-spacing:.5px;cursor:pointer;box-shadow:0 4px 15px rgba(0,0,0,.5);transition:background .2s,transform .2s}
  .cp-pular.on{display:flex;animation:cpPularEntra .3s ease}
  .cp-pular:hover,.cp-pular:focus-visible{background:#e2e2e2;outline:none;transform:scale(1.05)}
  .cp-pular kbd{font:inherit;font-size:.68rem;opacity:.65;border:1px solid currentColor;border-radius:4px;padding:0 5px}
  @keyframes cpPularEntra{from{opacity:0;transform:translateX(16px)}to{opacity:1;transform:none}}
  .cp-erro{position:absolute;inset:0;z-index:6;display:none;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:30px;text-align:center;background:#000}
  .cp-erro.on{display:flex}
  .cp-erro h3{margin:0;font-size:1.3rem}
  .cp-erro p{margin:0;color:#a3a3a3;font-size:.9rem}
  .cp-erro a{margin-top:12px;padding:12px 26px;border-radius:999px;background:var(--vermelho-esc,#b3202f);color:#fff;font-weight:700;text-decoration:none}
  @media (max-width:768px){
    .cp-topo{padding:15px 20px;gap:15px}
    .cp-titulo{font-size:16px}.cp-sub{font-size:11px}
    .cp-baixo{padding:0 20px 15px;gap:10px}
    .cp-esq,.cp-dir{gap:15px}
    .cp-marca span{display:none}
    .cp-vol input{display:none}
    .cp-prox{height:34px;padding:0 12px;font-size:.72rem}
    .cp-continuar{gap:10px;font-size:.74rem;padding:8px 12px}
    .cp-pular{right:20px;bottom:128px;height:38px;padding:0 18px;font-size:13px}
    .cp-pular kbd{display:none}
  }
  @media (pointer:coarse){.cp-pular kbd{display:none}}
  @media (max-height:480px){.cp-pular{bottom:92px;height:34px}}`;

  // ---------- estado ----------
  let raiz, video, iframe, ov, el = {};
  let opts = null, focoAnterior = null, timerOculta = null, timerContinuar = null, timerToast = null, timerHud = null;
  let retomarEm = 0, ultimoSalvo = 0, arrastando = false, montado = false;
  let segmentos = [], segAtivo = null, tokenSeg = 0;   // botão "Pular"

  // ---------- segmentos (TheIntroDB) ----------
  const SEG_CACHE = new Map();
  const SEG_TIPOS = ['intro', 'recap', 'credits', 'preview'];
  const SEG_ROTULO = { intro: 'Pular Abertura', recap: 'Pular Resumo', credits: 'Pular Créditos', preview: 'Pular Prévia' };

  /** Converte a resposta da TheIntroDB em [{tipo, ini, fim}] (segundos). start_ms null = 0; end_ms null = até o fim (fim: null). */
  function lerSegmentos(json) {
    const out = [];
    if (!json || typeof json !== 'object') return out;
    SEG_TIPOS.forEach((tipo) => {
      const lista = json[tipo];
      if (!Array.isArray(lista)) return;
      lista.forEach((x) => {
        if (!x || typeof x !== 'object') return;
        const ini = x.start_ms == null ? 0 : Number(x.start_ms) / 1000;
        const fim = x.end_ms == null ? null : Number(x.end_ms) / 1000;
        if (!Number.isFinite(ini) || ini < 0) return;
        if (fim !== null && (!Number.isFinite(fim) || fim <= ini)) return;
        out.push({ tipo, ini, fim });
      });
    });
    return out.sort((a, b) => a.ini - b.ini);
  }

  async function buscarSegmentos(tmdbId, temporada, episodio) {
    const id = Number(tmdbId);
    if (!Number.isInteger(id) || id <= 0) return [];
    const serie = temporada != null && episodio != null && Number.isInteger(Number(temporada)) && Number.isInteger(Number(episodio));
    const url = `https://api.theintrodb.org/v2/media?tmdb_id=${id}` + (serie ? `&season=${Number(temporada)}&episode=${Number(episodio)}` : '');
    if (SEG_CACHE.has(url)) return SEG_CACHE.get(url);
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), 6000) : null;
    try {
      const r = await fetch(url, ctl ? { signal: ctl.signal } : undefined);
      if (r.status === 404) { SEG_CACHE.set(url, []); return []; }
      if (!r.ok) return [];
      const lista = lerSegmentos(await r.json());
      SEG_CACHE.set(url, lista);
      return lista;
    } catch { return []; }
    finally { if (timer) clearTimeout(timer); }
  }

  /** Normaliza o que veio em opts.segmentos (array | Promise | função) e liga o botão. */
  function carregarSegmentos(o, embed) {
    segmentos = []; segAtivo = null; tokenSeg++;
    esconderPular();
    if (embed || !o.segmentos) return;
    const meu = tokenSeg;
    let src = o.segmentos;
    try { if (typeof src === 'function') src = src(); } catch { return; }
    Promise.resolve(src).then((lista) => {
      if (meu !== tokenSeg || !Array.isArray(lista)) return;
      segmentos = lista
        .map((x) => ({ tipo: String(x && x.tipo), ini: Number(x && x.ini) || 0, fim: x && x.fim != null && Number.isFinite(Number(x.fim)) ? Number(x.fim) : null }))
        .filter((x) => x.fim === null || x.fim > x.ini)
        .sort((a, b) => a.ini - b.ini);
      if (video && !video.paused) atualizarPular(video.currentTime);
    }).catch(() => {});
  }

  function esconderPular() { if (el.pular) { el.pular.classList.remove('on'); el.pular.removeAttribute('data-tipo'); } }

  /** Mostra o botão só quando o segmento ativo muda. */
  function atualizarPular(cur) {
    if (!segmentos.length || !el.pular) return;
    const dur = video.duration || 0;
    const seg = segmentos.find((x) => cur >= x.ini && cur < (x.fim === null ? (dur || Infinity) : x.fim));
    const chave = seg ? `${seg.tipo}@${seg.ini}` : null;
    if (chave === segAtivo) return;
    segAtivo = chave;
    if (!seg) { esconderPular(); return; }
    const proximoEp = seg.tipo === 'credits' && opts && opts.proximo;
    el.pular.dataset.tipo = seg.tipo;
    el.pular.querySelector('span').textContent = proximoEp ? 'Próximo Episódio' : (SEG_ROTULO[seg.tipo] || 'Pular');
    el.pular.classList.add('on');
  }

  function pularSegmento() {
    if (!el.pular || !el.pular.classList.contains('on') || !opts) return false;
    const seg = segmentos.find((x) => `${x.tipo}@${x.ini}` === segAtivo);
    esconderPular();
    if (!seg) return false;
    if (seg.tipo === 'credits' && opts.proximo) { salvarProgresso(true); opts.proximo(); return true; }
    const dur = video.duration || 0;
    video.currentTime = seg.fim === null ? Math.max(0, dur - 0.25) : Math.min(seg.fim, dur ? dur - 0.25 : seg.fim);
    return true;
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (s) => {
    if (!Number.isFinite(s) || s < 0) s = 0;
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60);
    const p = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${p(h)}:${p(m)}:${p(x)}` : `${p(m)}:${p(x)}`;
  };

  // ---------- progresso salvo ----------
  const lerProg = () => { try { const v = JSON.parse(localStorage.getItem(LS_PROGRESSO)); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
  const gravarProg = (o) => {
    try {
      const k = Object.keys(o);
      if (k.length > MAX_PROGRESSOS) k.sort((a, b) => o[a].t - o[b].t).slice(0, k.length - MAX_PROGRESSOS).forEach((x) => delete o[x]);
      localStorage.setItem(LS_PROGRESSO, JSON.stringify(o));
    } catch { /* sem storage: ignora */ }
  };
  function salvarProgresso(forcar) {
    if (!opts || !video || !(video.duration > 0)) return;
    const agora = Date.now();
    if (!forcar && agora - ultimoSalvo < 5000) return;
    ultimoSalvo = agora;
    const cur = video.currentTime, dur = video.duration, o = lerProg(), k = opts.chave || opts.videoUrl;
    if (cur > 10 && cur < dur - 30) o[k] = { time: cur, dur, t: agora };
    else delete o[k];
    gravarProg(o);
  }

  // ---------- montagem do DOM (uma vez) ----------
  function montar() {
    if (montado) return;
    montado = true;
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);

    el.escolha = document.createElement('div');
    el.escolha.className = 'cp-escolha';
    el.escolha.setAttribute('role', 'dialog');
    el.escolha.setAttribute('aria-modal', 'true');
    el.escolha.setAttribute('aria-labelledby', 'cpEscTitulo');
    el.escolha.innerHTML = `
      <div class="cp-card">
        <h2 id="cpEscTitulo">Como deseja assistir?</h2>
        <p class="cp-t" id="cpEscNome"></p>
        <button type="button" class="cp-op" data-op="interno">${svg('play', 20)}<span>Player Interno</span></button>
        <button type="button" class="cp-op rave" data-op="rave">${svg('pessoas', 20)}<span>Assistir no Rave<small>Abre a página do filme para o Rave reconhecer o vídeo</small></span></button>
        <button type="button" class="cp-cancelar" data-op="cancelar">Cancelar</button>
      </div>`;

    raiz = document.createElement('div');
    raiz.className = 'cp-root';
    raiz.setAttribute('role', 'dialog');
    raiz.setAttribute('aria-modal', 'true');
    raiz.setAttribute('aria-label', 'Player de vídeo');
    raiz.tabIndex = -1;
    raiz.innerHTML = `
      <video class="cp-video" playsinline preload="auto"></video>
      <iframe class="cp-iframe" allowfullscreen allow="autoplay; encrypted-media" style="display:none" title="Player"></iframe>
      <div class="cp-centro"><div class="cp-spin"></div></div>
      <div class="cp-hud" aria-live="polite"></div>
      <div class="cp-erro"><h3>Vídeo indisponível 😕</h3><p>O navegador bloqueou a conexão com o vídeo.</p><a href="#" class="cp-erro-link">Abrir Página Original</a></div>
      <div class="cp-ov">
        <div class="cp-topo">
          <button type="button" class="cp-voltar" aria-label="Voltar">${svg('voltar')}</button>
          <div class="cp-meta"><span class="cp-titulo"></span><span class="cp-sub"></span></div>
          <div class="cp-marca"><img src="/icones/logo.svg" alt="" onerror="this.remove()"><span>Clau Flix</span></div>
        </div>
        <div class="cp-baixo">
          <div class="cp-linha"><button type="button" class="cp-prox">${svg('proximo', 18)}<span>Próximo Episódio</span></button></div>
          <div class="cp-continuar">
            <span>Você parou em <strong class="cp-parou">00:00</strong>. Continuar?</span>
            <button type="button" class="sim">Sim</button><button type="button" class="nao">Não</button>
          </div>
          <div class="cp-tl">
            <button type="button" class="cp-ic cp-pp" aria-label="Reproduzir ou pausar">${svg('pause')}</button>
            <div class="cp-barra" role="slider" aria-label="Posição do vídeo" tabindex="0"><div class="cp-buf"></div><div class="cp-prog"></div></div>
            <span class="cp-tempo">00:00 / 00:00</span>
          </div>
          <div class="cp-bar">
            <div class="cp-esq">
              <button type="button" class="cp-ic cp-b10" aria-label="Voltar 10 segundos">${svg('volta10')}</button>
              <button type="button" class="cp-ic cp-f10" aria-label="Avançar 10 segundos">${svg('avanca10')}</button>
              <div class="cp-vol"><button type="button" class="cp-ic cp-mudo" aria-label="Som">${svg('som')}</button>
                <input type="range" class="cp-volume" min="0" max="1" step="0.05" value="1" aria-label="Volume"></div>
            </div>
            <div class="cp-dir">
              <button type="button" class="cp-ic cp-pip" aria-label="Picture-in-Picture">${svg('pip')}</button>
              <button type="button" class="cp-ic cp-tela" aria-label="Tela cheia">${svg('tela')}</button>
            </div>
          </div>
        </div>
      </div>
      <button type="button" class="cp-pular" aria-label="Pular">${svg('proximo', 20)}<span>Pular</span><kbd>S</kbd></button>
      <div class="cp-toast"></div>`;

    document.body.append(el.escolha, raiz);

    const q = (s) => raiz.querySelector(s);
    video = q('.cp-video'); iframe = q('.cp-iframe'); ov = q('.cp-ov');
    Object.assign(el, {
      titulo: q('.cp-titulo'), sub: q('.cp-sub'), spin: q('.cp-spin'), hud: q('.cp-hud'), toast: q('.cp-toast'),
      pular: q('.cp-pular'), erro: q('.cp-erro'), erroLink: q('.cp-erro-link'), prox: q('.cp-prox'), continuar: q('.cp-continuar'), parou: q('.cp-parou'),
      pp: q('.cp-pp'), barra: q('.cp-barra'), buf: q('.cp-buf'), prog: q('.cp-prog'), tempo: q('.cp-tempo'),
      mudo: q('.cp-mudo'), volume: q('.cp-volume'), pip: q('.cp-pip'), tela: q('.cp-tela'),
    });
    if (!document.pictureInPictureEnabled || !video.requestPictureInPicture) el.pip.style.display = 'none';

    ligarEventos();
  }

  // ---------- ações ----------
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('on');
    clearTimeout(timerToast);
    timerToast = setTimeout(() => el.toast.classList.remove('on'), 2400);
  }
  function hud(icone, texto) {
    el.hud.innerHTML = `${icone ? svg(icone, 20) : ''}<span>${esc(texto)}</span>`;
    el.hud.classList.add('on');
    clearTimeout(timerHud);
    timerHud = setTimeout(() => el.hud.classList.remove('on'), 700);
  }
  const ehVideoAtivo = () => video.style.display !== 'none';

  function mostrarControles() {
    ov.classList.remove('oculto');
    clearTimeout(timerOculta);
    if (ehVideoAtivo() && !video.paused) timerOculta = setTimeout(() => ov.classList.add('oculto'), 3000);
  }
  function alternar() {
    if (!ehVideoAtivo()) return;
    if (video.paused) { video.play().catch(() => {}); hud('play', 'Reproduzir'); } else { video.pause(); hud('pause', 'Pausado'); }
  }
  function pular(s) {
    if (!ehVideoAtivo()) return;
    const dur = Number.isFinite(video.duration) ? video.duration : Infinity;
    video.currentTime = Math.max(0, Math.min(dur, (video.currentTime || 0) + s));
    hud(s > 0 ? 'avanca10' : 'volta10', `${s > 0 ? '+' : '−'}${Math.abs(s)}s`);
  }
  function atualizarMudo() {
    const mudo = video.muted || video.volume === 0;
    el.mudo.innerHTML = svg(mudo ? 'mudo' : 'som');
    el.volume.value = video.muted ? 0 : video.volume;
  }
  function mudarVolume(v) {
    video.volume = Math.max(0, Math.min(1, v));
    video.muted = video.volume === 0;
    atualizarMudo();
  }
  function alternarMudo() { video.muted = !video.muted; if (!video.muted && video.volume === 0) video.volume = 0.5; atualizarMudo(); hud(video.muted ? 'mudo' : 'som', video.muted ? 'Sem som' : 'Som'); }
  function telaCheia() {
    const d = document;
    if (d.fullscreenElement || d.webkitFullscreenElement) { (d.exitFullscreen || d.webkitExitFullscreen).call(d); return; }
    const f = raiz.requestFullscreen || raiz.webkitRequestFullscreen;
    if (f) f.call(raiz).catch?.(() => {});
    else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen(); // iPhone
  }
  function pip() {
    if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
    else if (video.requestPictureInPicture) video.requestPictureInPicture().catch(() => toast('Picture-in-Picture indisponível'));
  }
  function posicaoDoToque(e) {
    const r = el.barra.getBoundingClientRect();
    const x = (e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX) - r.left;
    return Math.max(0, Math.min(1, x / r.width));
  }
  function buscar(e) {
    if (video.duration > 0) video.currentTime = posicaoDoToque(e) * video.duration;
  }
  function fecharContinuar() {
    el.continuar.style.display = 'none';
    retomarEm = 0;
    clearTimeout(timerContinuar);
  }
  function mostrarContinuar(t) {
    retomarEm = t;
    el.parou.textContent = fmt(t);
    el.continuar.style.display = 'flex';
    clearTimeout(timerContinuar);
    timerContinuar = setTimeout(fecharContinuar, 12000);
  }

  function aoErro() {
    el.spin.style.display = 'none';
    el.erro.classList.add('on');
    ov.classList.add('so-topo');
    ov.classList.remove('oculto');
    clearTimeout(timerOculta);
  }

  function fechar(chamarCallback = true) {
    if (!raiz || !raiz.classList.contains('on')) return;
    salvarProgresso(true);
    if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
    video.pause();
    video.removeAttribute('src');
    video.load();
    iframe.src = 'about:blank';
    raiz.classList.remove('on');
    document.body.style.overflow = '';
    fecharContinuar();
    segmentos = []; segAtivo = null; tokenSeg++; esconderPular();
    clearTimeout(timerOculta);
    const cb = opts && opts.aoFechar;
    opts = null;
    if (focoAnterior && focoAnterior.focus) focoAnterior.focus();
    if (chamarCallback && cb) cb();
  }

  function ligarEventos() {
    raiz.querySelector('.cp-voltar').addEventListener('click', () => fechar());
    el.pp.addEventListener('click', alternar);
    raiz.querySelector('.cp-b10').addEventListener('click', () => pular(-10));
    raiz.querySelector('.cp-f10').addEventListener('click', () => pular(10));
    el.mudo.addEventListener('click', alternarMudo);
    el.volume.addEventListener('input', () => mudarVolume(parseFloat(el.volume.value)));
    el.pip.addEventListener('click', pip);
    el.tela.addEventListener('click', telaCheia);
    el.pular.addEventListener('click', pularSegmento);
    el.prox.addEventListener('click', () => { if (opts && opts.proximo) { salvarProgresso(true); opts.proximo(); } });
    el.continuar.querySelector('.sim').addEventListener('click', () => { if (retomarEm > 0) { video.currentTime = retomarEm; toast('Reprodução retomada de onde você parou'); } fecharContinuar(); });
    el.continuar.querySelector('.nao').addEventListener('click', fecharContinuar);

    // barra de progresso: clique + arrastar (mouse e toque)
    el.barra.addEventListener('mousedown', (e) => { arrastando = true; buscar(e); });
    document.addEventListener('mousemove', (e) => { if (arrastando) buscar(e); });
    document.addEventListener('mouseup', () => { arrastando = false; });
    el.barra.addEventListener('touchstart', (e) => { arrastando = true; buscar(e); }, { passive: true });
    document.addEventListener('touchmove', (e) => { if (arrastando) buscar(e); }, { passive: true });
    document.addEventListener('touchend', () => { arrastando = false; });
    el.barra.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') { pular(-5); e.stopPropagation(); } if (e.key === 'ArrowRight') { pular(5); e.stopPropagation(); } });

    // clique no vídeo: mostra controles; se já visíveis, play/pause
    video.addEventListener('click', () => { if (ov.classList.contains('oculto')) mostrarControles(); else { alternar(); mostrarControles(); } });
    raiz.addEventListener('mousemove', mostrarControles);
    raiz.addEventListener('touchstart', mostrarControles, { passive: true });

    video.addEventListener('timeupdate', () => {
      const cur = video.currentTime, dur = video.duration || 0;
      el.tempo.textContent = `${fmt(cur)} / ${fmt(dur)}`;
      if (dur > 0) { el.prog.style.width = `${(cur / dur) * 100}%`; el.barra.setAttribute('aria-valuenow', Math.round((cur / dur) * 100)); }
      salvarProgresso(false);
      atualizarPular(cur);
    });
    video.addEventListener('progress', () => {
      if (video.buffered.length && video.duration > 0) el.buf.style.width = `${(video.buffered.end(video.buffered.length - 1) / video.duration) * 100}%`;
    });
    video.addEventListener('loadedmetadata', () => {
      const salvo = lerProg()[opts && (opts.chave || opts.videoUrl)];
      if (salvo && salvo.time > 10 && salvo.time < video.duration - 30) mostrarContinuar(salvo.time);
    });
    video.addEventListener('waiting', () => { el.spin.style.display = 'block'; });
    video.addEventListener('canplay', () => { el.spin.style.display = 'none'; });
    video.addEventListener('playing', () => { el.spin.style.display = 'none'; el.pp.innerHTML = svg('pause'); mostrarControles(); });
    video.addEventListener('pause', () => { el.pp.innerHTML = svg('play'); ov.classList.remove('oculto'); clearTimeout(timerOculta); });
    video.addEventListener('volumechange', atualizarMudo);
    video.addEventListener('error', aoErro);
    video.addEventListener('ended', () => {
      const o = lerProg(); if (opts) { delete o[opts.chave || opts.videoUrl]; gravarProg(o); }
      if (opts && opts.proximo) { toast('Iniciando próximo episódio...'); const atual = opts; setTimeout(() => { if (opts === atual) atual.proximo(); }, 2000); }
    });

    document.addEventListener('fullscreenchange', () => { el.tela.setAttribute('aria-pressed', String(!!document.fullscreenElement)); });

    // atalhos de teclado
    document.addEventListener('keydown', (e) => {
      if (!raiz.classList.contains('on')) {
        if (e.key === 'Escape' && el.escolha.classList.contains('on')) fecharEscolha();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const alvoBotao = e.target.closest && e.target.closest('button');
      switch (e.key) {
        case 'Escape': if (!document.fullscreenElement) fechar(); break;
        case ' ': case 'k': if (alvoBotao && e.key === ' ') return; e.preventDefault(); alternar(); mostrarControles(); break;
        case 'Enter': if (alvoBotao) return; alternar(); mostrarControles(); break;
        case 'ArrowLeft': e.preventDefault(); pular(-10); mostrarControles(); break;
        case 'ArrowRight': e.preventDefault(); pular(10); mostrarControles(); break;
        case 'ArrowUp': e.preventDefault(); mudarVolume(video.volume + 0.1); hud('som', `Volume ${Math.round(video.volume * 100)}%`); break;
        case 'ArrowDown': e.preventDefault(); mudarVolume(video.volume - 0.1); hud('som', `Volume ${Math.round(video.volume * 100)}%`); break;
        case 's': case 'S': if (!pularSegmento()) return; mostrarControles(); break;
        case 'm': case 'M': alternarMudo(); break;
        case 'f': case 'F': telaCheia(); break;
        default: return;
      }
    });

    // escolha
    el.escolha.addEventListener('click', (e) => {
      const op = e.target.closest('[data-op]');
      if (!op && e.target !== el.escolha) return;
      const acao = op ? op.dataset.op : 'cancelar';
      const o = pendente;
      fecharEscolha();
      if (!o) return;
      if (acao === 'interno') abrir(o);
      else if (acao === 'rave') { if (o.aoIniciar) o.aoIniciar(); window.location.href = o.link; } // a página original é lida pelo Rave (mesmo comportamento do celular)
    });
  }

  let pendente = null;
  function fecharEscolha() {
    el.escolha.classList.remove('on');
    if (focoAnterior && focoAnterior.focus && !raiz.classList.contains('on')) focoAnterior.focus();
  }

  // ---------- API ----------
  function escolher(o) {
    montar();
    if (!o.videoUrl || !String(o.videoUrl).trim() || o.videoUrl === 'undefined') {
      alert('Link do vídeo não encontrado no catálogo. Abrindo página original.');
      window.location.href = o.link;
      return;
    }
    pendente = o;
    focoAnterior = document.activeElement;
    el.escolha.querySelector('#cpEscNome').textContent = o.titulo + (o.subtitulo ? ` · ${o.subtitulo}` : '');
    el.escolha.classList.add('on');
    el.escolha.querySelector('[data-op="interno"]').focus();
  }

  function abrir(o) {
    montar();
    if (raiz.classList.contains('on')) salvarProgresso(true); // troca de episódio
    else focoAnterior = focoAnterior || document.activeElement;
    opts = o;
    if (o.aoIniciar) o.aoIniciar();
    el.titulo.textContent = o.titulo || '';
    el.sub.textContent = o.subtitulo || '';
    el.erroLink.href = o.link || '#';
    el.erro.classList.remove('on');
    ov.classList.remove('so-topo', 'oculto');
    fecharContinuar();
    segmentos = []; segAtivo = null; tokenSeg++; esconderPular();   // zera o botão "Pular"
    el.prog.style.width = '0'; el.buf.style.width = '0';
    el.tempo.textContent = '00:00 / 00:00';
    el.prox.style.display = o.proximo ? 'flex' : 'none';
    if (o.proximo) el.prox.querySelector('span').textContent = o.rotuloProximo || 'Próximo Episódio';
    raiz.classList.add('on');
    document.body.style.overflow = 'hidden';
    raiz.focus();
    atualizarMudo();

    const url = String(o.videoUrl);
    // Arquivo de vídeo NUNCA é embed (ex.: oneplayer.site tem "player" no nome mas é .mp4)
    const ehArquivo = /\.(mp4|webm|m4v|mov|ogv|ogg)(\?|#|$)/i.test(url);
    const ehEmbed = !ehArquivo && /youtube\.com|youtu\.be|vimeo\.com|tankie\.tube|dailymotion|\/embed\//i.test(url);

    carregarSegmentos(o, ehEmbed);   // embed/iframe: sem botão Pular
    if (ehEmbed) {
      video.pause(); video.removeAttribute('src'); video.style.display = 'none';
      iframe.style.display = 'block'; iframe.src = url;
      ov.classList.add('so-topo'); el.spin.style.display = 'none';
      el.tempo.parentElement.style.display = 'none'; raiz.querySelector('.cp-bar').style.display = 'none';
      return;
    }
    iframe.style.display = 'none'; iframe.src = 'about:blank';
    video.style.display = 'block';
    el.tempo.parentElement.style.display = ''; raiz.querySelector('.cp-bar').style.display = '';
    // vídeos http:// são bloqueados em páginas https: passam pelo Worker
    const tocar = url.startsWith('http://') && o.workerUrl && location.protocol === 'https:' ? `${o.workerUrl}?url=${encodeURIComponent(url)}` : url;
    el.spin.style.display = 'block';
    video.src = tocar;
    video.play().catch(() => { el.pp.innerHTML = svg('play'); el.spin.style.display = 'none'; });
  }

  window.ClauPlayer = { escolher, abrir, fechar, buscarSegmentos };
})();
