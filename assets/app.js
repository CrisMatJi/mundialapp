// Mundial 26 — port del diseño "Mundial 26.dc.html" a web vanilla, cableado a datos reales.
// Datos: /data/*.json (openfootball + clasificación calculada + API-Football en vivo).
import { META, GROUP_HEADS, metaFor } from './teams-meta.js';

const MY = 'Spain';                 // "Mi selección" (cámbialo aquí si quieres otra)
const OWNER = 'Cristian Mateos Jiménez'; // dueño de la web (aparece en el footer)
const ROUND_ES = {
  'Round of 32': 'Dieciseisavos de final', 'Round of 16': 'Octavos de final',
  'Quarter-final': 'Cuartos de final', 'Semi-final': 'Semifinal',
  'Match for third place': 'Tercer puesto', 'Final': 'Final'
};
// Árbol de eliminatorias del Mundial 26 (el id de cada partido = código "P" de la FIFA).
// Cada partido apunta a los dos que lo alimentan (feeders). Estructura fija del torneo.
const BRACKET_TREE = {
  89: [74, 77], 90: [73, 75], 91: [76, 78], 92: [79, 80],
  93: [83, 84], 94: [81, 82], 95: [86, 88], 96: [85, 87],
  97: [89, 90], 98: [93, 94], 99: [91, 92], 100: [95, 96],
  101: [97, 98], 102: [99, 100], 104: [101, 102]
};
// Columnas del bracket. El orden vertical de cada ronda se deriva del árbol (DFS desde
// la final) para que los dos feeders de cada partido queden verticalmente adyacentes.
const bracketLeaves = id => { const f = BRACKET_TREE[id]; return f ? [...bracketLeaves(f[0]), ...bracketLeaves(f[1])] : [id]; };
const bracketLevel = (id, d) => { if (d === 0) return [id]; const f = BRACKET_TREE[id]; return f ? [...bracketLevel(f[0], d - 1), ...bracketLevel(f[1], d - 1)] : []; };
const BRACKET_COLS = [
  { round: 'Round of 32', name: 'Dieciseisavos', ids: bracketLevel(104, 4) },
  { round: 'Round of 16', name: 'Octavos', ids: bracketLevel(104, 3) },
  { round: 'Quarter-final', name: 'Cuartos', ids: bracketLevel(104, 2) },
  { round: 'Semi-final', name: 'Semifinales', ids: bracketLevel(104, 1) },
  { round: 'Final', name: 'Final', ids: [104] }
];

// --- Estado y datos ----------------------------------------------------------
const state = { screen: 'inicio', open: null, onlyEsp: false, resTeam: 'all', resDate: 'all' };
let MATCHES = [];          // enriquecidos
let BY_ID = new Map();
let STANDINGS = { groups: [] };
let LIVE = { live: [] };
let LIVE_BY_FID = new Map();   // id de fixture (API) -> entrada en vivo
let LIVE_BY_PAIR = new Map();  // "home|away" -> entrada en vivo (para solapar sobre fixtures)
let FLAGS = new Map();     // nombre de selección -> URL de bandera (flagcdn)
let UPCOMING = [];
let NEXT_ESP = null;
let HERO = null;           // partido destacado del hero (España si juega, si no el próximo del torneo)
let MY_GROUP = null;
let countdownTimer = null;
let openComboKind = null;  // 'team' | 'date' | null — selector de filtro abierto
let teamQuery = '';        // texto del buscador de selección

// --- Utilidades --------------------------------------------------------------
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function fmt(iso) {
  if (!iso) return { day: '--', mon: '', time: '', label: 'Por definir', full: 'Por definir' };
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, '0');
  const mon = d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '').toUpperCase();
  const time = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const full = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  return { day, mon, time, label: `${day} ${mon} · ${time}`, full };
}
const roundEs = r => ROUND_ES[r] || (r && r.startsWith('Matchday') ? 'Fase de grupos' : (r || ''));
// Etiqueta de a qué corresponde un partido: "Grupo X" en fase de grupos, la ronda en eliminatorias.
const matchLabel = m => m.group ? `Grupo ${m.group}` : roundEs(m.round);
const capFirst = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

// Bandera del país (o caja de color con código si es un "Por definir").
function badge(meta, o = {}) {
  const { w = 34, h = 23, fs = 10, r = 6 } = o;
  const flag = FLAGS.get(meta.name);
  if (flag) return `<img src="${flag}" alt="${esc(meta.es)}" width="${w}" height="${h}" loading="lazy" style="width:${w}px;height:${h}px;border-radius:${r}px;object-fit:cover;flex:none;display:inline-block;vertical-align:middle;box-shadow:0 0 0 1px rgba(11,27,43,.12);">`;
  return `<span style="display:inline-flex;align-items:center;justify-content:center;width:${w}px;height:${h}px;border-radius:${r}px;font-family:'Archivo';font-weight:800;font-size:${fs}px;color:#fff;background:${meta.color};flex:none;">${esc(meta.code)}</span>`;
}
// Variante que rellena su contenedor al 100% (para los escudos grandes del hero/modal).
function flagFill(meta, fs) {
  const flag = FLAGS.get(meta.name);
  if (flag) return `<img src="${flag}" alt="${esc(meta.es)}" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;">`;
  return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:${meta.color};"><span style="font-family:'Archivo';font-weight:900;font-size:${fs}px;color:#fff;">${esc(meta.code)}</span></div>`;
}

function enrich(m) {
  return { ...m, a: metaFor(m.home), b: metaFor(m.away), f: fmt(m.kickoff), isEsp: m.home === MY || m.away === MY };
}

// --- Carga -------------------------------------------------------------------
async function loadJSON(p) {
  try { const r = await fetch(p, { cache: 'no-store' }); return r.ok ? await r.json() : null; }
  catch { return null; }
}

// El marcador en vivo vive en la rama `live-data` (así los cambios de marcador NO
// redespliegan la web). Se lee directo de raw.githubusercontent con cache-buster;
// si fallara, cae al seed incluido en el repo.
const LIVE_URL = 'https://raw.githubusercontent.com/CrisMatJi/mundialapp/live-data/live.json';
async function loadLive() {
  return (await loadJSON(`${LIVE_URL}?t=${Date.now()}`)) || (await loadJSON('./data/live.json'));
}

async function init() {
  const [standings, matchesDoc, live, teamsDoc] = await Promise.all([
    loadJSON('./data/standings.json'), loadJSON('./data/matches.json'),
    loadLive(), loadJSON('./data/teams.json')
  ]);
  STANDINGS = standings || { groups: [] };
  LIVE = live || { live: [] };
  FLAGS = new Map((teamsDoc?.teams || []).map(t => [t.name, t.flag]).filter(([, f]) => f));
  buildLiveMaps();
  MATCHES = (matchesDoc?.matches || []).map(enrich);
  BY_ID = new Map(MATCHES.map(m => [m.id, m]));
  UPCOMING = MATCHES.filter(m => m.status === 'scheduled' && m.kickoff).sort((x, y) => x.kickoff.localeCompare(y.kickoff));
  NEXT_ESP = UPCOMING.find(m => m.isEsp) || null;
  HERO = NEXT_ESP || UPCOMING[0] || null;
  MY_GROUP = STANDINGS.groups.find(g => g.table.some(t => t.team === MY)) || null;

  applyHash();
  window.addEventListener('hashchange', applyHash);
  // Enlaces directos: ?match=<id> abre una ficha; ?live=<fid> abre un partido en vivo.
  const params = new URLSearchParams(location.search);
  const mq = params.get('match'), lq = params.get('live');
  if (lq && LIVE_BY_FID.has(Number(lq))) { state.open = openLive(LIVE_BY_FID.get(Number(lq))); renderApp(); }
  else if (mq && BY_ID.has(Number(mq))) { state.open = BY_ID.get(Number(mq)); renderApp(); }
  startCountdown();
  setInterval(refreshLive, 30000);
}

// --- En vivo: índices y solapado ---------------------------------------------
function buildLiveMaps() {
  LIVE_BY_FID = new Map((LIVE.live || []).map(x => [x.id, x]));
  LIVE_BY_PAIR = new Map();
  for (const x of (LIVE.live || [])) {
    LIVE_BY_PAIR.set(`${x.home}|${x.away}`, x);
    LIVE_BY_PAIR.set(`${x.away}|${x.home}`, x);
  }
}
function liveFor(m) { return LIVE_BY_PAIR.get(`${m.home}|${m.away}`) || null; }
function openLive(item) {
  return { ...item, __live: true, a: metaFor(item.home), b: metaFor(item.away) };
}

