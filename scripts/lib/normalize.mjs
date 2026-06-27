import { codeForTeam, flagUrl } from './countries.mjs';

// --- Helpers -----------------------------------------------------------------

// openfootball da la hora como "13:00 UTC-6" -> la pasamos a ISO UTC.
export function toISO(date, time) {
  if (!date) return null;
  if (!time) return `${date}T00:00:00Z`;
  const m = String(time).match(/(\d{1,2}):(\d{2})\s*UTC\s*([+-]\d{1,2})?/i);
  if (!m) return `${date}T00:00:00Z`;
  const hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  const off = m[3] ? parseInt(m[3], 10) : 0; // UTC-6 => off=-6 => UTC = local - off
  const dt = new Date(`${date}T00:00:00Z`);
  dt.setUTCHours(hh - off, mm, 0, 0);
  return dt.toISOString();
}

function isFinished(m) {
  return !!(m.score && Array.isArray(m.score.ft) && m.score.ft.length === 2 &&
    Number.isFinite(m.score.ft[0]) && Number.isFinite(m.score.ft[1]));
}

function mapScorers(list) {
  return (list || []).map(g => ({
    name: g.name,
    minute: g.minute,
    penalty: !!g.penalty,
    owngoal: !!g.owngoal
  }));
}

// --- Normalización de partidos ----------------------------------------------

export function normalizeMatches(raw) {
  return raw.matches.map((m, i) => {
    const stage = m.group ? 'group' : 'knockout';
    const finished = isFinished(m);
    const group = m.group ? m.group.replace(/^Group\s+/, '') : null;
    const homeCode = codeForTeam(m.team1);
    const awayCode = codeForTeam(m.team2);
    return {
      id: m.num ?? (i + 1),        // los KO traen num 73-104; los de grupo 1-72
      stage,
      round: m.round,
      group,
      date: m.date || null,
      time: m.time || null,
      kickoff: toISO(m.date, m.time),
      venue: m.ground || null,
      home: m.team1,
      away: m.team2,
      homeCode,
      awayCode,
      homeFlag: flagUrl(homeCode),
      awayFlag: flagUrl(awayCode),
      status: finished ? 'finished' : 'scheduled',
      score: finished ? { ft: m.score.ft, ht: m.score.ht || null } : null,
      scorers: { home: mapScorers(m.goals1), away: mapScorers(m.goals2) }
    };
  });
}

// --- Equipos -----------------------------------------------------------------

export function buildTeams(matches) {
  const seen = new Map();
  for (const m of matches) {
    if (m.stage !== 'group') continue;
    for (const side of ['home', 'away']) {
      const name = m[side];
      if (!seen.has(name)) {
        const code = m[side + 'Code'];
        seen.set(name, { name, code, flag: flagUrl(code), group: m.group });
      }
    }
  }
  return [...seen.values()].sort(
    (a, b) => (a.group || '').localeCompare(b.group || '') || a.name.localeCompare(b.name)
  );
}

// --- Clasificación (calculada desde los resultados) --------------------------
// Criterios: puntos > diferencia de goles > goles a favor > nombre.
// NOTA: el desempate "head-to-head" / fair-play de FIFA no está implementado;
// solo afecta a empates exactos en los 3 primeros criterios (poco frecuente).

function newRow(team, code) {
  return { team, code, flag: flagUrl(code), mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 };
}
function applyResult(r, gf, ga) {
  r.mp++; r.gf += gf; r.ga += ga;
  if (gf > ga) r.w++; else if (gf === ga) r.d++; else r.l++;
}
function pts(r) { return r.w * 3 + r.d; }
function cmpRows(a, b) {
  return pts(b) - pts(a) ||
    (b.gf - b.ga) - (a.gf - a.ga) ||
    (b.gf - a.gf) ||
    a.team.localeCompare(b.team);
}

// --- Resolver cruces de eliminatoria -----------------------------------------
// openfootball deja placeholders: "1H"/"2A" (puesto de grupo), "3A/B/.." (mejor
// tercero, indeterminado) y "W73" (ganador de partido). Resolvemos los puestos de
// grupos YA finalizados y los ganadores de partidos jugados; el resto queda TBD.
const POS_CODE = /^([12])([A-L])$/;
const WIN_CODE = /^W(\d+)$/;

export function resolveKnockout(matches, standings) {
  const pos = {};
  const groups = Array.isArray(standings) ? standings : (standings.groups || []);
  for (const g of groups) {
    const finished = g.table.length >= 2 && g.table.every(t => t.mp >= 3);
    if (finished) { pos['1' + g.group] = g.table[0].team; pos['2' + g.group] = g.table[1].team; }
  }
  const winnerOf = id => {
    const m = matches.find(x => x.id === id);
    if (!m || m.status !== 'finished') return null;
    const [h, a] = m.score.ft;
    if (h === a) return null;              // empate (penaltis): no determinable aquí
    return h > a ? m.home : m.away;
  };
  const resolve = name => {
    if (POS_CODE.test(name) && pos[name]) return pos[name];
    const w = WIN_CODE.exec(name);
    if (w) return winnerOf(Number(w[1]));
    return null;
  };
  // Punto fijo: resolver en cascada (W89 depende de W74/W77, etc.).
  let changed = true;
  while (changed) {
    changed = false;
    for (const m of matches) {
      if (m.stage !== 'knockout') continue;
      for (const side of ['home', 'away']) {
        if (m[side + 'Raw'] === undefined) m[side + 'Raw'] = m[side];
        if (META_KNOWN(m[side])) continue;       // ya es una selección real
        const r = resolve(m[side]);
        if (r && r !== m[side]) {
          m[side] = r;
          const code = codeForTeam(r);
          m[side + 'Code'] = code; m[side + 'Flag'] = flagUrl(code);
          changed = true;
        }
      }
    }
  }
}
function META_KNOWN(name) { return !!codeForTeam(name); }

export function buildStandings(matches) {
  const groups = new Map();
  for (const m of matches) {
    if (m.stage !== 'group') continue;
    if (!groups.has(m.group)) groups.set(m.group, new Map());
    const g = groups.get(m.group);
    if (!g.has(m.home)) g.set(m.home, newRow(m.home, m.homeCode));
    if (!g.has(m.away)) g.set(m.away, newRow(m.away, m.awayCode));
  }
  for (const m of matches) {
    if (m.stage !== 'group' || m.status !== 'finished') continue;
    const g = groups.get(m.group);
    const [hg, ag] = m.score.ft;
    applyResult(g.get(m.home), hg, ag);
    applyResult(g.get(m.away), ag, hg);
  }
  const out = [];
  for (const [name, g] of [...groups.entries()].sort()) {
    const table = [...g.values()].sort(cmpRows).map((r, idx) => ({
      pos: idx + 1,
      team: r.team, code: r.code, flag: r.flag,
      mp: r.mp, w: r.w, d: r.d, l: r.l,
      gf: r.gf, ga: r.ga, gd: r.gf - r.ga, pts: pts(r)
    }));
    out.push({ group: name, table });
  }
  return out;
}
