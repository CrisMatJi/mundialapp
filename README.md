# Mundial 2026 ⚽

Web del Mundial 2026 con resultados, grupos, calendario y **marcador en vivo**.
100 % gratis y desplegable en **GitHub Pages**. Sin servidor propio: los datos los
genera **GitHub Actions** y se sirven como JSON estático.

## Cómo funciona (arquitectura de datos)

| Capa | Fuente | Coste | Qué aporta |
|------|--------|-------|------------|
| Base | [openfootball](https://github.com/openfootball/worldcup.json) (CC0) | Gratis, sin key | Calendario, resultados, equipos |
| Clasificación | Calculada desde los resultados | Gratis | Tablas de grupos |
| En vivo | [API-Football](https://www.api-football.com/) `fixtures?live=all` | Free tier (100 req/día) | Marcador minuto a minuto |

> **Por qué no consultamos `season=2026` directo en API-Football:** el plan gratuito
> lo bloquea (`"Free plans do not have access to this season"`). El endpoint
> `fixtures?live=all` sí funciona en gratis y es el que usamos para el directo.
> Si algún día el Mundial no aparece ahí, se cambia solo `scripts/fetch-live.mjs`
> a otro proveedor con el mismo formato (p. ej. KickoffAPI).

### Ahorro de cuota
`scripts/fetch-live.mjs` solo llama a la API si hay un partido del Mundial en su
ventana de juego (lo comprueba contra `data/matches.json`). Fuera de esa franja
**no gasta ninguna petición**.

## Estructura

```
.
├── index.html              # frontend (placeholder; se reemplaza por el diseño)
├── assets/                 # css + js del frontend
├── data/                   # JSON generado (lo actualizan los workflows)
│   ├── matches.json
│   ├── teams.json
│   ├── standings.json
│   └── live.json
├── scripts/                # generadores de datos (Node 20+, sin dependencias)
│   ├── fetch-base.mjs
│   ├── fetch-live.mjs
│   ├── serve.mjs           # servidor estático local
│   └── lib/
└── .github/workflows/      # cron de actualización (base cada 30 min, live cada 5 min)
```

## Desarrollo local

```bash
npm run data:base    # genera matches/teams/standings desde openfootball
npm run data:live    # genera live.json (necesita .env con API_FOOTBALL_KEY)
npm run serve        # http://localhost:8080
```

Crea un `.env` (copia de `.env.example`) con tu clave de API-Football:

```
API_FOOTBALL_KEY=tu_api_key_aqui
```

> `.env` está en `.gitignore`: **nunca** se sube al repo.

## Despliegue en GitHub Pages

1. Crea un repositorio **público** (Actions ilimitadas en repos públicos) y sube el proyecto.
2. **Settings → Secrets and variables → Actions → New repository secret**
   - Nombre: `API_FOOTBALL_KEY`
   - Valor: tu clave (la misma del `.env`).
3. **Settings → Pages → Build and deployment → Source: _Deploy from a branch_**, rama `main`, carpeta `/ (root)`.
4. **Settings → Actions → General → Workflow permissions → _Read and write permissions_** (para que el bot pueda commitear los datos).
5. Listo: los workflows actualizan `data/*.json` y Pages republica automáticamente.

## Licencia de datos
Datos base bajo dominio público (CC0) de openfootball. Marcador en vivo vía API-Football
(uso personal, plan gratuito).