// --- Avisos: toasts in-app + notificación del navegador ----------------------
function alertsOn() { try { return localStorage.getItem('wc26-alerts') !== 'off'; } catch { return true; } }
function bellButton() {
  const on = alertsOn();
  return `<button data-action="toggleAlerts" title="${on ? 'Avisos activados' : 'Avisos silenciados'}" aria-label="Avisos" style="flex:none;width:42px;height:42px;border-radius:11px;border:1.5px solid ${on ? '#FFD2DF' : '#E6EBF0'};background:${on ? '#FFF1F5' : '#fff'};cursor:pointer;font-size:17px;line-height:1;">${on ? '🔔' : '🔕'}</button>`;
}
function showToast(title, body, m) {
  let host = document.getElementById('toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    host.style.cssText = 'position:fixed;z-index:80;right:16px;bottom:16px;display:flex;flex-direction:column;gap:10px;max-width:340px;width:calc(100vw - 32px);pointer-events:none;';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.style.cssText = 'pointer-events:auto;background:#fff;border:1px solid #EDF1F6;border-left:4px solid #FF2D7E;border-radius:14px;padding:13px 15px;box-shadow:0 18px 40px -18px rgba(11,27,43,.5);cursor:pointer;transform:translateX(120%);transition:transform .35s cubic-bezier(.2,.8,.2,1);';
  el.innerHTML = `<div style="font-family:'Archivo';font-weight:800;font-size:14px;${body ? 'margin-bottom:3px;' : ''}">${esc(title)}</div>${body ? `<div style="font-size:13px;color:#5B6B7B;">${esc(body)}</div>` : ''}`;
  el.addEventListener('click', () => {
    if (m && LIVE_BY_FID.has(m.id)) { state.open = openLive(LIVE_BY_FID.get(m.id)); renderApp(); }
    el.remove();
  });
  host.appendChild(el);
  requestAnimationFrame(() => { el.style.transform = 'translateX(0)'; });
  setTimeout(() => { el.style.transform = 'translateX(120%)'; setTimeout(() => el.remove(), 380); }, 6500);
}
function notify(title, body, m) {
  if (!alertsOn()) return;
  showToast(title, body, m);
  if ('Notification' in window && Notification.permission === 'granted') {
    try { new Notification(title, { body, tag: m ? 'wc-' + m.id : undefined }); } catch {}
  }
}
// Goles e inicios de partido: compara el live anterior con el nuevo.
function detectAndNotify(oldList, newList) {
  if (!alertsOn()) return;
  const oldById = new Map((oldList || []).map(x => [x.id, x]));
  for (const m of (newList || [])) {
    const o = oldById.get(m.id);
    if (!o) {
      if ((m.homeScore || 0) + (m.awayScore || 0) === 0)
        notify('🟢 Empieza el partido', `${metaFor(m.home).es} vs ${metaFor(m.away).es}`, m);
      continue;
    }
    if ((m.homeScore || 0) + (m.awayScore || 0) > (o.homeScore || 0) + (o.awayScore || 0)) {
      const scoredHome = (m.homeScore || 0) > (o.homeScore || 0);
      const team = scoredHome ? metaFor(m.home) : metaFor(m.away);
      const goals = (m.events || []).filter(e => e.type === 'Goal');
      const last = goals[goals.length - 1];
      const who = last && last.player ? ` · ${last.player} ${last.minute || ''}'` : '';
      notify(`⚽ ¡Gol de ${team.es}!`, `${metaFor(m.home).es} ${m.homeScore ?? 0}-${m.awayScore ?? 0} ${metaFor(m.away).es}${who}`, m);
    }
  }
}

const VALID_SCREENS = ['inicio', 'calendario', 'grupos', 'bracket', 'resultados'];
function applyHash() {
  const h = location.hash.replace('#', '');
  state.screen = VALID_SCREENS.includes(h) ? h : 'inicio';
  state.open = null;
  renderApp();
}

// --- Cabecera ----------------------------------------------------------------
function navBtn(key, label) {
  const active = state.screen === key;
  const style = 'flex:none;padding:9px 15px;border-radius:11px;border:none;cursor:pointer;font-family:Hanken Grotesk;font-weight:700;font-size:14px;white-space:nowrap;transition:all .2s;'
    + (active ? 'color:#fff;background:linear-gradient(120deg,#FF2D7E,#7C4DFF);box-shadow:0 8px 18px -10px rgba(124,77,255,.8);' : 'color:#5B6B7B;background:transparent;');
  return `<button data-action="go" data-screen="${key}" style="${style}">${label}</button>`;
}
function header() {
  const nav = [['inicio', 'Inicio'], ['calendario', 'Calendario'], ['grupos', 'Grupos'], ['bracket', 'Eliminatorias'], ['resultados', 'Resultados']]
    .map(([k, l]) => navBtn(k, l)).join('');
  return `
  <header style="position:sticky;top:0;z-index:40;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);background:rgba(255,255,255,.74);border-bottom:1px solid #E6EBF0;">
    <div class="header-inner">
      <div data-action="go" data-screen="inicio" style="display:flex;align-items:center;gap:11px;cursor:pointer;flex:none;">
        <div style="width:40px;height:40px;border-radius:11px;background:linear-gradient(135deg,#FF2D7E,#7C4DFF 55%,#1D6FF2);display:flex;align-items:center;justify-content:center;box-shadow:0 8px 20px -8px rgba(124,77,255,.7);">
          <span style="font-family:'Archivo';font-weight:900;font-size:17px;color:#fff;letter-spacing:-1px;">26</span>
        </div>
        <div style="line-height:1;">
          <div style="font-family:'Archivo';font-weight:900;font-size:15px;letter-spacing:.5px;">MUNDIAL</div>
          <div style="font-size:10px;font-weight:700;letter-spacing:2.5px;color:#8A98A8;margin-top:2px;">USA·CAN·MEX</div>
        </div>
      </div>
      <nav id="main-nav" class="main-nav">${nav}</nav>
      <div class="header-right">
        ${bellButton()}
        <button data-action="go" data-screen="grupos" class="mi-seleccion" style="flex:none;display:flex;align-items:center;gap:8px;padding:8px 13px;border-radius:11px;border:1.5px solid #FFD2DF;background:#FFF1F5;cursor:pointer;">
          ${badge(metaFor(MY), { w: 30, h: 21, fs: 10, r: 5 })}
          <span style="font-size:13px;font-weight:700;color:#C8102E;">Mi selección</span>
        </button>
        <button data-action="toggleMenu" class="nav-toggle" aria-label="Abrir menú" style="font-size:19px;">☰</button>
      </div>
    </div>
  </header>`;
}

// --- Pie de página (atribución) ----------------------------------------------
function footer() {
  const year = new Date().getFullYear();
  return `<footer style="border-top:1px solid #E6EBF0;background:rgba(255,255,255,.55);">
    <div style="max-width:1200px;margin:0 auto;padding:22px 20px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;color:#8A98A8;font-size:13px;">
      <div style="display:flex;align-items:center;gap:9px;">
        <div style="width:26px;height:26px;border-radius:8px;background:linear-gradient(135deg,#FF2D7E,#7C4DFF 55%,#1D6FF2);display:flex;align-items:center;justify-content:center;flex:none;"><span style="font-family:'Archivo';font-weight:900;font-size:11px;color:#fff;">26</span></div>
        <span>Mundial 26 · Una web de <strong style="color:#5B6B7B;">${esc(OWNER)}</strong> · © ${year}</span>
      </div>
      <div style="font-size:12px;">Datos: openfootball &amp; API-Football</div>
    </div></footer>`;
}

// --- Banner en vivo ----------------------------------------------------------
function liveBannerHTML() {
  const items = LIVE.live || [];
  if (!items.length) return `<div id="live-banner"></div>`;
  const pills = items.map(x =>
    `<span data-action="open-live" data-fid="${x.id}" style="display:inline-flex;align-items:center;gap:8px;cursor:pointer;"><span class="live-dot-css" style="width:9px;height:9px;border-radius:50%;background:#fff;"></span>${esc(metaFor(x.home).es)} ${x.homeScore ?? 0}-${x.awayScore ?? 0} ${esc(metaFor(x.away).es)} (${x.minute ?? ''}')</span>`
  ).join('');
  return `<div id="live-banner" style="background:linear-gradient(90deg,#FF2D7E,#C9184A);color:#fff;font-weight:700;padding:10px 0;">
    <div style="max-width:1200px;margin:0 auto;padding:0 20px;display:flex;gap:22px;justify-content:center;flex-wrap:wrap;">${pills}</div></div>`;
}
async function refreshLive() {
  if (openComboKind) return; // no interrumpir mientras se usa un selector de filtro
  const l = await loadLive();
  if (!l) return;
  if (JSON.stringify(l.live) === JSON.stringify(LIVE.live)) return; // sin cambios
  const prev = LIVE.live || [];
  LIVE = l; buildLiveMaps();
  detectAndNotify(prev, LIVE.live || []); // avisos de gol / inicio de partido
  // Si hay un modal en vivo abierto, lo refrescamos con los datos nuevos.
  if (state.open && state.open.__live) {
    const fresh = LIVE_BY_FID.get(state.open.id);
    state.open = fresh ? openLive(fresh) : null;
  }
  renderApp();
}

// --- Pantalla: Inicio --------------------------------------------------------
function cdCell(key, grad, label) {
  return `<div style="text-align:center;background:#F3F5FA;border-radius:16px;padding:14px 6px;">
    <div data-cd="${key}" style="font-family:'Archivo';font-weight:900;font-size:clamp(28px,5vw,46px);line-height:1;letter-spacing:-1px;background:${grad};-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;">00</div>
    <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;color:#8A98A8;margin-top:6px;">${label}</div></div>`;
}
function teamBig(meta) {
  return `<div style="text-align:center;flex:1;max-width:200px;">
    <div style="width:clamp(64px,9vw,96px);height:clamp(64px,9vw,96px);margin:0 auto;border-radius:22px;overflow:hidden;box-shadow:0 16px 30px -14px ${meta.color};">
      ${flagFill(meta, 26)}</div>
    <div style="font-weight:800;font-size:clamp(15px,1.8vw,18px);margin-top:12px;">${esc(meta.es)}</div></div>`;
}
function nextMatchCard() {
  const m = HERO;
  if (!m) return '';
  const label = m.isEsp ? `PRÓXIMO PARTIDO · ${esc(metaFor(MY).es).toUpperCase()}` : 'PRÓXIMO PARTIDO';
  const live = (LIVE.live || []).length > 0;
  return `<div data-anim style="position:relative;border-radius:28px;padding:2px;background:linear-gradient(120deg,#FF2D7E,#7C4DFF,#1D6FF2);animation:glowring 4.5s ease-in-out infinite;margin-bottom:40px;">
    <div style="border-radius:26px;background:#fff;padding:clamp(20px,3vw,36px);overflow:hidden;position:relative;">
      <div style="position:absolute;top:-40px;right:-30px;width:180px;height:180px;background:radial-gradient(circle,#7C4DFF14,transparent 70%);"></div>
      <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:18px;margin-bottom:24px;">
        <div>
          <div style="font-size:12px;font-weight:800;letter-spacing:2px;color:#FF2D7E;">${label}</div>
          <div style="font-family:'Archivo';font-weight:800;font-size:clamp(20px,2.6vw,30px);margin-top:4px;">${esc(roundEs(m.round))}</div>
        </div>
        <div style="text-align:right;font-size:13px;color:#5B6B7B;font-weight:600;line-height:1.5;">
          <div>${esc(m.f.full)} · ${esc(m.f.time)}</div>
          <div style="color:#8A98A8;">${esc(m.venue || '')}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:center;gap:clamp(16px,5vw,64px);margin:10px 0 28px;">
        ${teamBig(m.a)}
        <div style="font-family:'Archivo';font-weight:900;font-size:clamp(22px,3vw,34px);color:#C9D4E0;letter-spacing:1px;">VS</div>
        ${teamBig(m.b)}
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:clamp(8px,1.5vw,16px);max-width:520px;margin:0 auto 24px;">
        ${cdCell('d', 'linear-gradient(135deg,#FF2D7E,#7C4DFF)', 'DÍAS')}
        ${cdCell('h', 'linear-gradient(135deg,#7C4DFF,#1D6FF2)', 'HORAS')}
        ${cdCell('m', 'linear-gradient(135deg,#1D6FF2,#16C784)', 'MIN')}
        ${cdCell('s', 'linear-gradient(135deg,#16C784,#FFC23D)', 'SEG')}
      </div>
      <div style="text-align:center;">
        <button data-action="open" data-id="${m.id}" class="btn-press" style="padding:13px 26px;border-radius:13px;border:none;background:linear-gradient(120deg,#FF2D7E,#7C4DFF);color:#fff;font-weight:800;font-size:15px;cursor:pointer;box-shadow:0 14px 28px -12px rgba(124,77,255,.7);">Ver detalle del partido →</button>
      </div>
    </div></div>`;
}
function miniMatchRow(m) {
  const lv = liveFor(m);
  const action = lv ? `data-action="open-live" data-fid="${lv.id}"` : `data-action="open" data-id="${m.id}"`;
  const dateCol = lv
    ? `<div style="font-size:11px;font-weight:800;color:#FF2D7E;width:54px;flex:none;display:flex;align-items:center;gap:5px;"><span class="live-dot-css" style="width:7px;height:7px;border-radius:50%;background:#FF2D7E;"></span>${lv.minute ?? ''}'</div>`
    : `<div style="font-size:11px;font-weight:800;color:#8A98A8;width:54px;line-height:1.3;flex:none;">${m.f.day} ${m.f.mon}<br><span style="color:#0B1B2B;">${m.f.time}</span></div>`;
  const mid = lv
    ? `<span style="font-family:'Archivo';font-weight:900;font-size:14px;color:#FF2D7E;">${lv.homeScore ?? 0}-${lv.awayScore ?? 0}</span>`
    : `<span style="font-size:11px;font-weight:800;color:#C9D4E0;">vs</span>`;
  return `<div ${action} class="hov-slide" style="display:flex;flex-direction:column;gap:7px;padding:10px 12px;border-radius:14px;background:${lv ? '#FFF1F5' : (m.isEsp ? '#FFF7FA' : '#F8FAFD')};cursor:pointer;border:1px solid ${lv ? '#FFD2DF' : (m.isEsp ? '#FFE0EA' : '#EDF1F6')};">
    <span style="font-size:9px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:${m.group ? '#7C4DFF' : '#FF2D7E'};">${esc(matchLabel(m))}</span>
    <div style="display:flex;align-items:center;gap:12px;">
      ${dateCol}
      <div style="display:flex;align-items:center;gap:7px;flex:1;min-width:0;">${badge(m.a)}<span style="font-size:13px;font-weight:700;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(m.a.es)}</span></div>
      ${mid}
      <div style="display:flex;align-items:center;gap:7px;flex:1;min-width:0;justify-content:flex-end;"><span style="font-size:13px;font-weight:700;flex:1;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(m.b.es)}</span>${badge(m.b)}</div>
    </div>
  </div>`;
}
function groupMiniTable(g) {
  const allPlayed = g.table.every(t => t.mp >= 3);
  const rows = g.table.map(t => {
    const meta = metaFor(t.team); const esp = t.team === MY; const qual = t.pos <= 2;
    return `<div style="display:grid;grid-template-columns:24px 1fr 30px 30px 38px;gap:4px;align-items:center;padding:8px 10px;border-radius:11px;background:${esp ? '#FFF1F5' : (qual ? '#16C7840d' : 'transparent')};border-left:3px solid ${esp ? '#C8102E' : (qual ? '#16C784' : 'transparent')};">
      <span style="font-family:'Archivo';font-weight:800;font-size:13px;color:#8A98A8;">${t.pos}</span>
      <span style="display:flex;align-items:center;gap:8px;min-width:0;">${badge(meta, { w: 32, h: 22, fs: 9, r: 5 })}<span style="font-size:13px;font-weight:${esp ? 800 : 600};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(meta.es)}</span></span>
      <span style="text-align:center;font-size:13px;color:#5B6B7B;">${t.mp}</span>
      <span style="text-align:center;font-size:13px;color:#5B6B7B;">${t.gd > 0 ? '+' : ''}${t.gd}</span>
      <span style="text-align:center;font-family:'Archivo';font-weight:800;font-size:14px;">${t.pts}</span></div>`;
  }).join('');
  return `<div style="display:flex;flex-direction:column;gap:4px;">
    <div style="display:grid;grid-template-columns:24px 1fr 30px 30px 38px;gap:4px;font-size:10px;font-weight:800;color:#8A98A8;letter-spacing:.5px;padding:0 10px 6px;"><span>#</span><span>SELECCIÓN</span><span style="text-align:center;">PJ</span><span style="text-align:center;">DG</span><span style="text-align:center;">PTS</span></div>
    ${rows}</div>`;
}
// Cards de partidos EN VIVO (sustituyen a las estadísticas estáticas del torneo).
function liveCard(item) {
  const a = metaFor(item.home), b = metaFor(item.away);
  const min = item.minute != null ? item.minute + "'" : (item.statusLong || item.status || 'En juego');
  const side = (meta, score) => `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
    <span style="display:flex;align-items:center;gap:9px;min-width:0;">${badge(meta, { w: 36, h: 25, fs: 10, r: 6 })}<span style="font-size:15px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(meta.es)}</span></span>
    <span style="font-family:'Archivo';font-weight:900;font-size:24px;">${score ?? 0}</span></div>`;
  return `<div data-action="open-live" data-fid="${item.id}" class="hov-up" style="background:#fff;border:1.5px solid #FF2D7E;border-radius:18px;padding:18px;cursor:pointer;box-shadow:0 0 0 3px #FF2D7E14,0 14px 34px -22px rgba(255,45,126,.55);">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
      <span style="display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:800;letter-spacing:.5px;color:#FF2D7E;"><span class="live-dot-css" style="width:8px;height:8px;border-radius:50%;background:#FF2D7E;"></span>EN VIVO</span>
      <span style="font-family:'Archivo';font-weight:800;font-size:13px;color:#FF2D7E;">${esc(min)}</span></div>
    <div style="display:flex;flex-direction:column;gap:9px;">${side(a, item.homeScore)}${side(b, item.awayScore)}</div>
    <div style="margin-top:12px;text-align:right;font-size:11px;font-weight:700;color:#7C4DFF;">Ver estadísticas →</div></div>`;
}
function liveSection() {
  const items = LIVE.live || [];
  if (!items.length) {
    const nx = UPCOMING[0];
    const hint = nx ? `Próximo: ${esc(metaFor(nx.home).es)} vs ${esc(metaFor(nx.away).es)} · ${esc(nx.f.label)}` : '';
    return `<div data-anim style="margin-bottom:44px;background:#fff;border:1px dashed #D7DEE8;border-radius:18px;padding:22px;text-align:center;">
      <div style="display:inline-flex;align-items:center;gap:9px;font-weight:700;color:#5B6B7B;"><span style="width:9px;height:9px;border-radius:50%;background:#C9D4E0;"></span>Ahora mismo no hay partidos en directo</div>
      ${hint ? `<div style="margin-top:7px;font-size:13px;color:#8A98A8;">${hint}</div>` : ''}</div>`;
  }
  return `<div data-anim style="margin-bottom:44px;">
    <div style="display:flex;align-items:center;gap:11px;margin-bottom:16px;">
      <span class="live-dot-css" style="width:11px;height:11px;border-radius:50%;background:#FF2D7E;box-shadow:0 0 0 4px #FF2D7E22;"></span>
      <h3 style="margin:0;font-family:'Archivo';font-weight:900;font-size:21px;letter-spacing:.3px;">Se está jugando</h3>
      <span style="font-size:12px;font-weight:700;color:#FF2D7E;background:#FF2D7E14;padding:3px 10px;border-radius:999px;">${items.length} en directo</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:14px;">${items.map(liveCard).join('')}</div></div>`;
}
function screenInicio() {
  const live = (LIVE.live || []).length > 0;
  const todays = UPCOMING.slice(0, 5);
  const next = nextMatchCard();
  const myGroupCard = MY_GROUP ? `
    <div data-anim style="background:#fff;border:1px solid #EDF1F6;border-radius:22px;padding:24px;box-shadow:0 14px 40px -28px rgba(11,27,43,.5);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">
        <h3 style="margin:0;font-family:'Archivo';font-weight:800;font-size:19px;">Grupo de ${esc(metaFor(MY).es)} · ${MY_GROUP.group}</h3>
        <button data-action="go" data-screen="grupos" style="border:none;background:none;color:#7C4DFF;font-weight:700;font-size:13px;cursor:pointer;">Todos →</button>
      </div>${groupMiniTable(MY_GROUP)}</div>` : '';
  return `<section data-screen style="padding-top:30px;">
    <div data-anim style="text-align:center;margin-bottom:8px;">
      <div style="display:inline-flex;align-items:center;gap:9px;padding:7px 15px;border-radius:999px;background:rgba(255,255,255,.7);border:1px solid #E6EBF0;font-size:12px;font-weight:700;letter-spacing:1px;color:#5B6B7B;">
        <span class="${live ? 'live-dot-css' : ''}" style="width:8px;height:8px;border-radius:50%;background:#16C784;box-shadow:0 0 0 4px #16C78433;"></span>
        11 JUN — 19 JUL 2026${live ? ' · EN DIRECTO' : ''}</div></div>
    <h1 data-anim style="text-align:center;font-family:'Archivo';font-weight:900;font-size:clamp(48px,11vw,138px);line-height:.86;letter-spacing:-3px;margin:14px 0 6px;background:linear-gradient(100deg,#FF2D7E,#7C4DFF,#1D6FF2,#16C784,#FF2D7E);background-size:200% auto;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:shimmer 6s linear infinite;">MUNDIAL 26</h1>
    <p data-anim style="text-align:center;font-size:clamp(15px,2vw,19px);color:#5B6B7B;max-width:560px;margin:0 auto 36px;font-weight:500;">Toda la información del torneo en un vistazo. Sigue a ${esc(metaFor(MY).es)}, consulta grupos, eliminatorias y resultados en tiempo real.</p>
    ${next}
    ${liveSection()}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:20px;">
      <div data-anim style="background:#fff;border:1px solid #EDF1F6;border-radius:22px;padding:24px;box-shadow:0 14px 40px -28px rgba(11,27,43,.5);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">
          <h3 style="margin:0;font-family:'Archivo';font-weight:800;font-size:19px;">Próximos partidos</h3>
          <button data-action="go" data-screen="calendario" style="border:none;background:none;color:#7C4DFF;font-weight:700;font-size:13px;cursor:pointer;">Ver todos →</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;">${todays.map(miniMatchRow).join('') || '<p style="color:#8A98A8;">Sin próximos partidos.</p>'}</div>
      </div>
      ${myGroupCard}
    </div></section>`;
}

// --- Pantalla: Calendario ----------------------------------------------------
function fixtureRow(m) {
  const lv = liveFor(m);
  const action = lv ? `data-action="open-live" data-fid="${lv.id}"` : `data-action="open" data-id="${m.id}"`;
  const dateCol = lv
    ? `<div style="text-align:center;flex:none;width:62px;border-right:1px solid #E6EBF0;padding-right:clamp(8px,2vw,18px);"><div style="font-size:10px;font-weight:800;color:#FF2D7E;display:flex;align-items:center;justify-content:center;gap:4px;"><span class="live-dot-css" style="width:7px;height:7px;border-radius:50%;background:#FF2D7E;"></span>VIVO</div><div style="font-family:'Archivo';font-weight:900;font-size:15px;color:#FF2D7E;margin-top:3px;">${lv.minute ?? ''}'</div></div>`
    : `<div style="text-align:center;flex:none;width:62px;border-right:1px solid #E6EBF0;padding-right:clamp(8px,2vw,18px);"><div style="font-family:'Archivo';font-weight:900;font-size:16px;">${m.f.day}</div><div style="font-size:10px;font-weight:700;color:#8A98A8;letter-spacing:1px;">${m.f.mon}</div><div style="font-size:12px;font-weight:700;color:#7C4DFF;margin-top:4px;">${m.f.time}</div></div>`;
  const mid = lv
    ? `<span style="font-family:'Archivo';font-weight:900;font-size:clamp(16px,2vw,20px);color:#FF2D7E;flex:none;">${lv.homeScore ?? 0} - ${lv.awayScore ?? 0}</span>`
    : `<span style="font-family:'Archivo';font-weight:900;font-size:13px;color:#C9D4E0;flex:none;">VS</span>`;
  const labelColor = m.group ? '#7C4DFF' : '#FF2D7E';
  return `<div data-anim ${action} class="hov-lift" style="display:flex;flex-direction:column;gap:11px;padding:13px clamp(14px,2vw,22px) 16px;border-radius:18px;background:${lv ? '#FFF1F5' : (m.isEsp ? '#FFF7FA' : '#fff')};border:1px solid ${lv ? '#FFD2DF' : (m.isEsp ? '#FFD2DF' : '#EDF1F6')};cursor:pointer;box-shadow:0 8px 26px -22px rgba(11,27,43,.5);">
    <span style="align-self:flex-start;font-size:10px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;color:${labelColor};background:${labelColor}14;padding:3px 10px;border-radius:999px;">${esc(matchLabel(m))}</span>
    <div style="display:flex;align-items:center;gap:clamp(10px,2vw,22px);">
      ${dateCol}
      <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;justify-content:flex-end;"><span style="font-size:clamp(13px,1.7vw,16px);font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(m.a.es)}</span>${badge(m.a, { w: 40, h: 28, fs: 11, r: 7 })}</div>
      ${mid}
      <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">${badge(m.b, { w: 40, h: 28, fs: 11, r: 7 })}<span style="font-size:clamp(13px,1.7vw,16px);font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(m.b.es)}</span></div>
    </div>
  </div>`;
}
function screenCalendario() {
  let list = UPCOMING;
  if (state.onlyEsp) list = list.filter(m => m.isEsp);
  const filterStyle = 'padding:10px 18px;border-radius:12px;cursor:pointer;font-weight:700;font-size:14px;transition:all .2s;'
    + (state.onlyEsp ? 'border:1.5px solid #C8102E;background:#C8102E;color:#fff;' : 'border:1.5px solid #E6EBF0;background:#fff;color:#5B6B7B;');
  const nearest = list[0] ? roundEs(list[0].round) : 'Próximos partidos';
  return `<section data-screen style="padding-top:30px;">
    <div data-anim style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px;margin-bottom:26px;">
      <div><h2 style="margin:0;font-family:'Archivo';font-weight:900;font-size:clamp(30px,5vw,46px);letter-spacing:-1.5px;">Calendario</h2>
        <p style="margin:6px 0 0;color:#5B6B7B;font-weight:500;">${nearest} · ${list.length} partido${list.length === 1 ? '' : 's'}</p></div>
      <button data-action="toggleEsp" style="${filterStyle}">${state.onlyEsp ? '★ Solo ' + esc(metaFor(MY).es) : 'Solo ' + esc(metaFor(MY).es)}</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px;">${list.map(fixtureRow).join('') || '<p style="color:#8A98A8;">No hay partidos próximos.</p>'}</div></section>`;
}

// --- Pantalla: Grupos --------------------------------------------------------
function groupCard(g) {
  const allPlayed = g.table.every(t => t.mp >= 3);
  const rows = g.table.map(t => {
    const meta = metaFor(t.team); const esp = t.team === MY; const qual = t.pos <= 2;
    return `<div style="display:grid;grid-template-columns:20px 1fr 26px 26px 26px 34px;gap:3px;align-items:center;padding:7px 8px;border-radius:9px;background:${esp ? '#FFF1F5' : (qual ? '#16C7840d' : 'transparent')};border-left:3px solid ${esp ? '#C8102E' : (qual ? '#16C784' : 'transparent')};">
      <span style="font-family:'Archivo';font-weight:800;font-size:12px;color:#8A98A8;">${t.pos}</span>
      <span style="display:flex;align-items:center;gap:7px;min-width:0;">${badge(meta, { w: 30, h: 20, fs: 9, r: 5 })}<span style="font-size:12px;font-weight:${esp ? 800 : 600};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(meta.es)}</span></span>
      <span style="text-align:center;font-size:12px;color:#5B6B7B;">${t.mp}</span>
      <span style="text-align:center;font-size:12px;color:#5B6B7B;">${t.gf}</span>
      <span style="text-align:center;font-size:12px;color:#5B6B7B;">${t.gd > 0 ? '+' : ''}${t.gd}</span>
      <span style="text-align:center;font-family:'Archivo';font-weight:800;font-size:13px;">${t.pts}</span></div>`;
  }).join('');
  return `<div data-anim style="background:#fff;border:1px solid #EDF1F6;border-radius:20px;overflow:hidden;box-shadow:0 12px 34px -26px rgba(11,27,43,.55);">
    <div style="padding:15px 18px;background:${GROUP_HEADS[g.group] || '#7C4DFF'};display:flex;align-items:center;justify-content:space-between;">
      <span style="font-family:'Archivo';font-weight:900;font-size:17px;color:#fff;letter-spacing:.5px;">GRUPO ${g.group}</span>
      <span style="font-size:11px;font-weight:700;color:#ffffffcc;letter-spacing:1px;">${allPlayed ? 'FINALIZADO' : 'EN CURSO'}</span></div>
    <div style="padding:10px 12px;">
      <div style="display:grid;grid-template-columns:20px 1fr 26px 26px 26px 34px;gap:3px;font-size:9px;font-weight:800;color:#8A98A8;letter-spacing:.3px;padding:0 8px 6px;"><span>#</span><span>EQUIPO</span><span style="text-align:center;">PJ</span><span style="text-align:center;">GF</span><span style="text-align:center;">DG</span><span style="text-align:center;">PTS</span></div>
      ${rows}</div></div>`;
}
function screenGrupos() {
  const cards = STANDINGS.groups.map(groupCard).join('');
  return `<section data-screen style="padding-top:30px;">
    <div data-anim style="margin-bottom:26px;"><h2 style="margin:0;font-family:'Archivo';font-weight:900;font-size:clamp(30px,5vw,46px);letter-spacing:-1.5px;">Fase de grupos</h2>
      <p style="margin:6px 0 0;color:#5B6B7B;font-weight:500;">12 grupos · clasifican los 2 primeros + 8 mejores terceros</p></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:18px;">${cards}</div></section>`;
}

// --- Pantalla: Eliminatorias (bracket con fechas, códigos P y conectores) -----
const slotLabel = raw => { const m = /^([WL])(\d+)$/.exec(raw || ''); return m ? `${m[1] === 'W' ? 'Ganador' : 'Perdedor'} P${m[2]}` : null; };

function bracketCard(m) {
  if (!m) return `<div class="bcard bcard-tbd"><span class="bcard-name" style="color:#A6B2C0;">Por definir</span></div>`;
  const lv = liveFor(m);
  let hs = null, as = null, st = '';
  if (lv) { hs = lv.homeScore; as = lv.awayScore; st = 'live'; }
  else if (m.status === 'finished' && m.score && m.score.ft) { hs = m.score.ft[0]; as = m.score.ft[1]; st = 'fin'; }
  const winH = st === 'fin' && hs > as, winA = st === 'fin' && as > hs;
  const clickable = (!m.a.tbd && !m.b.tbd) || m.status === 'finished';
  const row = (meta, raw, goals, win) => `<div class="bcard-team${win ? ' win' : ''}${meta.tbd ? ' tbd' : ''}">
      ${badge(meta, { w: 26, h: 18, fs: 8, r: 4 })}
      <span class="bcard-name">${esc(meta.tbd ? (slotLabel(raw) || 'Por definir') : meta.es)}</span>
      ${goals != null ? `<span class="bcard-sc">${goals}</span>` : ''}</div>`;
  const chip = st === 'live'
    ? `<span class="bcard-chip live"><span class="live-dot-css" style="width:6px;height:6px;border-radius:50%;background:#FF2D7E;"></span>${lv.minute ?? ''}'</span>`
    : st === 'fin' ? `<span class="bcard-chip fin">Final</span>` : '';
  const when = m.f && m.f.full !== 'Por definir' ? `${m.f.day} ${m.f.mon} · ${m.f.time}` : '';
  return `<div class="bcard${m.isEsp ? ' esp' : ''}${clickable ? ' clic' : ''}" ${clickable ? `data-action="open" data-id="${m.id}"` : ''}>
    <div class="bcard-top"><span class="bcard-code">P${m.id}</span>${when ? `<span class="bcard-when">${when}</span>` : ''}${chip}</div>
    ${row(m.a, m.home, hs, winH)}
    ${row(m.b, m.away, as, winA)}</div>`;
}

function screenBracket() {
  let cols = '';
  BRACKET_COLS.forEach((col, i) => {
    const cells = col.ids.map(id => `<div class="bcell">${bracketCard(BY_ID.get(id))}</div>`).join('');
    cols += `<div class="bcol"><div class="bcol-head">${col.name}</div><div class="bcol-body">${cells}</div></div>`;
    if (i < BRACKET_COLS.length - 1) {
      const elbows = BRACKET_COLS[i + 1].ids.map(() => '<div class="belbow"></div>').join('');
      cols += `<div class="bcol bconn"><div class="bcol-head"></div><div class="bcol-body">${elbows}</div></div>`;
    }
  });
  const third = BY_ID.get(103);
  return `<section data-screen style="padding-top:30px;">
    <div data-anim style="display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:20px;">
      <div><h2 style="margin:0;font-family:'Archivo';font-weight:900;font-size:clamp(30px,5vw,46px);letter-spacing:-1.5px;">Eliminatorias</h2>
        <p style="margin:6px 0 0;color:#5B6B7B;font-weight:500;">El camino hacia la final · desliza para explorar →</p></div>
      <div style="display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:11px;background:#FFF1F5;border:1px solid #FFD2DF;">
        <span style="width:12px;height:12px;border-radius:4px;background:#C8102E;"></span><span style="font-size:12px;font-weight:700;color:#C8102E;">Camino de ${esc(metaFor(MY).es)}</span></div></div>
    <div class="bkt-scroll" data-anim><div class="bkt">${cols}</div></div>
    ${third ? `<div data-anim class="bkt-third"><div class="bkt-third-head">🥉 Tercer puesto</div>${bracketCard(third)}</div>` : ''}
  </section>`;
}

// --- Selectores personalizados de filtro (banderas + buscador) ---------------
const normTxt = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function resultTeamOpts() {
  const done = MATCHES.filter(m => m.status === 'finished');
  const set = new Set();
  done.forEach(m => { set.add(m.home); set.add(m.away); });
  return [...set].map(n => ({ val: n, label: metaFor(n).es, flag: FLAGS.get(n) })).sort((a, b) => a.label.localeCompare(b.label, 'es'));
}
function comboOpt(kind, val, flag, label, selected) {
  const icon = flag
    ? `<img src="${flag}" width="26" height="18" style="border-radius:3px;object-fit:cover;flex:none;box-shadow:0 0 0 1px rgba(11,27,43,.12);">`
    : '';
  return `<div data-combo-pick="${kind}" data-val="${esc(val)}" class="combo-opt" style="display:flex;align-items:center;gap:10px;padding:9px 11px;cursor:pointer;border-radius:10px;${selected ? 'background:#FFF1F5;' : ''}">
    ${icon}<span style="font-size:14px;font-weight:${selected ? 700 : 500};color:#0B1B2B;flex:1;">${esc(label)}</span>${selected ? '<span style="color:#C8102E;font-weight:800;">✓</span>' : ''}</div>`;
}
function teamOptionsHTML() {
  const q = normTxt(teamQuery);
  const opts = resultTeamOpts().filter(o => !q || normTxt(o.label).includes(q));
  const all = !q ? comboOpt('team', 'all', null, 'Todas las selecciones', state.resTeam === 'all') : '';
  const rows = opts.map(o => comboOpt('team', o.val, o.flag, o.label, state.resTeam === o.val)).join('');
  return all + (rows || '<div style="padding:10px 12px;color:#A6B2C0;font-size:13px;">Sin coincidencias</div>');
}
const panelStyle = w => `position:absolute;z-index:50;top:calc(100% + 6px);left:0;width:${w};max-width:86vw;background:#fff;border:1px solid #E6EBF0;border-radius:14px;box-shadow:0 20px 50px -20px rgba(11,27,43,.4);padding:8px;`;
function teamPanelHTML() {
  return `<div style="${panelStyle('280px')}">
    <input data-combo-input type="text" value="${esc(teamQuery)}" placeholder="Buscar selección…" autocomplete="off" style="width:100%;padding:9px 11px;border:1.5px solid #E6EBF0;border-radius:10px;font-size:14px;font-family:inherit;outline:none;margin-bottom:6px;box-sizing:border-box;" />
    <div data-combo-list style="max-height:280px;overflow-y:auto;">${teamOptionsHTML()}</div></div>`;
}
function datePanelHTML() {
  const opts = [...new Set(MATCHES.filter(m => m.status === 'finished').map(m => m.date).filter(Boolean))].sort((a, b) => b.localeCompare(a));
  const list = comboOpt('date', 'all', null, 'Todas las fechas', state.resDate === 'all')
    + opts.map(d => comboOpt('date', d, null, capFirst(fmt(d + 'T12:00:00Z').full), state.resDate === d)).join('');
  return `<div style="${panelStyle('260px')}"><div style="max-height:300px;overflow-y:auto;">${list}</div></div>`;
}
function comboHead(kind) {
  const open = openComboKind === kind;
  let icon, label, selected;
  if (kind === 'team') {
    selected = state.resTeam !== 'all';
    const f = selected ? FLAGS.get(state.resTeam) : null;
    icon = f ? `<img src="${f}" width="24" height="16" style="border-radius:3px;object-fit:cover;flex:none;box-shadow:0 0 0 1px rgba(11,27,43,.12);">` : '<span style="font-size:15px;">🌍</span>';
    label = selected ? metaFor(state.resTeam).es : 'Todas las selecciones';
  } else {
    selected = state.resDate !== 'all';
    icon = '<span style="font-size:15px;">📅</span>';
    label = selected ? capFirst(fmt(state.resDate + 'T12:00:00Z').full) : 'Todas las fechas';
  }
  return `<div data-combo-open="${kind}" style="display:flex;align-items:center;gap:9px;padding:10px 13px;border-radius:11px;border:1.5px solid ${open ? '#7C4DFF' : '#E6EBF0'};background:#fff;cursor:pointer;min-width:200px;max-width:280px;font-weight:600;font-size:14px;">
    ${icon}<span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${selected ? '#0B1B2B' : '#5B6B7B'};">${esc(label)}</span><span style="color:#8A98A8;font-size:11px;">▾</span></div>`;
}
function combo(kind) {
  return `<div data-combo data-combo-kind="${kind}" style="position:relative;">${comboHead(kind)}<div data-combo-panel>${openComboKind === kind ? (kind === 'team' ? teamPanelHTML() : datePanelHTML()) : ''}</div></div>`;
}
function openCombo(kind) {
  closeCombo();
  openComboKind = kind;
  const cont = document.querySelector(`[data-combo-kind="${kind}"] [data-combo-panel]`);
  const head = document.querySelector(`[data-combo-kind="${kind}"] [data-combo-open]`);
  if (head) head.style.borderColor = '#7C4DFF';
  if (cont) {
    cont.innerHTML = kind === 'team' ? teamPanelHTML() : datePanelHTML();
    if (kind === 'team') requestAnimationFrame(() => { cont.querySelector('[data-combo-input]')?.focus(); });
  }
}
function closeCombo() {
  openComboKind = null;
  document.querySelectorAll('[data-combo-panel]').forEach(p => { p.innerHTML = ''; });
  document.querySelectorAll('[data-combo-open]').forEach(h => { h.style.borderColor = '#E6EBF0'; });
}

// --- Pantalla: Resultados ----------------------------------------------------
function resultCard(m) {
  const [sa, sb] = m.score.ft; const aw = sa > sb, bw = sb > sa;
  const espGlow = m.isEsp ? 'box-shadow:0 0 0 1.5px #FFD2DF inset,0 10px 30px -24px rgba(11,27,43,.5);' : 'box-shadow:0 10px 30px -24px rgba(11,27,43,.5);';
  const side = (meta, score, win) => `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
    <span style="display:flex;align-items:center;gap:9px;min-width:0;">${badge(meta, { w: 36, h: 25, fs: 10, r: 6 })}<span style="font-size:15px;font-weight:${win ? 800 : 600};">${esc(meta.es)}</span></span>
    <span style="font-family:'Archivo';font-weight:900;font-size:22px;color:${win ? '#0B1B2B' : '#A6B2C0'};">${score}</span></div>`;
  const fecha = m.f.full !== 'Por definir' ? `${m.f.full} · ${m.f.time}` : '';
  return `<div data-anim data-action="open" data-id="${m.id}" class="hov-up" style="background:#fff;border:1px solid #EDF1F6;border-radius:18px;padding:18px;cursor:pointer;${espGlow}">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
      <span style="font-size:10px;font-weight:800;letter-spacing:1px;color:#8A98A8;">${esc(m.group ? 'GRUPO ' + m.group : roundEs(m.round))}</span>
      <span style="font-size:10px;font-weight:800;color:#16C784;padding:3px 8px;border-radius:6px;background:#16C7841a;">FINAL</span></div>
    <div style="display:flex;flex-direction:column;gap:9px;">${side(m.a, sa, aw)}${side(m.b, sb, bw)}</div>
    ${fecha ? `<div style="margin-top:12px;padding-top:10px;border-top:1px solid #F0F3F7;font-size:11px;color:#8A98A8;font-weight:600;">📅 ${esc(capFirst(fecha))}</div>` : ''}</div>`;
}
function screenResultados() {
  const done = MATCHES.filter(m => m.status === 'finished');
  // Aplicar filtros (las opciones las construyen los selectores combo)
  let list = done.slice().sort((a, b) => (b.kickoff || '').localeCompare(a.kickoff || ''));
  if (state.resTeam !== 'all') list = list.filter(m => m.home === state.resTeam || m.away === state.resTeam);
  if (state.resDate !== 'all') list = list.filter(m => m.date === state.resDate);

  const filtered = state.resTeam !== 'all' || state.resDate !== 'all';
  const clearBtn = filtered ? `<button data-action="clearResFilters" style="padding:10px 14px;border-radius:11px;border:1.5px solid #FFD2DF;background:#FFF1F5;color:#C8102E;font-weight:700;font-size:14px;cursor:pointer;">✕ Limpiar</button>` : '';

  return `<section data-screen style="padding-top:30px;">
    <div data-anim style="margin-bottom:18px;"><h2 style="margin:0;font-family:'Archivo';font-weight:900;font-size:clamp(30px,5vw,46px);letter-spacing:-1.5px;">Resultados</h2>
      <p style="margin:6px 0 0;color:#5B6B7B;font-weight:500;">${list.length} de ${done.length} partidos · marcadores finales</p></div>
    <div data-anim style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:24px;position:relative;z-index:5;">
      ${combo('team')}${combo('date')}${clearBtn}
    </div>
    ${list.length
      ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:14px;">${list.map(resultCard).join('')}</div>`
      : `<p style="color:#8A98A8;">No hay resultados con esos filtros.</p>`}</section>`;
}

// --- Modal de partido --------------------------------------------------------
// Barra comparativa entre los dos equipos (estilo del diseño original).
function statBar(name, lv, rv, lcolor, rcolor) {
  const total = (lv + rv) || 1;
  const lw = Math.round(lv / total * 100);
  return `<div style="margin-bottom:13px;">
    <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;margin-bottom:5px;">
      <span>${lv}</span><span style="color:#8A98A8;">${name}</span><span>${rv}</span></div>
    <div style="display:flex;height:6px;border-radius:3px;overflow:hidden;background:#E6EBF0;">
      <div style="width:${lw}%;background:${lcolor};"></div><div style="width:${100 - lw}%;background:${rcolor};"></div></div></div>`;
}
const goalMin = g => { const n = parseInt(g.minute, 10); return Number.isFinite(n) ? n : 0; };
// Cronología de goles (local a la izquierda, visitante a la derecha).
function goalsTimeline(home, away) {
  const all = [...home.map(g => ({ ...g, side: 'home' })), ...away.map(g => ({ ...g, side: 'away' }))]
    .sort((a, b) => goalMin(a) - goalMin(b));
  if (!all.length) return '<div style="text-align:center;color:#A6B2C0;font-size:13px;padding:4px 0;">Partido sin goles</div>';
  return all.map(g => {
    const right = g.side === 'away';
    const mark = (g.penalty ? ' (pen)' : '') + (g.owngoal ? ' (p.p.)' : '');
    const txt = `⚽ ${esc(g.name || '')} ${g.minute || ''}'${mark}`;
    return `<div style="display:flex;justify-content:${right ? 'flex-end' : 'flex-start'};font-size:12px;color:#3A4A5C;padding:4px 0;border-bottom:1px solid #EDF1F6;">${txt}</div>`;
  }).join('');
}
// Escudo grande para el modal (compartido por la ficha normal y la de en vivo).
function modalTeam(meta) {
  return `<div style="text-align:center;flex:1;"><div style="width:74px;height:74px;margin:0 auto;border-radius:20px;overflow:hidden;box-shadow:0 14px 26px -12px ${meta.color};">${flagFill(meta, 22)}</div><div style="font-weight:800;font-size:15px;margin-top:10px;">${esc(meta.es)}</div></div>`;
}
function modalShell(barGradient, body) {
  return `<div data-action="close-backdrop" style="position:fixed;inset:0;z-index:60;background:rgba(11,27,43,.55);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:20px;">
    <div style="position:relative;width:100%;max-width:460px;background:#fff;border-radius:26px;overflow:hidden;box-shadow:0 40px 90px -30px rgba(11,27,43,.7);">
      <div style="height:5px;background:${barGradient};"></div>
      <button data-action="close" style="position:absolute;top:16px;right:16px;width:34px;height:34px;border-radius:50%;border:none;background:#F3F5FA;cursor:pointer;font-size:17px;color:#5B6B7B;z-index:2;">✕</button>
      <div style="padding:26px 26px 28px;">${body}</div></div></div>`;
}
// --- Modal EN VIVO (estadísticas en directo) ---------------------------------
function eventIcon(ev) {
  if (ev.type === 'Goal') return ev.detail && /own/i.test(ev.detail) ? '⚽(pp)' : '⚽';
  if (ev.type === 'Card') return ev.detail && /red/i.test(ev.detail) ? '🟥' : '🟨';
  if (ev.type === 'subst') return '🔁';
  if (ev.type === 'Var') return '📺';
  return '•';
}
function liveTimeline(events) {
  if (!events || !events.length) return '<div style="text-align:center;color:#A6B2C0;font-size:13px;padding:6px 0;">El partido acaba de empezar · sin incidencias todavía</div>';
  return events.slice().sort((a, b) => (a.minute || 0) - (b.minute || 0)).map(ev => {
    const right = ev.side === 'away';
    const who = ev.player ? esc(ev.player) : esc(ev.detail || '');
    const min = ev.minute != null ? ` ${ev.minute}'` : '';
    return `<div style="display:flex;justify-content:${right ? 'flex-end' : 'flex-start'};font-size:12px;color:#3A4A5C;padding:4px 0;border-bottom:1px solid #EDF1F6;">${right ? '' : eventIcon(ev) + ' '}${who}${min}${right ? ' ' + eventIcon(ev) : ''}</div>`;
  }).join('');
}
function liveModalHTML(m) {
  const center = `<div style="font-family:'Archivo';font-weight:900;font-size:32px;letter-spacing:1px;">${m.homeScore ?? 0} - ${m.awayScore ?? 0}</div>
    <div style="margin-top:5px;font-size:12px;font-weight:800;color:#FF2D7E;display:inline-flex;align-items:center;gap:6px;justify-content:center;"><span class="live-dot-css" style="width:7px;height:7px;border-radius:50%;background:#FF2D7E;"></span>${m.minute != null ? m.minute + "'" : esc(m.statusLong || 'EN VIVO')}</div>`;
  const body = `
    <div style="text-align:center;font-size:12px;font-weight:800;letter-spacing:1.5px;color:#FF2D7E;">EN VIVO</div>
    <div style="text-align:center;font-size:13px;color:#8A98A8;font-weight:600;margin-top:6px;">${esc(m.venue || '')}</div>
    <div style="display:flex;align-items:center;justify-content:center;gap:18px;margin:24px 0;">${modalTeam(m.a)}<div style="text-align:center;flex:none;">${center}</div>${modalTeam(m.b)}</div>
    <div style="background:#F3F5FA;border-radius:16px;padding:16px 18px;">
      <div style="font-size:11px;font-weight:800;letter-spacing:1px;color:#8A98A8;margin-bottom:10px;text-align:center;">INCIDENCIAS EN VIVO</div>
      ${liveTimeline(m.events)}</div>`;
  return modalShell('linear-gradient(90deg,#FF2D7E,#C9184A)', body);
}
function modalHTML() {
  if (!state.open) return '';
  const m = state.open;
  if (m.__live) return liveModalHTML(m);
  const finished = m.status === 'finished';
  const center = finished
    ? `<div style="font-family:'Archivo';font-weight:900;font-size:30px;letter-spacing:1px;">${m.score.ft[0]} - ${m.score.ft[1]}</div>`
    : `<div style="font-family:'Archivo';font-weight:900;font-size:15px;color:#7C4DFF;white-space:nowrap;">PRÓXIMAMENTE</div>`;
  let panel;
  if (finished) {
    const [fh, fa] = m.score.ft;
    const [hh, ha] = m.score.ht || [null, null];
    const c1 = m.a.color, c2 = m.b.color;
    const penH = m.scorers.home.filter(g => g.penalty).length;
    const penA = m.scorers.away.filter(g => g.penalty).length;
    const bars = [statBar('Goles', fh, fa, c1, c2)];
    if (m.score.ht) bars.push(statBar('Goles 1ª parte', hh, ha, c1, c2), statBar('Goles 2ª parte', fh - hh, fa - ha, c1, c2));
    if (penH + penA) bars.push(statBar('Penaltis', penH, penA, c1, c2));
    panel = `<div style="font-size:11px;font-weight:800;letter-spacing:1px;color:#8A98A8;margin-bottom:12px;text-align:center;">ESTADÍSTICAS</div>
      ${bars.join('')}
      <div style="font-size:11px;font-weight:800;letter-spacing:1px;color:#8A98A8;margin:18px 0 8px;text-align:center;">CRONOLOGÍA DE GOLES</div>
      ${goalsTimeline(m.scorers.home, m.scorers.away)}`;
  } else {
    panel = `<div style="font-size:11px;font-weight:800;letter-spacing:1px;color:#8A98A8;margin-bottom:10px;text-align:center;">INFORMACIÓN</div>
      <div style="font-size:13px;color:#5B6B7B;text-align:center;line-height:1.7;">${esc(m.f.full)} · ${esc(m.f.time)}<br>${esc(m.venue || 'Sede por confirmar')}</div>`;
  }
  const body = `
    <div style="text-align:center;font-size:12px;font-weight:800;letter-spacing:1.5px;color:#7C4DFF;">${esc(m.group ? 'Grupo ' + m.group : roundEs(m.round))}</div>
    <div style="text-align:center;font-size:13px;color:#8A98A8;font-weight:600;margin-top:6px;">${esc(capFirst(m.f.full))}${m.f.time ? ' · ' + esc(m.f.time) : ''}${m.venue ? ' · ' + esc(m.venue) : ''}</div>
    <div style="display:flex;align-items:center;justify-content:center;gap:18px;margin:24px 0;">${modalTeam(m.a)}<div style="text-align:center;flex:none;">${center}</div>${modalTeam(m.b)}</div>
    <div style="background:#F3F5FA;border-radius:16px;padding:16px 18px;">${panel}</div>`;
  return modalShell('linear-gradient(90deg,#FF2D7E,#7C4DFF,#1D6FF2,#16C784)', body);
}

