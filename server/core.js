// Lógica del servidor compartida por las Pages Functions (functions/api/*), el Worker de copias
// semanales (workers/backup) y los scripts. Sin dependencias: solo Web APIs (crypto.subtle, KV).
//
// Claves de KV (binding JORNADAS):
//   jornadas               -> array con todas las jornadas (lo que lee la web)
//   audit                  -> historial de cambios, el más reciente primero (máx. AUDIT_MAX)
//   backup:weekly:AAAA-MM-DD -> copia semanal (miércoles con cron, o primer cambio de la semana; caduca a los 70 días)
//   meta:lastweekly        -> { week: 'AAAA-Wnn', key } de la última copia semanal
//   backup:auto:<fecha ISO>-> copia automática antes de cada edición, borrado o restauración
//   grace:<n>              -> permiso de corrección sin PIN de la jornada n (caduca a los 15 min)
//   pinfail:<ip>           -> intentos de PIN fallidos (caduca a los 15 min)

import { NAMES, isValidJornada } from '../public/js/league.js';

export const KEY = 'jornadas';
export const AUDIT_KEY = 'audit';
export const AUDIT_MAX = 300;
export const BACKUP_TTL = 61 * 86400;      // copias automáticas (antes de editar, borrar o restaurar)
export const WEEKLY_TTL = 70 * 86400;      // copias semanales: ~10 semanas
export const WEEK_META = 'meta:lastweekly';
export const GRACE_MS = 15 * 60 * 1000;    // ventana para corregir sin PIN
export const PIN_MAX_FAILS = 5;
export const PIN_LOCK_S = 15 * 60;
export const PIN_SALT = 'fantasy-laliga|';

export const byNumber = (a, b) => a.n - b.n;

export const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });

export async function sha256hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Compara dos cadenas en tiempo constante (para hashes de la misma longitud). */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export function randomToken() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Fecha en Madrid (AAAA-MM-DD), para nombrar las copias semanales. */
export function madridDate(ms = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
}

/** Solo los campos que importan de una jornada, para el historial. */
export const brief = (j) => (j ? { p7: j.p7, p8: j.p8, p9: j.p9, ...(j.tie ? { tie: j.tie } : {}), ...(j.date ? { date: j.date } : {}) } : null);
export const sameJornada = (a, b) => JSON.stringify(brief(a)) === JSON.stringify(brief(b));
export const cleanWho = (who) => (NAMES.includes(who) ? who : null);

export async function readList(kv, seed = []) {
  const list = await kv.get(KEY, 'json');
  if (Array.isArray(list)) return list;
  const initial = seed.filter(isValidJornada).sort(byNumber);
  await kv.put(KEY, JSON.stringify(initial));
  return initial;
}

export const writeList = (kv, list) => kv.put(KEY, JSON.stringify(list.slice().sort(byNumber)));

/** Semana ISO (lunes a domingo) de una fecha AAAA-MM-DD: "2026-W46". */
export function isoWeek(ymd) {
  const d = new Date(ymd + 'T12:00:00Z');
  const day = (d.getUTCDay() + 6) % 7;            // lunes = 0
  d.setUTCDate(d.getUTCDate() - day + 3);         // jueves de esa semana
  const year = d.getUTCFullYear();
  const week = 1 + Math.floor((d - Date.UTC(year, 0, 1)) / 86400000 / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Copia de seguridad: automática (antes de un cambio destructivo) o semanal. */
export async function snapshot(kv, list, kind = 'auto', now = Date.now()) {
  const weekly = kind === 'weekly';
  const key = weekly ? `backup:weekly:${madridDate(now)}` : `backup:auto:${new Date(now).toISOString()}`;
  await kv.put(key, JSON.stringify({ savedAt: now, jornadas: list }),
    { expirationTtl: weekly ? WEEKLY_TTL : BACKUP_TTL, metadata: { kind, count: list.length, savedAt: now } });
  if (weekly) await kv.put(WEEK_META, JSON.stringify({ week: isoWeek(madridDate(now)), key }));
  return key;
}

/** El primer cambio de cada semana ISO deja también la copia semanal (por si el Worker con cron no está publicado). */
export async function weeklyIfMissing(kv, list, now = Date.now()) {
  const meta = await kv.get(WEEK_META, 'json');
  if (!meta || meta.week !== isoWeek(madridDate(now))) await snapshot(kv, list, 'weekly', now);
}

export async function readAudit(kv) {
  const a = await kv.get(AUDIT_KEY, 'json');
  return Array.isArray(a) ? a : [];
}

export async function addAudit(kv, entry) {
  const list = await readAudit(kv);
  list.unshift({ id: randomToken().slice(0, 12), at: Date.now(), ...entry });
  await kv.put(AUDIT_KEY, JSON.stringify(list.slice(0, AUDIT_MAX)));
}

/* ---------- PIN ---------- */
export const pinHash = (pin) => sha256hex(PIN_SALT + String(pin));

/**
 * Comprueba el PIN de la cabecera x-admin-pin contra el secreto ADMIN_PIN_HASH.
 * Devuelve null si es correcto o una Response de error (401, 429 o 503).
 */
export async function checkPin(request, env, kv) {
  if (!env.ADMIN_PIN_HASH) return json({ error: 'El PIN de administración no está configurado en el servidor (falta ADMIN_PIN_HASH).', pin: 'unset' }, 503);
  const pin = request.headers.get('x-admin-pin');
  if (!pin) return json({ error: 'Hace falta el PIN para editar o borrar.', pin: 'required' }, 401);
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const failKey = `pinfail:${ip}`;
  const fails = Number(await kv.get(failKey)) || 0;
  if (fails >= PIN_MAX_FAILS) return json({ error: 'Demasiados intentos con un PIN incorrecto. Espera 15 minutos.', pin: 'locked' }, 429);
  if (safeEqual(await pinHash(pin), String(env.ADMIN_PIN_HASH).trim().toLowerCase())) {
    if (fails) await kv.delete(failKey);
    return null;
  }
  await kv.put(failKey, String(fails + 1), { expirationTtl: PIN_LOCK_S });
  console.warn(`PIN incorrecto desde ${ip} (${fails + 1}/${PIN_MAX_FAILS})`);
  const left = PIN_MAX_FAILS - fails - 1;
  return json({ error: left > 0 ? `PIN incorrecto. Te quedan ${left} intento${left === 1 ? '' : 's'}.` : 'PIN incorrecto. Espera 15 minutos para volver a intentarlo.', pin: left > 0 ? 'wrong' : 'locked' }, left > 0 ? 401 : 429);
}

/* ---------- Corrección sin PIN (15 min, mismo dispositivo) ---------- */
export async function grantGrace(kv, rec, now = Date.now()) {
  const token = randomToken();
  const expiresAt = now + GRACE_MS;
  await kv.put(`grace:${rec.n}`, JSON.stringify({ hash: await sha256hex(token), savedAt: now, expiresAt, jornada: brief(rec) }), { expirationTtl: Math.ceil(GRACE_MS / 1000) + 60 });
  return { n: rec.n, token, expiresAt };
}

/** true si la cabecera x-undo-token es el permiso vigente de la jornada n. */
export async function checkGrace(request, kv, n, now = Date.now()) {
  const token = request.headers.get('x-undo-token');
  if (!token) return null;
  const g = await kv.get(`grace:${n}`, 'json');
  if (!g || now > g.expiresAt) return null;
  return safeEqual(await sha256hex(token), g.hash) ? g : null;
}
