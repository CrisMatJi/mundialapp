// Mundial 26 — port del diseño "Mundial 26.dc.html" a web vanilla, cableado a datos reales.
// Datos: /data/*.json (openfootball + clasificación calculada + API-Football en vivo).
import { META, GROUP_HEADS, metaFor } from './teams-meta.js';

const MY = 'Spain';                 // "Mi selección" (cámbialo aquí si quieres otra)
const ROUND_ES = {
  'Round of 32': 'Dieciseisavos de final', 'Round of 16': 'Octavos de final',
  'Quarter-final': 'Cuartos de final', 'Semi-final': 'Semifinal',
  'Match for third place': 'Tercer puesto', 'Final': 'Final'
};
const BRACKET_ORDER = [
  ['Round of 32', 'Dieciseisavos'], ['Round of 16', 'Octavos'],
  ['Quarter-final', 'Cuartos'], ['Semi-final', 'Semifinales'], ['Final', 'Final']
];

// --- Estado y datos ----------------------------------------------------------
const state = { screen: 'inicio', open: null, onlyEsp: false };
let MATCHES = [];          // enriquecidos
let BY_ID = new Map();
let STANDINGS = { groups: [] };
let LIVE = { live: [] };
let FLAGS = new Map();     // nombre de selección -> URL de bandera (flagcdn)
let UPCOMING = [];
let NEXT_ESP = null;
let HERO = null;           // partido destacado del hero (España si juega, si no el próximo del torneo)
let MY_GROUP = null;
let countdownTimer = null;

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

