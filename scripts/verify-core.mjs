// Pruebas del servidor sin red: PIN (hash, intentos, bloqueo), corrección sin PIN de 15 min y copias.
// Usa un KV falso en memoria y un PIN de prueba (no el de verdad).
import assert from 'node:assert/strict';
import { pinHash, checkPin, grantGrace, checkGrace, snapshot, weeklyIfMissing, isoWeek, addAudit, readAudit, madridDate, GRACE_MS, AUDIT_MAX } from '../server/core.js';

class FakeKV {
  constructor() { this.m = new Map(); this.opts = new Map(); }
  async get(k, type) { const v = this.m.get(k); if (v === undefined) return null; return type === 'json' ? JSON.parse(v) : v; }
  async put(k, v, o) { this.m.set(k, String(v)); this.opts.set(k, o); }
  async delete(k) { this.m.delete(k); }
}
const req = (headers = {}) => new Request('https://x/api/jornadas', { method: 'POST', headers });
let ok = 0;
const t = async (name, fn) => { await fn(); ok++; console.log('  ✓ ' + name); };

const kv = new FakeKV();
const env = { ADMIN_PIN_HASH: await pinHash('0000') };

await t('sin secreto configurado -> 503', async () => assert.equal((await checkPin(req({ 'x-admin-pin': '0000' }), {}, kv)).status, 503));
await t('sin PIN -> 401 required', async () => {
  const r = await checkPin(req(), env, kv); assert.equal(r.status, 401); assert.equal((await r.json()).pin, 'required');
});
await t('PIN correcto -> null', async () => assert.equal(await checkPin(req({ 'x-admin-pin': '0000' }), env, kv), null));
await t('PIN incorrecto -> 401 con intentos restantes', async () => {
  const r = await checkPin(req({ 'x-admin-pin': '9999', 'cf-connecting-ip': '1.1.1.1' }), env, kv);
  assert.equal(r.status, 401); assert.match((await r.json()).error, /Te quedan 4 intentos/);
});
await t('5 fallos -> 429 y bloqueado aunque luego acierte', async () => {
  for (let i = 0; i < 4; i++) await checkPin(req({ 'x-admin-pin': '9999', 'cf-connecting-ip': '1.1.1.1' }), env, kv);
  const r = await checkPin(req({ 'x-admin-pin': '0000', 'cf-connecting-ip': '1.1.1.1' }), env, kv);
  assert.equal(r.status, 429);
  assert.equal(kv.opts.get('pinfail:1.1.1.1').expirationTtl, 900);
});
await t('otra IP no queda bloqueada', async () => assert.equal(await checkPin(req({ 'x-admin-pin': '0000', 'cf-connecting-ip': '2.2.2.2' }), env, kv), null));

const now = Date.now();
const g = await grantGrace(kv, { n: 13, p7: 'Jugador1', p8: 'Jugador2', p9: 'Jugador3' }, now);
await t('el token se guarda como hash, nunca en claro', async () => {
  const stored = kv.m.get('grace:13'); assert.ok(!stored.includes(g.token)); assert.equal(g.expiresAt, now + GRACE_MS);
});
await t('token correcto dentro de los 15 min -> vale', async () => assert.ok(await checkGrace(req({ 'x-undo-token': g.token }), kv, 13, now + 14 * 60e3)));
await t('token correcto pasados 15 min -> no vale', async () => assert.equal(await checkGrace(req({ 'x-undo-token': g.token }), kv, 13, now + GRACE_MS + 1), null));
await t('token de otra jornada -> no vale', async () => assert.equal(await checkGrace(req({ 'x-undo-token': g.token }), kv, 12, now), null));
await t('token inventado (otro móvil) -> no vale', async () => assert.equal(await checkGrace(req({ 'x-undo-token': 'f'.repeat(32) }), kv, 13, now), null));

await t('semana ISO correcta (lunes a domingo, cambio de año)', async () => {
  assert.equal(isoWeek('2026-11-11'), '2026-W46'); assert.equal(isoWeek('2026-11-09'), '2026-W46'); assert.equal(isoWeek('2026-11-15'), '2026-W46');
  assert.equal(isoWeek('2026-11-16'), '2026-W47'); assert.equal(isoWeek('2027-01-01'), '2026-W53'); assert.equal(isoWeek('2027-01-04'), '2027-W01');
  assert.equal(isoWeek('2025-12-29'), '2026-W01');
});
await t('copia automática antes de cambios: 61 días', async () => {
  const key = await snapshot(kv, [{ n: 1 }], 'auto', now);
  assert.match(key, /^backup:auto:/); assert.equal(kv.opts.get(key).expirationTtl, 61 * 86400);
});
await t('copia semanal: 70 días, una por semana aunque haya muchos cambios', async () => {
  const mon = Date.parse('2026-11-09T10:00:00Z'), wed = Date.parse('2026-11-11T10:00:00Z'), nextMon = Date.parse('2026-11-16T10:00:00Z');
  const k2 = new FakeKV();
  await weeklyIfMissing(k2, [{ n: 1 }], mon);
  assert.ok(k2.m.has('backup:weekly:2026-11-09')); assert.equal(k2.opts.get('backup:weekly:2026-11-09').expirationTtl, 70 * 86400);
  await weeklyIfMissing(k2, [{ n: 2 }], wed);
  assert.ok(!k2.m.has('backup:weekly:2026-11-11'), 'misma semana: no se repite');
  await weeklyIfMissing(k2, [{ n: 3 }], nextMon);
  assert.ok(k2.m.has('backup:weekly:2026-11-16'), 'semana nueva: copia nueva');
  assert.equal([...k2.m.keys()].filter((k) => k.startsWith('backup:weekly:')).length, 2);
});
await t('el cron del miércoles siempre deja su copia', async () => {
  const k3 = new FakeKV();
  await weeklyIfMissing(k3, [{ n: 1 }], Date.parse('2026-11-09T10:00:00Z'));
  const key = await snapshot(k3, [{ n: 1 }, { n: 2 }], 'weekly', Date.parse('2026-11-11T03:30:00Z'));
  assert.equal(key, 'backup:weekly:2026-11-11'); assert.equal(JSON.parse(k3.m.get(key)).jornadas.length, 2);
});
await t(`el historial guarda como mucho ${AUDIT_MAX} entradas, la última primero`, async () => {
  for (let i = 0; i < AUDIT_MAX + 5; i++) await addAudit(kv, { who: 'Jugador6', action: 'guardar', n: (i % 38) + 1 });
  const a = await readAudit(kv); assert.equal(a.length, AUDIT_MAX); assert.equal(a[0].n, ((AUDIT_MAX + 4) % 38) + 1);
});
console.log(`verify-core: ${ok} pruebas OK`);
