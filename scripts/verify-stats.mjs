// Pruebas de estadísticas e historial con datos inventados y con la copia real de las 12 jornadas.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { records, worstStretch, worstMonth, potSeries, playerStreaks, joinNames } from '../public/js/stats.js';
import { entryTitle, entryDetail, entryAuth } from '../public/js/history.js';

const J = (n, p7, p8, p9, extra = {}) => ({ n, p7, p8, p9, ...extra });
const data = [
  J(1, 'Jugador1', 'Jugador2', 'Jugador6'), J(2, 'Jugador2', 'Jugador1', 'Jugador6'), J(3, 'Jugador7', 'Jugador5', 'Jugador6'),
  J(4, 'Jugador7', 'Jugador6', 'Jugador8'), J(6, 'Jugador3', 'Jugador4', 'Jugador6'),
];
const st = playerStreaks(data);
assert.equal(st.Jugador6.slots.p9.best.len, 3, 'Jugador6 3 seguidas de 9º');
assert.equal(st.Jugador6.fined.best.len, 4, 'Jugador6 multado J1–J4 (J5 falta y corta)');
assert.equal(st.Jugador6.fined.current.len, 1, 'la racha actual empieza tras el hueco');
assert.equal(st.Jugador9.clean.best.len, 4, 'sin multa también se corta en el hueco');
const r = records(data);
assert.deepEqual([r.slot.slot, r.slot.len, r.slot.names[0], r.slot.from, r.slot.to], ['p9', 3, 'Jugador6', 1, 3]);
assert.equal(r.fined.names[0], 'Jugador6');
const w = worstStretch(data, 4);
assert.deepEqual([w.names[0], w.cents, w.from, w.to], ['Jugador6', 750, 1, 4]);
assert.equal(worstMonth(data), null, 'sin fechas no hay peor mes');
const dated = [J(1, 'Jugador1', 'Jugador2', 'Jugador6', { date: '2026-08-20' }), J(2, 'Jugador6', 'Jugador2', 'Jugador1', { date: '2026-09-02' }), J(3, 'Jugador7', 'Jugador2', 'Jugador1', { date: '2026-09-15' })];
assert.deepEqual(worstMonth(dated), { names: ['Jugador1'], month: '2026-09', cents: 400, dated: 3 });
assert.deepEqual(potSeries(data).map((p) => p.cents), [450, 900, 1350, 1800, 2250]);
assert.equal(joinNames(['A', 'B', 'C']), 'A, B y C');

// Historial
const e = { who: 'Jugador6', action: 'editar', auth: 'propia', n: 12, before: { p7: 'Jugador1', p8: 'Jugador2', p9: 'Jugador7' }, after: { p7: 'Jugador1', p8: 'Jugador2', p9: 'Jugador8', tie: '89' } };
assert.equal(entryTitle(e), 'Jugador6 corrigió la J12');
assert.equal(entryDetail(e), '9º: Jugador7 → Jugador8 · empate: sin empate → 8º-9º');
assert.equal(entryAuth(e), 'Corrección propia');
assert.equal(entryTitle({ ...e, auth: 'pin' }), 'Jugador6 editó la J12');
assert.equal(entryAuth({ ...e, auth: 'pin' }), 'Con PIN');
assert.equal(entryTitle({ who: null, action: 'borrar', n: 3 }), 'Alguien borró la J3');

// Datos reales: no deben romper nada
const real = JSON.parse(await readFile(new URL('../data/jornadas-backup.json', import.meta.url))).jornadas;
const rr = records(real);
assert.ok(rr.fined && rr.clean, 'récords con los datos reales');
assert.equal(potSeries(real).at(-1).cents, 5400, 'bote real 54,00 €');
console.log(`verify-stats: OK · reales: racha de ${rr.slot?.slot} ${rr.slot?.len} (${rr.slot?.names}), pagando ${rr.fined.len} (${rr.fined.names}), sin multa ${rr.clean.len} (${rr.clean.names}), peor tramo ${JSON.stringify(worstStretch(real))}`);
