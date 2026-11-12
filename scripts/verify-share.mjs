// Comprueba los mensajes de WhatsApp: importes con empates, bote, líder y codificación del enlace.
import { readFile } from 'node:fs/promises';
import { jornadaMessage, rankingMessage, waLink, siteUrl, PUBLIC_URL } from '../public/js/share.js';

const data = JSON.parse(await readFile('data/jornadas-backup.json', 'utf8')).jornadas;
const j13 = { n: 13, p7: 'Jugador9', p8: 'Jugador8', p9: 'Jugador5' };
const withJ13 = data.concat([j13]);
let ok = true;
const check = (cond, what) => { if (!cond) { ok = false; console.error('FALLO:', what); } };

const mJ13 = jornadaMessage(j13, withJ13);
const mJ12 = jornadaMessage(data.find((j) => j.n === 12), data);
const mRank = rankingMessage(data);
for (const [name, m] of [['Jornada 13 (ejemplo)', mJ13], ['Jornada 12 (con empate)', mJ12], ['Clasificación', mRank]]) {
  console.log(`----- ${name} -----\n${m}\n`);
  const link = waLink(m);
  check(link.startsWith('https://wa.me/?text='), 'prefijo wa.me');
  check(decodeURIComponent(link.slice('https://wa.me/?text='.length)) === m, 'ida y vuelta de la codificación');
  check(!/[^A-Za-z0-9\-_.!~*'()%]/.test(link.slice('https://wa.me/?text='.length)), 'solo caracteres seguros en la URL');
}
// Texto sencillo: solo ASCII imprimible, saltos de línea, letras con acento (Latin-1, incluye º) y €
const SAFE = /^[\x20-\x7E\n\u00C0-\u00FF\u00BA\u20AC]*$/;
for (const m of [mJ13, mJ12, mRank]) {
  check(SAFE.test(m), 'sin emojis ni símbolos raros: ' + [...m].filter((c) => !SAFE.test(c)).join(' '));
  check(!/[*_~—–]/.test(m), 'sin *negrita*, _cursiva_ ni rayas largas');
  check(!/\u00a0/.test(m), 'sin espacios duros');
}
check(mJ13 === ['Fantasy LaLiga - Jornada 13', '7º Jugador9 1,00 €', '8º Jugador8 1,50 €', '9º Jugador5 2,00 €', 'Bote: 58,50 €', 'Líder: Jugador5 15,00 €', PUBLIC_URL].join('\n'), 'mensaje J13 exacto');
check(mJ12.includes('7º Jugador3 1,25 €') && mJ12.includes('8º Jugador1 1,25 €') && mJ12.includes('Empate 7º-8º: Jugador3 y Jugador1 pagan 1,25 € cada uno'), 'empate J12');
check(mRank.startsWith('Fantasy LaLiga - Jornada 12 de 38\n1. Jugador5 13,00 €\n') && mRank.includes('\n9. Jugador9 1,00 €\nBote: 54,00 €\nhttps://tu-dominio.example'), 'clasificación');
// € y acentos sobreviven a la URL (UTF-8 con encodeURIComponent)
const enc = waLink('Líder 54,00 €').slice('https://wa.me/?text='.length);
check(enc === 'L%C3%ADder%2054%2C00%20%E2%82%AC', 'codificación UTF-8 de í y €: ' + enc);
check(waLink('7º').endsWith('7%C2%BA'), 'codificación de º');
check(siteUrl({ hostname: '127.0.0.1', origin: 'http://127.0.0.1:8788', protocol: 'http:' }) === PUBLIC_URL, 'URL en local');
check(siteUrl({ hostname: 'mi-proyecto.pages.dev', origin: 'https://mi-proyecto.pages.dev', protocol: 'https:' }) === 'https://mi-proyecto.pages.dev', 'URL publicada');
console.log('Ejemplo de enlace:', waLink(mJ13).slice(0, 140) + '…');
console.log(ok ? 'OK: mensajes de WhatsApp correctos' : 'ERROR en los mensajes');
process.exit(ok ? 0 : 1);
