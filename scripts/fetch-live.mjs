// Capa EN VIVO: pide a API-Football los partidos en juego (fixtures?live=all),
// filtra los del Mundial y genera data/live.json.
//
// Ahorro de cuota (free = 100 req/día): solo llama a la API si hay algún partido
// del Mundial dentro de su ventana de juego (según data/matches.json). Fuera de
// esa ventana NO gasta ninguna petición.
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { loadEnv } from './lib/env.mjs';

loadEnv();
const KEY = process.env.API_FOOTBALL_KEY;
const WC_LEAGUE_ID = 1; // FIFA World Cup en API-Football
const API = 'https://v3.football.api-sports.io/fixtures?live=all';

const DATA = new URL('../data/', import.meta.url);
const LIVE = new URL('live.json', DATA);

function write(obj) {
  mkdirSync(DATA, { recursive: true });
  writeFileSync(LIVE, JSON.stringify(obj, null, 2) + '\n');
}
function payload(live, note) {
  return { updated: new Date().toISOString(), source: 'api-football', live, note };
}
// Garantiza que live.json exista (vacío) sin pisar uno ya presente.
function ensureExists(note) {
  if (!existsSync(LIVE)) write(payload([], note));
}

// ¿Hay algún partido del Mundial en ventana (-10 min .. +2h30)?
function inMatchWindow() {
  try {
    const data = JSON.parse(readFileSync(new URL('matches.json', DATA), 'utf8'));
    const now = Date.now();
    return data.matches.some(m => {
      if (!m.kickoff) return false;
      const k = new Date(m.kickoff).getTime();
      return now >= k - 10 * 60000 && now <= k + 150 * 60000;
    });
  } catch {
    return true; // sin matches.json: mejor intentar
  }
}

async function main() {
  if (!KEY) { write(payload([], 'sin API_FOOTBALL_KEY')); console.log('Sin key → live vacío.'); return; }
  if (!inMatchWindow()) { ensureExists('fuera de ventana de partidos'); console.log('Fuera de ventana de partidos: no se gasta cuota.'); return; }

  const res = await fetch(API, { headers: { 'x-apisports-key': KEY } });
  const json = await res.json();
  const all = json.response || [];
  const wc = all.filter(f => f.league && f.league.id === WC_LEAGUE_ID);

  const live = wc.map(f => ({
    id: f.fixture.id,
    minute: f.fixture.status.elapsed,
    status: f.fixture.status.short,
    statusLong: f.fixture.status.long,
    home: f.teams.home.name,
    away: f.teams.away.name,
    homeScore: f.goals.home,
    awayScore: f.goals.away,
    venue: f.fixture.venue?.name || null
  }));

  const note = live.length ? 'ok'
    : (all.length ? 'Mundial no presente en live=all (revisar free tier / KickoffAPI)' : 'sin partidos en vivo ahora');
  write(payload(live, note));
  console.log(`Live · Mundial: ${live.length} · live=all total: ${all.length} · ${note}`);
}

main().catch(e => { console.error('ERROR live:', e.message); write(payload([], 'error: ' + e.message)); });