async function init() {
  const [standings, matchesDoc, live, teamsDoc] = await Promise.all([
    loadJSON('./data/standings.json'), loadJSON('./data/matches.json'),
    loadJSON('./data/live.json'), loadJSON('./data/teams.json')
  ]);
  STANDINGS = standings || { groups: [] };
  LIVE = live || { live: [] };
  FLAGS = new Map((teamsDoc?.teams || []).map(t => [t.name, t.flag]).filter(([, f]) => f));
  MATCHES = (matchesDoc?.matches || []).map(enrich);
  BY_ID = new Map(MATCHES.map(m => [m.id, m]));
  UPCOMING = MATCHES.filter(m => m.status === 'scheduled' && m.kickoff).sort((x, y) => x.kickoff.localeCompare(y.kickoff));
  NEXT_ESP = UPCOMING.find(m => m.isEsp) || null;
  HERO = NEXT_ESP || UPCOMING[0] || null;
  MY_GROUP = STANDINGS.groups.find(g => g.table.some(t => t.team === MY)) || null;

  applyHash();
  window.addEventListener('hashchange', applyHash);
  // Enlace directo a un partido: ?match=<id> abre su ficha al cargar.
  const mq = new URLSearchParams(location.search).get('match');
  if (mq && BY_ID.has(Number(mq))) { state.open = BY_ID.get(Number(mq)); renderApp(); }
  startCountdown();
  setInterval(refreshLive, 60000);
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
    <div style="max-width:1200px;margin:0 auto;padding:12px 20px;display:flex;align-items:center;gap:18px;">
      <div data-action="go" data-screen="inicio" style="display:flex;align-items:center;gap:11px;cursor:pointer;flex:none;">
        <div style="width:40px;height:40px;border-radius:11px;background:linear-gradient(135deg,#FF2D7E,#7C4DFF 55%,#1D6FF2);display:flex;align-items:center;justify-content:center;box-shadow:0 8px 20px -8px rgba(124,77,255,.7);">
          <span style="font-family:'Archivo';font-weight:900;font-size:17px;color:#fff;letter-spacing:-1px;">26</span>
        </div>
        <div style="line-height:1;">
          <div style="font-family:'Archivo';font-weight:900;font-size:15px;letter-spacing:.5px;">MUNDIAL</div>
          <div style="font-size:10px;font-weight:700;letter-spacing:2.5px;color:#8A98A8;margin-top:2px;">USA·CAN·MEX</div>
        </div>
      </div>
      <nav style="display:flex;gap:4px;overflow-x:auto;scrollbar-width:none;flex:1;padding:2px;">${nav}</nav>
      <button data-action="go" data-screen="grupos" style="flex:none;display:flex;align-items:center;gap:8px;padding:8px 13px;border-radius:11px;border:1.5px solid #FFD2DF;background:#FFF1F5;cursor:pointer;">
        ${badge(metaFor(MY), { w: 30, h: 21, fs: 10, r: 5 })}
        <span style="font-size:13px;font-weight:700;color:#C8102E;">Mi selección</span>
      </button>
    </div>
  </header>`;
}

// --- Banner en vivo ----------------------------------------------------------
function liveBannerHTML() {
  const items = LIVE.live || [];
  if (!items.length) return `<div id="live-banner"></div>`;
  const pills = items.map(x =>
    `<span style="display:inline-flex;align-items:center;gap:8px;"><span class="live-dot-css" style="width:9px;height:9px;border-radius:50%;background:#fff;"></span>${esc(x.home)} ${x.homeScore ?? 0}-${x.awayScore ?? 0} ${esc(x.away)} (${x.minute ?? ''}')</span>`
  ).join('');
  return `<div id="live-banner" style="background:linear-gradient(90deg,#FF2D7E,#C9184A);color:#fff;font-weight:700;padding:10px 0;">
    <div style="max-width:1200px;margin:0 auto;padding:0 20px;display:flex;gap:22px;justify-content:center;flex-wrap:wrap;">${pills}</div></div>`;
}
function refreshLive() {
  loadJSON('./data/live.json').then(l => {
    if (!l) return;
    LIVE = l;
    const node = document.getElementById('live-banner');
    if (node) node.outerHTML = liveBannerHTML();
  });
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
  return `<div data-action="open" data-id="${m.id}" class="hov-slide" style="display:flex;align-items:center;gap:12px;padding:11px 12px;border-radius:14px;background:${m.isEsp ? '#FFF7FA' : '#F8FAFD'};cursor:pointer;border:1px solid ${m.isEsp ? '#FFE0EA' : '#EDF1F6'};">
    <div style="font-size:11px;font-weight:800;color:#8A98A8;width:54px;line-height:1.3;flex:none;">${m.f.day} ${m.f.mon}<br><span style="color:#0B1B2B;">${m.f.time}</span></div>
    <div style="display:flex;align-items:center;gap:7px;flex:1;min-width:0;">${badge(m.a)}<span style="font-size:13px;font-weight:700;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(m.a.es)}</span></div>
    <span style="font-size:11px;font-weight:800;color:#C9D4E0;">vs</span>
    <div style="display:flex;align-items:center;gap:7px;flex:1;min-width:0;justify-content:flex-end;"><span style="font-size:13px;font-weight:700;flex:1;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(m.b.es)}</span>${badge(m.b)}</div>
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
function screenInicio() {
  const live = (LIVE.live || []).length > 0;
  const todays = UPCOMING.slice(0, 5);
  const statN = [[48, 'Selecciones', '#FF2D7E'], [MATCHES.length || 104, 'Partidos', '#7C4DFF'], [16, 'Sedes', '#1D6FF2'], [3, 'Países anfitriones', '#16C784']];
  const stats = statN.map(([n, l, c]) =>
    `<div style="background:#fff;border:1px solid #EDF1F6;border-radius:20px;padding:22px;text-align:center;box-shadow:0 10px 30px -22px rgba(11,27,43,.4);"><div data-count="${n}" style="font-family:'Archivo';font-weight:900;font-size:clamp(34px,5vw,52px);line-height:1;color:${c};letter-spacing:-1.5px;">${n}</div><div style="font-size:13px;font-weight:600;color:#5B6B7B;margin-top:8px;">${l}</div></div>`).join('');
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
    <div data-anim style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-bottom:44px;">${stats}</div>
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
  return `<div data-anim data-action="open" data-id="${m.id}" class="hov-lift" style="display:flex;align-items:center;gap:clamp(10px,2vw,22px);padding:16px clamp(14px,2vw,22px);border-radius:18px;background:${m.isEsp ? '#FFF7FA' : '#fff'};border:1px solid ${m.isEsp ? '#FFD2DF' : '#EDF1F6'};cursor:pointer;box-shadow:0 8px 26px -22px rgba(11,27,43,.5);">
    <div style="text-align:center;flex:none;width:62px;border-right:1px solid #E6EBF0;padding-right:clamp(8px,2vw,18px);">
      <div style="font-family:'Archivo';font-weight:900;font-size:16px;">${m.f.day}</div>
      <div style="font-size:10px;font-weight:700;color:#8A98A8;letter-spacing:1px;">${m.f.mon}</div>
      <div style="font-size:12px;font-weight:700;color:#7C4DFF;margin-top:4px;">${m.f.time}</div></div>
    <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;justify-content:flex-end;"><span style="font-size:clamp(13px,1.7vw,16px);font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(m.a.es)}</span>${badge(m.a, { w: 40, h: 28, fs: 11, r: 7 })}</div>
    <span style="font-family:'Archivo';font-weight:900;font-size:13px;color:#C9D4E0;flex:none;">VS</span>
    <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">${badge(m.b, { w: 40, h: 28, fs: 11, r: 7 })}<span style="font-size:clamp(13px,1.7vw,16px);font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(m.b.es)}</span></div>
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

