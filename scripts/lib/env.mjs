import { readFileSync } from 'node:fs';

// Cargador mínimo de .env (sin dependencias). No pisa variables ya definidas
// en el entorno (en GitHub Actions la clave llega por Secrets, no por .env).
export function loadEnv(path = '.env') {
  try {
    const txt = readFileSync(path, 'utf8');
    for (const line of txt.split(/\r?\n/)) {
      if (!line || line.trim().startsWith('#')) continue;
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      const key = m[1];
      const val = m[2].replace(/^["']|["']$/g, '');
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    // .env no existe (normal en CI) → se ignora.
  }
}
