// Worker con cron: una copia semanal de las jornadas en KV, los miércoles (backup:weekly:AAAA-MM-DD, fecha de Madrid).
// Cada copia caduca sola a los 70 días, así que siempre hay unas 10 sin tener que borrar nada a mano.
// No tiene web: no responde a nada (workers_dev = false en wrangler.toml).
import { KEY, snapshot } from '../../server/core.js';

export default {
  async scheduled(event, env) {
    const list = await env.JORNADAS.get(KEY, 'json');
    if (!Array.isArray(list)) return; // todavía no hay datos
    const key = await snapshot(env.JORNADAS, list, 'weekly', event.scheduledTime);
    console.log(`Copia semanal ${key}: ${list.length} jornadas`);
  },
  async fetch() {
    return new Response('No encontrado', { status: 404 });
  },
};
