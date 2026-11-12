// Reglas de la liga. Este módulo lo usan la web (public/js/app.js) y el servidor
// (functions/api/jornadas.js), así que las reglas y la validación son las mismas en los dos lados.

export const NAMES = ['Jugador1', 'Jugador2', 'Jugador3', 'Jugador4', 'Jugador5', 'Jugador6', 'Jugador7', 'Jugador8', 'Jugador9'];
export const TOTAL = 38;
export const SLOTS = [['p7', '7º'], ['p8', '8º'], ['p9', '9º']];
/** Multa de cada puesto, en céntimos. */
export const FINE = { p7: 100, p8: 150, p9: 200 };
/** Empates: los empatados se reparten a partes iguales las multas de los puestos que ocupan. */
export const TIES = { '78': ['p7', 'p8'], '89': ['p8', 'p9'], '789': ['p7', 'p8', 'p9'] };

export function fineFor(j, slot) {
  const group = TIES[j.tie];
  if (!group || !group.includes(slot)) return FINE[slot];
  const sum = group.reduce((s, x) => s + FINE[x], 0);
  return Math.round(sum / group.length);
}

/** Total de una jornada (los empates solo reparten, no cambian el total). */
export const jornadaCents = () => FINE.p7 + FINE.p8 + FINE.p9;

/** Fecha opcional de la jornada, AAAA-MM-DD (las jornadas antiguas no la tienen). */
export function isValidDate(d) {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = new Date(d + 'T12:00:00Z');
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
}

export function isValidJornada(j) {
  return !!j && Number.isInteger(j.n) && j.n >= 1 && j.n <= TOTAL &&
    NAMES.includes(j.p7) && NAMES.includes(j.p8) && NAMES.includes(j.p9) &&
    (!j.tie || !!TIES[j.tie]) && (!j.date || isValidDate(j.date));
}

/** Multas por participante: { Nombre: { p7, p8, p9, emp, cents } }. */
export function totals(jornadas) {
  const t = {};
  for (const n of NAMES) t[n] = { p7: 0, p8: 0, p9: 0, emp: 0, cents: 0 };
  for (const j of jornadas) {
    for (const [slot] of SLOTS) {
      const who = j[slot];
      const tied = TIES[j.tie] && TIES[j.tie].includes(slot);
      if (tied) t[who].emp++; else t[who][slot]++;
      t[who].cents += fineFor(j, slot);
    }
  }
  return t;
}

/**
 * Valida y normaliza una jornada recibida (mismas reglas que tenía la función de Netlify).
 * Devuelve null si no es válida.
 */
export function cleanJornada(body, now = Date.now()) {
  const n = Number(body?.n);
  if (!Number.isInteger(n) || n < 1 || n > TOTAL) return null;
  const { p7, p8, p9 } = body;
  if (![p7, p8, p9].every((x) => NAMES.includes(x))) return null;
  if (new Set([p7, p8, p9]).size !== 3) return null;
  const rec = { n, p7, p8, p9, updatedAt: now };
  if (['78', '89', '789'].includes(body?.tie)) rec.tie = body.tie;
  if (isValidDate(body?.date)) rec.date = body.date;
  return rec;
}
