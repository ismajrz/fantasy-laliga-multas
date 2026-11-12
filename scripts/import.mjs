// Carga las jornadas en el KV de Cloudflare (clave "jornadas" del binding JORNADAS).
//
//   node scripts/import.mjs                    -> usa data/jornadas-backup.json y lo sube al KV remoto
//   node scripts/import.mjs --local            -> lo mismo, pero en el KV local de `wrangler pages dev`
//   node scripts/import.mjs --from <url|file>  -> otra fuente, p. ej. https://fantasy-isma.netlify.app/api/jornadas
//
// Sustituye por completo lo que haya en el KV. Valida cada jornada con las mismas reglas que la API.
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { isValidJornada } from '../public/js/league.js';

const args = process.argv.slice(2);
const local = args.includes('--local');
const fromIdx = args.indexOf('--from');
const source = fromIdx !== -1 ? args[fromIdx + 1] : 'data/jornadas-backup.json';

const raw = /^https?:\/\//.test(source)
  ? await (await fetch(source, { cache: 'no-store' })).text()
  : await readFile(source, 'utf8');
const data = JSON.parse(raw);
const list = Array.isArray(data) ? data : data.jornadas;
if (!Array.isArray(list)) throw new Error('El JSON debe ser { "jornadas": [...] } o un array');

const valid = list.filter(isValidJornada).sort((a, b) => a.n - b.n);
const dropped = list.length - valid.length;
if (dropped) console.warn(`Aviso: ${dropped} jornada(s) no válida(s) descartada(s)`);
if (new Set(valid.map((j) => j.n)).size !== valid.length) throw new Error('Hay jornadas repetidas');

const out = 'data/kv-import.json';
await writeFile(out, JSON.stringify(valid));
console.log(`${valid.length} jornadas listas (${valid.map((j) => j.n).join(', ')}). Subiendo a KV ${local ? 'local' : 'remoto'}…`);

execFileSync('npx', ['wrangler', 'kv', 'key', 'put', 'jornadas', '--path', out, '--binding', 'JORNADAS', local ? '--local' : '--remote'], { stdio: 'inherit' });
console.log('Hecho.');
