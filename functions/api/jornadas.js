// API de jornadas (Cloudflare Pages Functions): /api/jornadas
//   GET                         -> { jornadas: [...] }                        (igual que siempre)
//   POST {n,p7,p8,p9,tie?,date?,who?}
//        jornada nueva          -> { ok, action: 'guardar', undo: { n, token, expiresAt } }
//        jornada ya guardada    -> hace falta x-undo-token (15 min, mismo dispositivo) o x-admin-pin
//   DELETE ?n=12&who=Jugador6      -> igual: x-undo-token o x-admin-pin
// Cada cambio queda en el historial (clave "audit") y, antes de editar o borrar, se guarda una copia
// automática (backup:auto:...). El primer cambio de cada semana deja también backup:weekly:AAAA-MM-DD.
// Los clientes antiguos siguen funcionando: GET no cambia y POST de una jornada nueva no pide nada más.

import { TOTAL, cleanJornada } from '../../public/js/league.js';
import backup from '../../data/jornadas-backup.json';
import {
  json, readList, writeList, snapshot, weeklyIfMissing, addAudit, brief, sameJornada, cleanWho,
  checkPin, grantGrace, checkGrace,
} from '../../server/core.js';

const seed = () => backup.jornadas || [];

/** Permiso para cambiar una jornada ya guardada: corrección propia (token) o PIN. */
async function authorize(request, env, kv, n) {
  if (await checkGrace(request, kv, n)) return { auth: 'propia' };
  const fail = await checkPin(request, env, kv);
  return fail ? { fail } : { auth: 'pin' };
}

export async function onRequest({ request, env }) {
  const kv = env.JORNADAS;
  if (!kv) return json({ error: 'Falta el binding de KV JORNADAS' }, 500);
  try {
    if (request.method === 'GET') return json({ jornadas: await readList(kv, seed()) });

    if (request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return json({ error: 'JSON no válido' }, 400); }
      const rec = cleanJornada(body);
      if (!rec) return json({ error: 'Datos no válidos' }, 400);
      const who = cleanWho(body.who);
      const list = await readList(kv, seed());
      const prev = list.find((j) => j.n === rec.n) || null;

      if (prev && sameJornada(prev, rec)) return json({ ok: true, action: 'igual' });

      let auth = 'nueva';
      if (prev) {
        const a = await authorize(request, env, kv, rec.n);
        if (a.fail) return a.fail;
        auth = a.auth;
        await snapshot(kv, list);
      }
      await weeklyIfMissing(kv, list);
      await writeList(kv, list.filter((j) => j.n !== rec.n).concat([rec]));
      await addAudit(kv, { who, action: prev ? 'editar' : 'guardar', auth, n: rec.n, before: brief(prev), after: brief(rec) });
      // Jornada nueva o editada con PIN: 15 min para corregirla sin PIN. Una corrección propia no alarga el plazo.
      const undo = auth === 'propia' ? null : await grantGrace(kv, rec);
      return json({ ok: true, action: prev ? 'editar' : 'guardar', auth, ...(undo ? { undo } : {}) });
    }

    if (request.method === 'DELETE') {
      const url = new URL(request.url);
      const n = Number(url.searchParams.get('n'));
      if (!Number.isInteger(n) || n < 1 || n > TOTAL) return json({ error: 'Jornada no válida' }, 400);
      const list = await readList(kv, seed());
      const prev = list.find((j) => j.n === n);
      if (!prev) return json({ ok: true, action: 'igual' });
      const a = await authorize(request, env, kv, n);
      if (a.fail) return a.fail;
      await snapshot(kv, list);
      await weeklyIfMissing(kv, list);
      await writeList(kv, list.filter((j) => j.n !== n));
      await kv.delete(`grace:${n}`);
      await addAudit(kv, { who: cleanWho(url.searchParams.get('who')), action: 'borrar', auth: a.auth, n, before: brief(prev), after: null });
      return json({ ok: true, action: 'borrar', auth: a.auth });
    }

    return json({ error: 'Método no permitido' }, 405);
  } catch (e) {
    console.error(e);
    return json({ error: 'Error del servidor' }, 500);
  }
}
