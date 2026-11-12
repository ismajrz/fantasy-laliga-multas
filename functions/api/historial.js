// Historial de cambios: GET /api/historial -> { entries: [...] } (el más reciente primero, máx. 300).
// Lo puede ver todo el mundo; solo se escribe desde /api/jornadas y desde scripts/restore.mjs.
import { json, readAudit } from '../../server/core.js';

export async function onRequest({ request, env }) {
  if (!env.JORNADAS) return json({ error: 'Falta el binding de KV JORNADAS' }, 500);
  if (request.method !== 'GET') return json({ error: 'Método no permitido' }, 405);
  try {
    return json({ entries: await readAudit(env.JORNADAS) });
  } catch (e) {
    console.error(e);
    return json({ error: 'Error del servidor' }, 500);
  }
}
