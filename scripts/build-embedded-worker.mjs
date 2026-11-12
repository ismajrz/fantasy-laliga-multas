// Genera un _worker.js autónomo (todas las páginas, estilos, fuentes e imágenes van dentro del propio
// Worker) para publicar en Cloudflare Pages solo con la API, sin `wrangler login`.
// Uso: node scripts/build-embedded-worker.mjs [salida]  (por defecto ../deploy/_worker.js)
// Con `wrangler pages deploy public` no hace falta: Pages sirve /public y la función normalmente.
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, extname, relative, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

const root = new URL('..', import.meta.url).pathname;
const out = process.argv[2] || join(root, '../deploy/_worker.js');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json' };
const SKIP = new Set(['_headers', '_redirects', '_routes.json', '_worker.js']);

async function walk(dir) {
  const files = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) files.push(...await walk(p));
    else if (!SKIP.has(e.name)) files.push(p);
  }
  return files;
}

const pub = join(root, 'public');
const assets = {};
for (const f of await walk(pub)) {
  const buf = await readFile(f);
  const path = '/' + relative(pub, f).split('\\').join('/');
  const ext = extname(f);
  assets[path] = { t: TYPES[ext] || 'application/octet-stream', e: '"' + createHash('sha1').update(buf).digest('hex').slice(0, 16) + '"', b: buf.toString('base64') };
}
const tmp = join(root, '.wrangler/embedded-assets.mjs');
await mkdir(dirname(tmp), { recursive: true });
await writeFile(tmp, 'export default ' + JSON.stringify(assets) + ';\n');

const entry = join(root, '.wrangler/embedded-entry.mjs');
await writeFile(entry, `
import { API } from ${JSON.stringify(join(root, 'scripts/worker-entry.js'))};
import ASSETS from ${JSON.stringify(tmp)};
const SEC = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin', 'permissions-policy': 'camera=(), microphone=(), geolocation=()' };
const cache = (p) => p === '/' || p.endsWith('.html') || p === '/sw.js' || p.endsWith('.webmanifest') ? 'public, max-age=0, must-revalidate'
  : p.startsWith('/img/') || p.startsWith('/fonts/') ? 'public, max-age=86400' : 'public, max-age=300, must-revalidate';
const bin = {};
function bytes(p) { return bin[p] ||= Uint8Array.from(atob(ASSETS[p].b), (c) => c.charCodeAt(0)); }
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    let p = decodeURIComponent(url.pathname);
    if (API[p]) return API[p]({ request, env, ctx });
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Método no permitido', { status: 405, headers: SEC });
    if (p.endsWith('/')) p += 'index.html';
    if (!ASSETS[p] && ASSETS[p + '.html']) p += '.html';
    const a = ASSETS[p];
    if (!a) return new Response('No encontrado', { status: 404, headers: { ...SEC, 'content-type': 'text/plain; charset=utf-8' } });
    const headers = { ...SEC, 'content-type': a.t, etag: a.e, 'cache-control': cache(p) };
    if (request.headers.get('if-none-match') === a.e) return new Response(null, { status: 304, headers });
    return new Response(request.method === 'HEAD' ? null : bytes(p), { headers });
  },
};
`);
await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', outfile: out, loader: { '.json': 'json' }, logLevel: 'warning' });
console.log(`${Object.keys(assets).length} archivos incrustados → ${out}`);