// --- Render + eventos --------------------------------------------------------
function screenHTML() {
  switch (state.screen) {
    case 'calendario': return screenCalendario();
    case 'grupos': return screenGrupos();
    case 'bracket': return screenBracket();
    case 'resultados': return screenResultados();
    default: return screenInicio();
  }
}
function renderApp() {
  openComboKind = null; // el DOM se reconstruye: cualquier selector queda cerrado
  document.getElementById('app').innerHTML =
    header() + liveBannerHTML() +
    `<main style="max-width:1200px;margin:0 auto;padding:0 20px 60px;">${screenHTML()}</main>` +
    footer() +
    modalHTML();
  runIntro();
}
function runIntro() {
  const g = window.gsap; const root = document.getElementById('app');
  if (g && root) {
    try { g.from(root.querySelectorAll('[data-screen] [data-anim]'), { opacity: 0, y: 24, duration: .6, stagger: .05, ease: 'power3.out', immediateRender: false }); } catch {}
    root.querySelectorAll('[data-count]').forEach(el => {
      const to = +el.getAttribute('data-count'); const o = { v: 0 };
      try { g.to(o, { v: to, duration: 1.4, ease: 'power2.out', onUpdate: () => { el.textContent = Math.round(o.v); } }); } catch {}
    });
  }
}
function go(screen) {
  state.open = null;
  if (location.hash.replace('#', '') === screen) renderApp(); // mismo hash: re-render manual
  else location.hash = screen;                                 // distinto: hashchange -> applyHash
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function startCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  const tick = () => {
    if (!HERO || !HERO.kickoff) return;
    let ms = new Date(HERO.kickoff).getTime() - Date.now(); if (ms < 0) ms = 0;
    const pad = n => String(n).padStart(2, '0');
    const v = { d: pad(Math.floor(ms / 86400000)), h: pad(Math.floor(ms / 3600000) % 24), m: pad(Math.floor(ms / 60000) % 60), s: pad(Math.floor(ms / 1000) % 60) };
    for (const k of Object.keys(v)) document.querySelectorAll(`[data-cd="${k}"]`).forEach(e => { e.textContent = v[k]; });
  };
  tick(); countdownTimer = setInterval(tick, 1000);
}