// --- Pantalla: Eliminatorias -------------------------------------------------
function bracketMatch(m) {
  const clickable = !m.a.tbd && !m.b.tbd && m.status !== 'finished' ? `data-action="open" data-id="${m.id}"` : (m.status === 'finished' ? `data-action="open" data-id="${m.id}"` : '');
  const esp = m.isEsp;
  const glow = esp ? 'box-shadow:0 0 0 1.5px #C8102E inset,0 10px 26px -16px rgba(200,16,46,.6);' : 'box-shadow:0 8px 22px -20px rgba(11,27,43,.6);';
  const line = (meta) => `<div style="display:flex;align-items:center;gap:9px;padding:5px 0;">${badge(meta, { w: 32, h: 22, fs: 9, r: 5 })}<span style="font-size:13px;font-weight:600;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${meta.tbd ? '#A6B2C0' : '#0B1B2B'};">${esc(meta.es)}</span></div>`;
  return `<div ${clickable} class="hov-scale" style="background:${esp ? '#FFF1F5' : '#fff'};border:1.5px solid ${esp ? '#C8102E' : '#EDF1F6'};border-radius:14px;padding:11px 13px;cursor:${clickable ? 'pointer' : 'default'};${glow}">
    ${line(m.a)}<div style="height:1px;background:#EDF1F6;margin:2px 0;"></div>${line(m.b)}</div>`;
}
function screenBracket() {
  const cols = BRACKET_ORDER.map(([round, name]) => {
    const ms = MATCHES.filter(m => m.round === round).sort((a, b) => a.id - b.id);
    const cards = ms.map(bracketMatch).join('') || `<div style="color:#A6B2C0;font-size:12px;text-align:center;padding:10px;">Por definir</div>`;
    return `<div data-anim style="display:flex;flex-direction:column;justify-content:space-around;gap:14px;width:clamp(190px,20vw,230px);flex:none;">
      <div style="text-align:center;font-family:'Archivo';font-weight:800;font-size:13px;letter-spacing:1.5px;color:#8A98A8;text-transform:uppercase;padding-bottom:4px;">${name}</div>${cards}</div>`;
  }).join('');
  return `<section data-screen style="padding-top:30px;">
    <div data-anim style="display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:24px;">
      <div><h2 style="margin:0;font-family:'Archivo';font-weight:900;font-size:clamp(30px,5vw,46px);letter-spacing:-1.5px;">Eliminatorias</h2>
        <p style="margin:6px 0 0;color:#5B6B7B;font-weight:500;">El camino hacia la final · desliza para explorar →</p></div>
      <div style="display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:11px;background:#FFF1F5;border:1px solid #FFD2DF;">
        <span style="width:12px;height:12px;border-radius:4px;background:#C8102E;"></span><span style="font-size:12px;font-weight:700;color:#C8102E;">Camino de ${esc(metaFor(MY).es)}</span></div></div>
    <div style="overflow-x:auto;padding:6px 2px 18px;"><div style="display:flex;gap:clamp(16px,3vw,40px);min-width:max-content;align-items:stretch;">${cols}</div></div></section>`;
}

