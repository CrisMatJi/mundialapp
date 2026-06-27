// Capa base (GRATIS, sin key, sin cuota): descarga el calendario/resultados de
// openfootball y genera data/matches.json, data/teams.json y data/standings.json.
import { writeFileSync, mkdirSync } from 'node:fs';
import { normalizeMatches, buildTeams, buildStandings, resolveKnockout } from './lib/normalize.mjs';

const SRC = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';
const DATA = new URL('../data/', import.meta.url);

function write(name, obj) {
  writeFileSync(new URL(name, DATA), JSON.stringify(obj, null, 2) + '\n');
  console.log('  → data/' + name);
}

async function main() {
  const res = await fetch(SRC);
  if (!res.ok) throw new Error('openfootball HTTP ' + res.status);
  const raw = await res.json();

  const matches = normalizeMatches(raw);
  const standings = buildStandings(matches);
  resolveKnockout(matches, standings); // rellena cruces de eliminatoria resolubles
  const teams = buildTeams(matches);
  const updated = new Date().toISOString();

  mkdirSync(DATA, { recursive: true });
  write('matches.json', { tournament: raw.name, source: 'openfootball', updated, count: matches.length, matches });
  write('teams.json', { updated, count: teams.length, teams });
  write('standings.json', { updated, source: 'computed from openfootball results', groups: standings });

  const played = matches.filter(m => m.status === 'finished').length;
  console.log(`OK base · ${matches.length} partidos (${played} jugados) · ${teams.length} equipos · ${standings.length} grupos`);
}

main().catch(e => { console.error('ERROR base:', e.message); process.exit(1); });
