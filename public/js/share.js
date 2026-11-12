// Mensajes para avisar al grupo de WhatsApp. Sin bots: se abre WhatsApp con el texto ya escrito
// (https://wa.me/?text=...) y cada uno elige el grupo y pulsa enviar.
// Funciones puras para poder probarlas también en Node (scripts/verify-totals.mjs).

import { NAMES, TOTAL, SLOTS, TIES, fineFor, totals } from './league.js';

// Enlace de invitación de tu grupo de WhatsApp (https://chat.whatsapp.com/...). Si está vacío, el botón abre
// WhatsApp para elegir chat como siempre. Si lo rellenas, el botón copia el mensaje y abre el grupo directo.
export const GROUP_URL = '';

export const PUBLIC_URL = 'https://tu-dominio.example';

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
// Espacio normal antes del € para que WhatsApp no corte raro las líneas.
const fmt = (cents) => eur.format(cents / 100).replace(/\u00a0/g, ' ');

/** URL de la web: la real si estamos publicados; la pública si se abre en local. */
export function siteUrl(loc = globalThis.location) {
  if (!loc || /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(loc.hostname) || loc.protocol === 'file:') return PUBLIC_URL;
  return loc.origin;
}

export const waLink = (text) => 'https://wa.me/?text=' + encodeURIComponent(text);

function ranking(jornadas) {
  const t = totals(jornadas);
  const order = NAMES.slice().sort((a, b) => t[b].cents - t[a].cents || NAMES.indexOf(a) - NAMES.indexOf(b));
  const pot = NAMES.reduce((s, n) => s + t[n].cents, 0);
  const max = t[order[0]].cents;
  const leaders = max > 0 ? order.filter((n) => t[n].cents === max) : [];
  return { t, order, pot, max, leaders };
}

const joinNames = (list) => (list.length > 1 ? list.slice(0, -1).join(', ') + ' y ' + list[list.length - 1] : list[0]);

// Formato pensado para leerse bien en WhatsApp: títulos en *negrita*, bloques separados por líneas en blanco
// y una línea por jugador. Solo se usan caracteres seguros (letras, números, acentos, º, € y asteriscos):
// sin emojis ni rayas largas, porque en algunos móviles salían como "�".

/** Mensaje de una jornada concreta. */
export function jornadaMessage(j, jornadas, url = PUBLIC_URL) {
  const r = ranking(jornadas);
  const lines = [`*Fantasy LaLiga - Jornada ${j.n}*`, '', '*Multas de la jornada*'];
  for (const [slot, label] of SLOTS) lines.push(`${label}  ${j[slot]}: ${fmt(fineFor(j, slot))}`);
  const tie = TIES[j.tie];
  if (tie) lines.push('', `Empate ${j.tie.split('').join('º-')}º: ${joinNames(tie.map((slot) => j[slot]))} pagan ${fmt(fineFor(j, tie[0]))} cada uno`);
  lines.push('', `*Bote total:* ${fmt(r.pot)}`);
  if (r.leaders.length) lines.push(`*${r.leaders.length > 1 ? 'Líderes' : 'Líder'} de multas:* ${joinNames(r.leaders)} (${fmt(r.max)})`);
  lines.push('', url);
  return lines.join('\n');
}

/** Mensaje con la clasificación de multas completa. */
export function rankingMessage(jornadas, url = PUBLIC_URL) {
  const r = ranking(jornadas);
  const last = jornadas.length ? Math.max(...jornadas.map((j) => j.n)) : 0;
  const lines = ['*Fantasy LaLiga*', last ? `Clasificación de multas tras la jornada ${last} de ${TOTAL}` : 'Clasificación de multas', ''];
  r.order.forEach((name, i) => lines.push(`${i + 1}. ${name}: ${fmt(r.t[name].cents)}`));
  lines.push('', `*Bote total:* ${fmt(r.pot)}`, '', url);
  return lines.join('\n');
}
