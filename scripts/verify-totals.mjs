// Comprueba que el cálculo de multas nuevo (public/js/league.js) da exactamente lo mismo
// que el de la web original con los datos de la copia de seguridad.
import { readFile } from 'node:fs/promises';
import { NAMES, totals } from '../public/js/league.js';

const data = JSON.parse(await readFile('data/jornadas-backup.json', 'utf8')).jornadas;

// Cálculo original, copiado tal cual de la web de Netlify (index.html).
function originalTotals(jornadas) {
  var SLOTS = [['p7', '7º'], ['p8', '8º'], ['p9', '9º']];
  var FINE = { p7: 100, p8: 150, p9: 200 };
  var TIES = { '78': ['p7', 'p8'], '89': ['p8', 'p9'], '789': ['p7', 'p8', 'p9'] };
  function fineFor(j, slot) {
    var group = TIES[j.tie];
    if (!group || group.indexOf(slot) === -1) return FINE[slot];
    var sum = 0;
    group.forEach(function (x) { sum += FINE[x]; });
    return Math.round(sum / group.length);
  }
  var t = {};
  NAMES.forEach(function (n) { t[n] = { p7: 0, p8: 0, p9: 0, emp: 0, cents: 0 }; });
  jornadas.forEach(function (j) {
    SLOTS.forEach(function (s) {
      var who = j[s[0]];
      var tied = TIES[j.tie] && TIES[j.tie].indexOf(s[0]) !== -1;
      if (tied) t[who].emp++; else t[who][s[0]]++;
      t[who].cents += fineFor(j, s[0]);
    });
  });
  return t;
}

const a = originalTotals(data);
const b = totals(data);
let ok = JSON.stringify(a) === JSON.stringify(b);
// Casos extra con todos los tipos de empate.
for (const tie of ['78', '89', '789']) {
  const extra = data.concat([{ n: 30, p7: 'Jugador9', p8: 'Jugador8', p9: 'Jugador7', tie }]);
  ok = ok && JSON.stringify(originalTotals(extra)) === JSON.stringify(totals(extra));
}
const eur = (c) => (c / 100).toFixed(2).replace('.', ',') + ' €';
console.table(Object.fromEntries(NAMES.map((n) => [n, { original: eur(a[n].cents), nuevo: eur(b[n].cents) }])));
console.log('Bote total:', eur(NAMES.reduce((s, n) => s + b[n].cents, 0)));
console.log(ok ? 'OK: los totales coinciden' : 'ERROR: los totales no coinciden');
process.exit(ok ? 0 : 1);
