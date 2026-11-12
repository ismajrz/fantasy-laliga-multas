# Notas técnicas

Para quien toque el código. Si solo quieres usar la web, no hace falta leer esto.

## Cómo funciona

| Ruta | Qué es |
| --- | --- |
| `public/` | La web: HTML, CSS, JS, fuentes Barlow (OFL), escudos (`img/escudos/FUENTES.md`), iconos, `manifest.webmanifest` y `sw.js` |
| `public/js/league.js` | Reglas de la liga y validación. Las usan la web y el servidor |
| `public/js/stats.js`, `public/js/history.js` | Estadísticas y textos del historial (funciones puras, con pruebas) |
| `functions/api/jornadas.js` | `GET` / `POST` / `DELETE` de jornadas, con PIN, corrección sin PIN, historial y copias |
| `functions/api/historial.js` | `GET /api/historial`: el historial, que puede ver todo el mundo |
| `server/core.js` | Código del servidor compartido: KV, PIN, permisos de 15 min, copias e historial |
| `workers/backup/` | Worker con cron que hace la copia semanal (miércoles) |
| `scripts/restore.mjs` | Restaurar una copia |
| `scripts/build-embedded-worker.mjs` | Mete toda la web en un solo `_worker.js` (así se publica) |
| `scripts/verify-*.mjs` | Pruebas |

### Datos en KV (binding `JORNADAS`)

| Clave | Contenido |
| --- | --- |
| `jornadas` | Todas las jornadas (array JSON). La API sigue devolviendo `{ jornadas: [...] }`, como siempre |
| `audit` | Historial, el más reciente primero (máximo 300 entradas). Cada entrada lleva `who`, `action` (guardar, editar, borrar o restaurar), `auth` (nueva, propia, pin o script), `n`, `at`, `before` y `after` |
| `backup:weekly:AAAA-MM-DD` | Copia semanal (la fecha es el día en que se hizo). Caduca sola a los 70 días, así que siempre hay unas 10 |
| `meta:lastweekly` | Semana ISO y clave de la última copia semanal (para no repetirla) |
| `backup:auto:<fecha>` | Copia automática antes de cada edición, borrado o restauración (también caduca a los 61 días) |
| `grace:<n>` | Permiso de corrección sin PIN de la jornada *n*. Solo se guarda el hash del token, y caduca a los 15 min |
| `pinfail:<ip>` | Intentos de PIN fallidos. Al quinto se bloquea 15 minutos |

Las jornadas pueden llevar una `date` opcional (`AAAA-MM-DD`). Las antiguas no la tienen y siguen siendo válidas.
Sin fechas, las estadísticas enseñan el «peor tramo de 4 jornadas» en vez del peor mes: no se inventa ninguna fecha.

## PIN (secreto del servidor)

El PIN **no está en el código ni en el repositorio**. El servidor solo conoce su hash, guardado en el secreto `ADMIN_PIN_HASH`:

```bash
# hash del PIN (cambia 0000 por el PIN de verdad)
node -e "console.log(require('crypto').createHash('sha256').update('fantasy-laliga|' + process.argv[1]).digest('hex'))" 0000

# en Cloudflare (proyecto de Pages)
npx wrangler pages secret put ADMIN_PIN_HASH --project-name fantasy-laliga

# en local: fichero .dev.vars (está en .gitignore)
ADMIN_PIN_HASH=<el hash>
```

Si falta el secreto, editar y borrar responden *503 "El PIN de administración no está configurado"*. Guardar jornadas nuevas sigue funcionando.
En el móvil, el PIN se recuerda solo mientras dura la sesión (`sessionStorage`).

## Copias de seguridad y restaurar

- **Semanal:** la hace el Worker `workers/backup` cada miércoles a las 03:30 UTC (04:30 en Madrid en invierno). Además, el primer cambio de cada semana (de lunes a domingo) deja también una copia semanal, así que hay al menos una por semana aunque el Worker no esté publicado. Se guardan unas 10 semanas.
- **Antes de cada cambio:** cada edición, borrado o restauración guarda antes una copia `backup:auto:…`.
- **Restaurar** (necesita `npx wrangler login` o `CLOUDFLARE_API_TOKEN`):

```bash
node scripts/restore.mjs --list                       # ver las copias (tipo, fecha, nº de jornadas y caducidad)
node scripts/restore.mjs backup:weekly:2026-11-11     # restaurar una (pide confirmación)
node scripts/restore.mjs --latest --who Jugador9
node scripts/restore.mjs --file data/jornadas-backup.json
# añade --local para probar con el KV de `npm run dev`
```

Antes de restaurar guarda lo que haya en ese momento (`backup:auto:…-antes-de-restaurar`), y la restauración queda en el historial.

## En tu ordenador

```bash
npm install
# .dev.vars con ADMIN_PIN_HASH (ver arriba)
npm run dev                                    # http://localhost:8788 con KV local
npm test                                       # reglas, WhatsApp, servidor (PIN, 15 min, copias semanales), estadísticas
TEST_ADMIN_PIN=<tu PIN> npm run test:api       # API de punta a punta contra el servidor local
```

## Publicar

Cada push a `main` se publica solo con GitHub Actions (`.github/workflows/deploy.yml`):
primero pasa las pruebas, luego publica la web en Pages y después el Worker de copias semanales.
Hacen falta estos secretos en el repositorio (*Settings → Secrets and variables → Actions*):

| Secreto | Valor |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | El id de la cuenta de Cloudflare |
| `CLOUDFLARE_API_TOKEN` | Token personalizado con **Account → Cloudflare Pages → Edit** y **Account → Workers Scripts → Edit** |

Y en Cloudflare, el secreto `ADMIN_PIN_HASH` del proyecto de Pages (ver *PIN*).

> ¿Por qué no la integración con Git de Cloudflare? El proyecto `fantasy-laliga` se creó subiendo los archivos
> directamente (*Direct Upload*), y Cloudflare no deja conectarle un repositorio después: habría que crear otro
> proyecto y mover el dominio. Con GitHub Actions se mantiene el mismo proyecto, el mismo KV y el mismo dominio.