// --- Pantalla: Resultados ----------------------------------------------------
function resultCard(m) {
  const [sa, sb] = m.score.ft; const aw = sa > sb, bw = sb > sa;
  const espGlow = m.isEsp ? 'box-shadow:0 0 0 1.5px #FFD2DF inset,0 10px 30px -24px rgba(11,27,43,.5);' : 'box-shadow:0 10px 30px -24px rgba(11,27,43,.5);';
  const side = (meta, score, win) => `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
    <span style="display:flex;align-items:center;gap:9px;min-width:0;">${badge(meta, { w: 36, h: 25, fs: 10, r: 6 })}<span style="font-size:15px;font-weight:${win ? 800 : 600};">${esc(meta.es)}</span></span>
    <span style="font-family:'Archivo';font-weight:900;font-size:22px;color:${win ? '#0B1B2B' : '#A6B2C0'};">${score}</span></div>`;
  return `<div data-anim data-action="open" data-id="${m.id}" class="hov-up" style="background:#fff;border:1px solid #EDF1F6;border-radius:18px;padding:18px;cursor:pointer;${espGlow}">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
      <span style="font-size:10px;font-weight:800;letter-spacing:1px;color:#8A98A8;">${esc(m.group ? 'GRUPO ' + m.group : roundEs(m.round))}</span>
      <span style="font-size:10px;font-weight:800;color:#16C784;padding:3px 8px;border-radius:6px;background:#16C7841a;">FINAL</span></div>
    <div style="display:flex;flex-direction:column;gap:9px;">${side(m.a, sa, aw)}${side(m.b, sb, bw)}</div></div>`;
}
function screenResultados() {
  const done = MATCHES.filter(m => m.status === 'finished').sort((a, b) => (b.kickoff || '').localeCompare(a.kickoff || ''));
  return `<section data-screen style="padding-top:30px;">
    <div data-anim style="margin-bottom:26px;"><h2 style="margin:0;font-family:'Archivo';font-weight:900;font-size:clamp(30px,5vw,46px);letter-spacing:-1.5px;">Resultados</h2>
      <p style="margin:6px 0 0;color:#5B6B7B;font-weight:500;">${done.length} partidos jugados · marcadores finales</p></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:14px;">${done.map(resultCard).join('')}</div></section>`;
}

