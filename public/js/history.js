// Textos del historial de cambios (los usa app.js y se prueban en scripts/verify-history.mjs).
import { SLOTS } from './league.js';

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const tieText = (t) => (t ? t.split('').join('º-') + 'º' : 'sin empate');
const dateText = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : 'sin fecha');

const VERB = { guardar: 'guardó', editar: 'editó', borrar: 'borró', restaurar: 'restauró una copia' };

/** Título de una entrada: "Jugador6 editó la J12". Lo que carga el servidor (importaciones, copias) no lleva persona. */
export function entryTitle(e) {
  const fromServer = e.auth === 'script';
  const who = !fromServer && e.who ? e.who : 'Alguien';
  if (e.action === 'restaurar') return fromServer ? 'Copia de seguridad restaurada' : `${who} restauró una copia de seguridad`;
  if (fromServer && e.action === 'guardar') return `J${e.n} importada`;
  if (e.action === 'editar' && e.auth === 'propia') return `${who} corrigió la J${e.n}`;
  return `${who} ${VERB[e.action] || e.action} la J${e.n}`;
}

/** Detalle: qué cambió. */
export function entryDetail(e) {
  if (e.action === 'restaurar') {
    const a = e.after || {};
    return `${a.count ?? '?'} jornadas · ${eur.format((a.cents || 0) / 100)}`;
  }
  const b = e.before;
  const a = e.after;
  if (e.action === 'editar' && b && a) {
    const parts = [];
    for (const [s, label] of SLOTS) if (b[s] !== a[s]) parts.push(`${label}: ${b[s]} → ${a[s]}`);
    if ((b.tie || '') !== (a.tie || '')) parts.push(`empate: ${tieText(b.tie)} → ${tieText(a.tie)}`);
    if ((b.date || '') !== (a.date || '')) parts.push(`fecha: ${dateText(b.date)} → ${dateText(a.date)}`);
    return parts.join(' · ');
  }
  const j = a || b;
  return j ? SLOTS.map(([s, label]) => `${label} ${j[s]}`).join(' · ') + (j.tie ? ` · empate ${tieText(j.tie)}` : '') : '';
}

/** Etiqueta de cómo se autorizó. */
export function entryAuth(e) {
  return { propia: 'Corrección propia', pin: 'Con PIN', script: 'Desde el servidor' }[e.auth] || '';
}

const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto', style: 'short' });
/** "hace 2 h", "ayer", "hace 3 días" */
export function ago(ms, now = Date.now()) {
  const s = Math.round((ms - now) / 1000);
  const abs = Math.abs(s);
  if (abs < 45) return 'ahora mismo';
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(s / 86400), 'day');
  return new Date(ms).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}
