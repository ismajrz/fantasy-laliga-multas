// Prueba de la API de punta a punta contra el servidor LOCAL (npm run dev). Nunca contra producción.
//   TEST_ADMIN_PIN=<el PIN de .dev.vars> node scripts/verify-api.mjs [http://127.0.0.1:8788]
// Crea la J38 de prueba, la corrige, la borra y deja los datos como estaban.
import assert from 'node:assert/strict';

const BASE = process.argv[2] || 'http://127.0.0.1:8788';
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) { console.error('Solo contra el servidor local.'); process.exit(1); }
const PIN = process.env.TEST_ADMIN_PIN;
if (!PIN) { console.error('Falta TEST_ADMIN_PIN (el PIN con el que generaste ADMIN_PIN_HASH en .dev.vars).'); process.exit(1); }

const call = async (method, path, { body, headers = {} } = {}) => {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => null) };
};
let ok = 0;
const t = async (name, fn) => { await fn(); ok++; console.log('  ✓ ' + name); };
const N = 38;

const before = (await call('GET', '/api/jornadas')).data.jornadas;
assert.ok(!before.find((j) => j.n === N), `La J${N} ya existe en local: no la toco`);
const auditBefore = (await call('GET', '/api/historial')).data.entries.length;
let token, token2;

await t('GET /api/jornadas sigue igual ({ jornadas })', async () => assert.ok(Array.isArray(before)));
await t('guardar una jornada nueva no pide PIN y devuelve el permiso de 15 min', async () => {
  const r = await call('POST', '/api/jornadas', { body: { n: N, p7: 'Jugador1', p8: 'Jugador2', p9: 'Jugador3', date: '2026-11-12', who: 'Jugador6' } });
  assert.equal(r.status, 200); assert.equal(r.data.action, 'guardar'); assert.equal(r.data.undo.n, N);
  assert.ok(r.data.undo.expiresAt - Date.now() > 14 * 60e3);
  token = r.data.undo.token;
});
await t('guardar lo mismo otra vez no cambia nada', async () => {
  const r = await call('POST', '/api/jornadas', { body: { n: N, p7: 'Jugador1', p8: 'Jugador2', p9: 'Jugador3', date: '2026-11-12', who: 'Jugador6' } });
  assert.equal(r.data.action, 'igual');
});
await t('editar sin token ni PIN -> 401', async () => {
  const r = await call('POST', '/api/jornadas', { body: { n: N, p7: 'Jugador1', p8: 'Jugador2', p9: 'Jugador7', who: 'Jugador8' } });
  assert.equal(r.status, 401); assert.equal(r.data.pin, 'required');
});
await t('editar con un token de otro móvil -> 401', async () => {
  const r = await call('POST', '/api/jornadas', { body: { n: N, p7: 'Jugador1', p8: 'Jugador2', p9: 'Jugador7' }, headers: { 'x-undo-token': 'a'.repeat(32) } });
  assert.equal(r.status, 401);
});
await t('corregir con el token propio -> 200, "propia", sin alargar el plazo', async () => {
  const r = await call('POST', '/api/jornadas', { body: { n: N, p7: 'Jugador1', p8: 'Jugador2', p9: 'Jugador7', date: '2026-11-12', who: 'Jugador6' }, headers: { 'x-undo-token': token } });
  assert.equal(r.status, 200); assert.equal(r.data.auth, 'propia'); assert.equal(r.data.undo, undefined);
});
await t('PIN incorrecto -> 401 con mensaje claro', async () => {
  const r = await call('POST', '/api/jornadas', { body: { n: N, p7: 'Jugador4', p8: 'Jugador2', p9: 'Jugador7' }, headers: { 'x-admin-pin': '0' + PIN } });
  assert.equal(r.status, 401); assert.match(r.data.error, /PIN incorrecto/);
});
await t('editar con PIN -> 200, "pin"', async () => {
  const r = await call('POST', '/api/jornadas', { body: { n: N, p7: 'Jugador4', p8: 'Jugador2', p9: 'Jugador7', who: 'Jugador9' }, headers: { 'x-admin-pin': PIN } });
  assert.equal(r.status, 200); assert.equal(r.data.auth, 'pin'); assert.ok(r.data.undo.token);
  token2 = r.data.undo.token;
});
await t('tras un cambio con PIN, el permiso del primer móvil deja de valer', async () => {
  const r = await call('DELETE', `/api/jornadas?n=${N}&who=Jugador6`, { headers: { 'x-undo-token': token } });
  assert.equal(r.status, 401);
});
await t('borrar sin nada -> 401', async () => assert.equal((await call('DELETE', `/api/jornadas?n=${N}`)).status, 401));
await t('borrar con el token propio (el del cambio con PIN) -> 200, "propia"', async () => {
  const r = await call('DELETE', `/api/jornadas?n=${N}&who=Jugador9`, { headers: { 'x-undo-token': token2 } });
  assert.equal(r.status, 200); assert.equal(r.data.auth, 'propia');
});
await t('los datos vuelven a estar como al principio', async () => {
  const now = (await call('GET', '/api/jornadas')).data.jornadas;
  assert.deepEqual(now.map((j) => [j.n, j.p7, j.p8, j.p9, j.tie]), before.map((j) => [j.n, j.p7, j.p8, j.p9, j.tie]));
});
await t('editar una jornada antigua (J1) sin PIN -> 401', async () => {
  const j1 = before.find((j) => j.n === 1);
  const r = await call('POST', '/api/jornadas', { body: { ...j1, p7: j1.p8, p8: j1.p7 } });
  assert.equal(r.status, 401);
});
await t('el historial registra todo con quién y cómo', async () => {
  const e = (await call('GET', '/api/historial')).data.entries;
  const mine = e.slice(0, e.length - auditBefore);
  assert.deepEqual(mine.map((x) => `${x.who}:${x.action}:${x.auth}`), ['Jugador9:borrar:propia', 'Jugador9:editar:pin', 'Jugador6:editar:propia', 'Jugador6:guardar:nueva']);
  assert.deepEqual(mine[1].before, { p7: 'Jugador1', p8: 'Jugador2', p9: 'Jugador7', date: '2026-11-12' });
});
await t('métodos raros -> 405', async () => assert.equal((await call('PUT', '/api/jornadas')).status, 405));
console.log(`verify-api: ${ok} pruebas OK`);
