// Punto de entrada para el modo "advanced" de Pages (_worker.js): las rutas de la API van a las
// mismas funciones que usan las Pages Functions y el resto son los archivos estáticos.
import { onRequest as jornadas } from '../functions/api/jornadas.js';
import { onRequest as historial } from '../functions/api/historial.js';

export const API = { '/api/jornadas': jornadas, '/api/historial': historial };

export default {
  async fetch(request, env, ctx) {
    const fn = API[new URL(request.url).pathname];
    return fn ? fn({ request, env, ctx }) : env.ASSETS.fetch(request);
  },
};
