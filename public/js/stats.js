// Estadísticas de la liga a partir de las jornadas guardadas. Funciones puras (se prueban en
// scripts/verify-stats.mjs). Una racha solo cuenta jornadas seguidas: si falta una jornada por
// apuntar, la racha se corta.

import { NAMES, SLOTS, fineFor, jornadaCents } from './league.js';

const sorted = (js) => js.slice().sort((a, b) => a.n - b.n);
const finedIn = (j, name) => SLOTS.some(([s]) => j[s] === name);
const centsIn = (j, name) => SLOTS.reduce((sum, [s]) => sum + (j[s] === name ? fineFor(j, s) : 0), 0);

/** Recorre las jornadas y devuelve la racha más larga y la actual que cumplen test(j). */
function streak(list, test) {
  let best = { len: 0, from: null, to: null };
  let cur = { len: 0, from: null, to: null };
  let prev = null;
  for (const j of list) {
    if (prev !== null && j.n !== prev + 1) cur = { len: 0, from: null, to: null };
    if (test(j)) {
      cur = { len: cur.len + 1, from: cur.len ? cur.from : j.n, to: j.n };
      if (cur.len > best.len) best = { ...cur };
    } else cur = { len: 0, from: null, to: null };
    prev = j.n;
  }
  const last = list.at(-1);
  return { best, current: last && cur.to === last.n ? cur : { len: 0, from: null, to: null } };
}

/** Rachas de cada participante. */
export function playerStreaks(jornadas) {
  const list = sorted(jornadas);
  const out = {};
  for (const name of NAMES) {
    const fined = streak(list, (j) => finedIn(j, name));
    const clean = streak(list, (j) => !finedIn(j, name));
    const slots = {};
    for (const [s] of SLOTS) slots[s] = streak(list, (j) => j[s] === name);
    out[name] = { fined, clean, slots };
  }
  return out;
}

/** El mejor valor y todos los que lo comparten: { len, names: [...], from, to } */
function top(entries) {
  const max = Math.max(0, ...entries.map((e) => e.len));
  if (!max) return null;
  const winners = entries.filter((e) => e.len === max);
  return { len: max, names: winners.map((e) => e.name), from: winners[0].from, to: winners[0].to, slot: winners[0].slot };
}

/**
 * Récords de la temporada:
 *  slot   -> más jornadas seguidas en el mismo puesto (7º, 8º o 9º)
 *  fined  -> más jornadas seguidas pagando
 *  clean  -> más jornadas seguidas sin pagar
 *  now    -> rachas abiertas ahora mismo (pagando ≥ 2 o sin pagar ≥ 3)
 */
export function records(jornadas) {
  const st = playerStreaks(jornadas);
  const slotEntries = [];
  for (const name of NAMES) for (const [s] of SLOTS) slotEntries.push({ name, slot: s, ...st[name].slots[s].best });
  // En caso de empate en la racha de puesto, gana el puesto más caro (9º > 8º > 7º).
  const slotMax = Math.max(0, ...slotEntries.map((e) => e.len));
  const slotWin = slotEntries.filter((e) => e.len === slotMax).sort((a, b) => b.slot.localeCompare(a.slot));
  const slot = slotMax >= 2 ? top(slotWin.filter((e) => e.slot === slotWin[0].slot)) : null;
  const fined = top(NAMES.map((name) => ({ name, ...st[name].fined.best })));
  const clean = top(NAMES.map((name) => ({ name, ...st[name].clean.best })));
  const now = [];
  for (const name of NAMES) {
    const f = st[name].fined.current;
    const c = st[name].clean.current;
    if (f.len >= 2) now.push({ name, kind: 'fined', len: f.len });
    else if (c.len >= 3) now.push({ name, kind: 'clean', len: c.len });
  }
  now.sort((a, b) => (a.kind === b.kind ? b.len - a.len : a.kind === 'fined' ? -1 : 1));
  return { slot, fined, clean, now };
}

/** Quién pagó más en k jornadas seguidas (sin huecos). */
export function worstStretch(jornadas, k = 4) {
  const list = sorted(jornadas);
  let best = null;
  for (let i = 0; i + k <= list.length; i++) {
    const win = list.slice(i, i + k);
    if (win.at(-1).n - win[0].n !== k - 1) continue;
    for (const name of NAMES) {
      const cents = win.reduce((s, j) => s + centsIn(j, name), 0);
      if (!best || cents > best.cents) best = { names: [name], cents, from: win[0].n, to: win.at(-1).n };
      else if (cents === best.cents && best.from === win[0].n && !best.names.includes(name)) best.names.push(name);
    }
  }
  return best && best.cents ? best : null;
}

/** Peor mes por persona, solo con las jornadas que tienen fecha (campo date). */
export function worstMonth(jornadas) {
  const dated = jornadas.filter((j) => typeof j.date === 'string');
  if (!dated.length) return null;
  const acc = {};
  for (const j of dated) {
    const m = j.date.slice(0, 7);
    for (const name of NAMES) {
      const c = centsIn(j, name);
      if (c) acc[`${name}|${m}`] = (acc[`${name}|${m}`] || 0) + c;
    }
  }
  let best = null;
  for (const [k, cents] of Object.entries(acc)) {
    const [name, month] = k.split('|');
    if (!best || cents > best.cents || (cents === best.cents && month > best.month)) best = { names: [name], month, cents };
  }
  return best ? { ...best, dated: dated.length } : null;
}

/** Bote acumulado jornada a jornada: [{ n, cents }] */
export function potSeries(jornadas) {
  let sum = 0;
  return sorted(jornadas).map((j) => ({ n: j.n, cents: (sum += jornadaCents(j)) }));
}

/** "Jugador6", "Jugador6 y Jugador8", "Jugador6, Jugador8 y Jugador7" */
export function joinNames(names) {
  if (names.length <= 1) return names[0] || '';
  return names.slice(0, -1).join(', ') + ' y ' + names.at(-1);
}