// --- Modal de partido --------------------------------------------------------
function scorerLines(list, align) {
  if (!list.length) return '';
  return list.map(g => `<div style="font-size:12px;color:#5B6B7B;text-align:${align};">⚽ ${esc(g.name)} ${g.minute ? g.minute + "'" : ''}${g.penalty ? ' (p)' : ''}${g.owngoal ? ' (pp)' : ''}</div>`).join('');
}
function modalHTML() {
  if (!state.open) return '';
  const m = state.open;
  const finished = m.status === 'finished';
  const center = finished
    ? `<div style="font-family:'Archivo';font-weight:900;font-size:30px;letter-spacing:1px;">${m.score.ft[0]} - ${m.score.ft[1]}</div>`
    : `<div style="font-family:'Archivo';font-weight:900;font-size:15px;color:#7C4DFF;white-space:nowrap;">PRÓXIMAMENTE</div>`;
  let panel;
  if (finished) {
    const hasGoals = m.scorers.home.length || m.scorers.away.length;
    panel = `<div style="font-size:11px;font-weight:800;letter-spacing:1px;color:#8A98A8;margin-bottom:12px;text-align:center;">${hasGoals ? 'GOLEADORES' : 'RESULTADO FINAL'}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
        <div>${scorerLines(m.scorers.home, 'left') || '<div style="font-size:12px;color:#A6B2C0;">—</div>'}</div>
        <div>${scorerLines(m.scorers.away, 'right') || '<div style="font-size:12px;color:#A6B2C0;text-align:right;">—</div>'}</div></div>`;
  } else {
    panel = `<div style="font-size:11px;font-weight:800;letter-spacing:1px;color:#8A98A8;margin-bottom:10px;text-align:center;">INFORMACIÓN</div>
      <div style="font-size:13px;color:#5B6B7B;text-align:center;line-height:1.7;">${esc(m.f.full)} · ${esc(m.f.time)}<br>${esc(m.venue || 'Sede por confirmar')}</div>`;
  }
  const big = (meta) => `<div style="text-align:center;flex:1;"><div style="width:74px;height:74px;margin:0 auto;border-radius:20px;overflow:hidden;box-shadow:0 14px 26px -12px ${meta.color};">${flagFill(meta, 22)}</div><div style="font-weight:800;font-size:15px;margin-top:10px;">${esc(meta.es)}</div></div>`;
  return `<div data-action="close-backdrop" style="position:fixed;inset:0;z-index:60;background:rgba(11,27,43,.55);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:20px;">
    <div style="position:relative;width:100%;max-width:460px;background:#fff;border-radius:26px;overflow:hidden;box-shadow:0 40px 90px -30px rgba(11,27,43,.7);">
      <div style="height:5px;background:linear-gradient(90deg,#FF2D7E,#7C4DFF,#1D6FF2,#16C784);"></div>
      <button data-action="close" style="position:absolute;top:16px;right:16px;width:34px;height:34px;border-radius:50%;border:none;background:#F3F5FA;cursor:pointer;font-size:17px;color:#5B6B7B;z-index:2;">✕</button>
      <div style="padding:26px 26px 28px;">
        <div style="text-align:center;font-size:12px;font-weight:800;letter-spacing:1.5px;color:#7C4DFF;">${esc(m.group ? 'Grupo ' + m.group : roundEs(m.round))}</div>
        <div style="text-align:center;font-size:13px;color:#8A98A8;font-weight:600;margin-top:6px;">${esc(m.f.full)} · ${esc(m.venue || '')}</div>
        <div style="display:flex;align-items:center;justify-content:center;gap:18px;margin:24px 0;">${big(m.a)}<div style="text-align:center;flex:none;">${center}</div>${big(m.b)}</div>
        <div style="background:#F3F5FA;border-radius:16px;padding:16px 18px;">${panel}</div>
      </div></div></div>`;
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
  document.getElementById('app').innerHTML =
    header() + liveBannerHTML() +
    `<main style="max-width:1200px;margin:0 auto;padding:0 20px 80px;">${screenHTML()}</main>` +
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
  const t = e.target.closest('[data-action]');
  if (!t) return;
  const action = t.getAttribute('data-action');
  if (action === 'go') return go(t.getAttribute('data-screen'));
  if (action === 'toggleEsp') { state.onlyEsp = !state.onlyEsp; return renderApp(); }
  if (action === 'open') {
    const m = BY_ID.get(Number(t.getAttribute('data-id')) || t.getAttribute('data-id'));
    if (m) { state.open = m; renderApp(); }
    return;
  }
  if (action === 'close') { state.open = null; return renderApp(); }
  if (action === 'close-backdrop') {
    // Solo cerrar si se hace clic en el fondo, no dentro del cuadro.
    if (e.target === t) { state.open = null; renderApp(); }
    return;
  }
});

init();
