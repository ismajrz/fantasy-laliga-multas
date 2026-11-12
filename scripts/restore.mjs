// Restaurar las jornadas desde una copia de seguridad del KV (o desde un fichero JSON).
//
//   node scripts/restore.mjs --list                      -> copias disponibles (semanales y automáticas)
//   node scripts/restore.mjs --latest                    -> restaura la copia más reciente
//   node scripts/restore.mjs backup:weekly:2026-11-11    -> restaura esa copia
//   node scripts/restore.mjs --file data/jornadas-backup.json
// Opciones: --local (KV de `wrangler pages dev`), --yes (sin preguntar), --who Jugador9 (para el historial).
//
// Antes de restaurar guarda lo que haya ahora como backup:auto:… y deja una entrada "restaurar"
// en el historial. Necesita `npx wrangler login` (o CLOUDFLARE_API_TOKEN) para el KV remoto.
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { NAMES, isValidJornada, totals } from '../public/js/league.js';
import { KEY, AUDIT_KEY, AUDIT_MAX, BACKUP_TTL } from '../server/core.js';

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : null);
const where = flag('--local') ? '--local' : '--remote';
const tmp = await mkdtemp(join(tmpdir(), 'restore-'));

const wr = (...a) => execFileSync('npx', ['wrangler', 'kv', ...a, '--binding', 'JORNADAS', where], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
const getKey = (k) => { try { const v = wr('key', 'get', k).trim(); return v ? JSON.parse(v) : null; } catch { return null; } };
async function putKey(k, value, ...extra) {
  const f = join(tmp, 'v.json');
  await writeFile(f, JSON.stringify(value));
  wr('key', 'put', k, '--path', f, ...extra);
}
const eur = (c) => (c / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
const pot = (list) => { const t = totals(list); return NAMES.reduce((s, n) => s + t[n].cents, 0); };
const describe = (list) => `${list.length} jornadas${list.length ? ` (J${list[0].n}–J${list.at(-1).n})` : ''}, bote ${eur(pot(list))}`;

async function listBackups() {
  const keys = JSON.parse(wr('key', 'list', '--prefix', 'backup:'));
  return keys.map((k) => ({ name: k.name, savedAt: k.metadata?.savedAt ?? null, count: k.metadata?.count ?? null, expiration: k.expiration ?? null,
    kind: k.name.startsWith('backup:weekly:') ? 'semanal' : k.name.startsWith('backup:daily:') ? 'diaria' : 'automática' }))
    .sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0) || b.name.localeCompare(a.name));
}
const madrid = (ms) => (ms ? new Date(ms).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }) + ' (Madrid)' : '¿?');

if (flag('--list')) {
  const all = await listBackups();
  if (!all.length) console.log('No hay copias todavía.');
  const n = (k) => all.filter((b) => b.kind === k).length;
  console.log(`${all.length} copias: ${n('semanal')} semanales (miércoles, 70 días) y ${n('automática')} automáticas (antes de cada cambio, 61 días)\n`);
  for (const b of all) {
    const exp = b.expiration ? ` · caduca ${new Date(b.expiration * 1000).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' })}` : '';
    console.log(`${b.kind.padEnd(11)} ${b.name.padEnd(56)} ${madrid(b.savedAt).padEnd(30)} ${b.count ?? '?'} jornadas${exp}`);
  }
  process.exit(0);
}

let label, data;
if (opt('--file')) {
  label = opt('--file');
  data = JSON.parse(await readFile(label, 'utf8'));
} else {
  label = flag('--latest') ? (await listBackups())[0]?.name : args.find((a) => a.startsWith('backup:'));
  if (!label) { console.error('Indica una copia (backup:…), --latest o --file. Usa --list para verlas.'); process.exit(1); }
  data = getKey(label);
  if (!data) { console.error(`No existe la copia ${label}`); process.exit(1); }
}
const raw = Array.isArray(data) ? data : data.jornadas;
if (!Array.isArray(raw)) { console.error('La copia no tiene un array de jornadas'); process.exit(1); }
const next = raw.filter(isValidJornada).sort((a, b) => a.n - b.n);
if (next.length !== raw.length) console.warn(`Aviso: ${raw.length - next.length} jornada(s) no válida(s) descartada(s)`);
if (new Set(next.map((j) => j.n)).size !== next.length) { console.error('La copia tiene jornadas repetidas'); process.exit(1); }

const current = getKey(KEY) || [];
console.log(`KV ${where === '--local' ? 'local' : 'remoto'}`);
console.log(`Ahora:     ${describe(current)}`);
console.log(`Restaurar: ${describe(next)}  ← ${label}`);

if (!flag('--yes')) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ans = (await rl.question('¿Restaurar? Escribe "si" para continuar: ')).trim().toLowerCase();
  rl.close();
  if (ans !== 'si' && ans !== 'sí') { console.log('Cancelado. No se ha cambiado nada.'); process.exit(0); }
}

const now = Date.now();
const safety = `backup:auto:${new Date(now).toISOString()}-antes-de-restaurar`;
await putKey(safety, { savedAt: now, jornadas: current }, '--ttl', String(BACKUP_TTL), '--metadata', JSON.stringify({ kind: 'auto', count: current.length, savedAt: now }));
await putKey(KEY, next);
const audit = getKey(AUDIT_KEY) || [];
const who = NAMES.includes(opt('--who')) ? opt('--who') : null;
audit.unshift({ id: now.toString(36), at: now, who, action: 'restaurar', auth: 'script', n: null, source: label,
  before: { count: current.length, cents: pot(current) }, after: { count: next.length, cents: pot(next) } });
await putKey(AUDIT_KEY, audit.slice(0, AUDIT_MAX));
console.log(`Hecho. Lo que había antes está en ${safety}.`);