document.addEventListener('click', e => {
  // Menú móvil: cerrar si se hace clic fuera de la cabecera
  const navEl = document.getElementById('main-nav');
  if (navEl && navEl.classList.contains('open') && !e.target.closest('header')) navEl.classList.remove('open');

  // Selectores de filtro (combobox personalizado)
  const pick = e.target.closest('[data-combo-pick]');
  if (pick) {
    const kind = pick.getAttribute('data-combo-pick'), val = pick.getAttribute('data-val');
    if (kind === 'team') state.resTeam = val; else state.resDate = val;
    teamQuery = ''; closeCombo(); return renderApp();
  }
  const opener = e.target.closest('[data-combo-open]');
  if (opener) {
    const kind = opener.getAttribute('data-combo-open');
    if (openComboKind === kind) closeCombo(); else { teamQuery = ''; openCombo(kind); }
    return;
  }
  if (openComboKind && !e.target.closest('[data-combo]')) { closeCombo(); return; }

  const t = e.target.closest('[data-action]');
  if (!t) return;
  const action = t.getAttribute('data-action');
  if (action === 'toggleMenu') { document.getElementById('main-nav')?.classList.toggle('open'); return; }
  if (action === 'toggleAlerts') {
    const turningOn = !alertsOn();
    try { localStorage.setItem('wc26-alerts', turningOn ? 'on' : 'off'); } catch {}
    if (turningOn && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
    renderApp();
    showToast(turningOn ? '🔔 Avisos activados' : '🔕 Avisos silenciados', turningOn ? 'Te avisaré de goles e inicios de partido.' : '');
    return;
  }
  if (action === 'go') return go(t.getAttribute('data-screen'));
  if (action === 'toggleEsp') { state.onlyEsp = !state.onlyEsp; return renderApp(); }
  if (action === 'clearResFilters') { state.resTeam = 'all'; state.resDate = 'all'; teamQuery = ''; return renderApp(); }
  if (action === 'open-live') {
    const it = LIVE_BY_FID.get(Number(t.getAttribute('data-fid')));
    if (it) { state.open = openLive(it); renderApp(); }
    return;
  }
  if (action === 'open') {
    const m = BY_ID.get(Number(t.getAttribute('data-id')) || t.getAttribute('data-id'));
    if (m) { const lv = liveFor(m); state.open = lv ? openLive(lv) : m; renderApp(); }
    return;
  }
  if (action === 'close') { state.open = null; return renderApp(); }
  if (action === 'close-backdrop') {
    // Solo cerrar si se hace clic en el fondo, no dentro del cuadro.
    if (e.target === t) { state.open = null; renderApp(); }
    return;
  }
});

// Buscador del selector de selección: filtra la lista sin re-renderizar (mantiene foco).
document.addEventListener('input', e => {
  const inp = e.target.closest('[data-combo-input]');
  if (!inp) return;
  teamQuery = inp.value;
  const list = document.querySelector('[data-combo-kind="team"] [data-combo-list]');
  if (list) list.innerHTML = teamOptionsHTML();
});

init();
