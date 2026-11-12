// Fantasy LaLiga · Multas — lógica de la página.
// Datos: /api/jornadas (Cloudflare Pages Function + KV). Si el servidor no responde al cargar,
// se usa el almacenamiento del navegador (localStorage) como respaldo.

import { NAMES, TOTAL, SLOTS, TIES, fineFor, jornadaCents, isValidJornada, totals } from './league.js';
import { jornadaMessage, rankingMessage, siteUrl, waLink, GROUP_URL } from './share.js';
import { records, worstStretch, worstMonth, potSeries, joinNames } from './stats.js';
import { entryTitle, entryDetail, entryAuth, ago, baseEntries } from './history.js';

// Equipos de LaLiga 2026/27 (escudos en img/escudos/, ver img/escudos/FUENTES.md)
const TEAMS = [
  ['real-madrid', 'Real Madrid'], ['barcelona', 'FC Barcelona'], ['atletico', 'Atlético de Madrid'], ['athletic', 'Athletic Club'],
  ['real-sociedad', 'Real Sociedad'], ['villarreal', 'Villarreal'], ['betis', 'Real Betis'], ['sevilla', 'Sevilla'],
  ['valencia', 'Valencia'], ['osasuna', 'Osasuna'], ['celta', 'Celta de Vigo'], ['getafe', 'Getafe'], ['rayo', 'Rayo Vallecano'],
  ['espanyol', 'Espanyol'], ['elche', 'Elche'], ['alaves', 'Deportivo Alavés'], ['levante', 'Levante'],
  ['racing', 'Racing de Santander'], ['deportivo', 'Deportivo de La Coruña'], ['malaga', 'Málaga'],
];
const API = '/api/jornadas';
const REFRESH_MS = 15000;
const HIST_API = '/api/historial';
const LS_KEY = 'fantasy-hub-jornadas-v1';      // jornadas en modo sin conexión (como antes)
const CACHE_KEY = 'fantasy-hub-cache-v1';      // última copia que llegó del servidor (solo lectura sin conexión)
const ME_KEY = 'fantasy-me-v1';                // quién eres (se recuerda en este móvil)
const UNDO_KEY = 'fantasy-undo-v1';            // permisos de corrección sin PIN { n: { token, expiresAt } }
const PIN_KEY = 'fantasy-admin-pin';           // PIN, solo durante la sesión (sessionStorage)
const AUDIT_PAGE = 30;          // historial: de 30 en 30
const LIST_SHORT = 6;           // jornadas guardadas que se ven en Inicio sin pulsar «Ver todas»
const ls = {
  get(k, fb) { try { const v = localStorage.getItem(k); return v == null ? fb : JSON.parse(v); } catch { return fb; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
};
const ss = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch { /* nada */ } },
};

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const fmt = (cents) => eur.format(cents / 100);
const $ = (id) => document.getElementById(id);
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Crea un elemento: h('div', { class: 'x', text: 'hola', onclick: fn }, ...hijos) */
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style') for (const [prop, val] of Object.entries(v)) el.style.setProperty(prop, String(val));
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) el.append(c);
  return el;
}

const ICONS = {
  wa: 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
  trash: 'M5 7h14M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3',
  x: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 018 0v3',
};
function icon(name) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  if (name === 'wa') svg.setAttribute('class', 'ico-fill');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', ICONS[name]);
  svg.append(path);
  return svg;
}

/* ---------- Estado ---------- */
const state = {
  jornadas: [],
  store: null,          // { saveJornada(rec), removeJornada(n) }
  mode: 'loading',      // loading | remote | local | memory
  ready: false,
  filter: null,         // nombre por el que se filtra el historial
  pendingDel: null,     // jornada pendiente de confirmar borrado
  pendingTimer: 0,
  defaultSet: false,
  flash: null,          // jornada recién guardada (para resaltarla)
  firstPaint: true,
  shownTotal: 0,
  audit: [],
  auditShown: AUDIT_PAGE,
  listAll: false,
  view: 'inicio',
  me: null,
  cachedAt: 0,
};
state.me = NAMES.includes(ls.get(ME_KEY, null)) ? ls.get(ME_KEY, null) : null;

const findJ = (n) => state.jornadas.find((j) => j.n === n) || null;
function nextMissing() {
  for (let n = 1; n <= TOTAL; n++) if (!findJ(n)) return n;
  return TOTAL;
}
const tieLabel = (tie) => tie.split('').join('º-') + 'º';

/* ---------- Render ---------- */
function render() {
  const t = totals(state.jornadas);
  const sum = NAMES.reduce((s, n) => s + t[n].cents, 0);
  animateTotal(sum);
  renderMeta();
  renderSync();

  const disabled = !state.store;
  for (const id of ['jn', 'p7', 'p8', 'p9', 'jprev', 'jnext', 'jdate']) $(id).disabled = disabled;
  $('ties').disabled = disabled;
  if (!$('save').classList.contains('busy')) $('save').disabled = disabled;

  renderRank(t);
  renderStats();
  renderJnOptions();
  renderWho();
  renderHist();
  renderAudit();
  renderInstall();
  state.firstPaint = !state.ready;
}

function animateTotal(cents) {
  const el = $('total');
  const from = state.shownTotal;
  state.shownTotal = cents;
  if (from === cents || reducedMotion() || !state.ready) { el.textContent = fmt(cents); return; }
  const start = performance.now();
  const dur = 700;
  const step = (now) => {
    const p = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(Math.round(from + (cents - from) * eased));
    if (p < 1 && state.shownTotal === cents) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function renderMeta() {
  const meta = $('meta');
  meta.textContent = '';
  const count = state.jornadas.length;
  if (!state.ready) meta.append('Cargando jornadas…');
  else if (count) {
    const last = Math.max(...state.jornadas.map((j) => j.n));
    meta.append(h('b', { text: String(count) }), ` de ${TOTAL} jornadas · última `, h('b', { text: 'J' + last }));
  } else meta.append('Todavía no hay jornadas guardadas');

  const pct = Math.round((count / TOTAL) * 100);
  $('seasonpct').textContent = `${pct}%`;
  $('seasonfill').style.width = `${pct}%`;
  $('season').setAttribute('aria-valuenow', String(pct));
  $('season').setAttribute('aria-valuetext', `${count} de ${TOTAL} jornadas guardadas (${pct}%)`);
}

function renderSync() {
  const offline = state.mode === 'local' || state.mode === 'memory' || state.mode === 'cache';
  const sync = $('sync');
  sync.dataset.state = state.mode;
  sync.hidden = offline;
  $('synctext').textContent = state.mode === 'remote' ? 'Sincronizado' : 'Conectando…';
  const banner = $('offline');
  banner.hidden = !offline;
  if (offline) {
    $('offlinetext').textContent = {
      local: 'los cambios solo se guardan en este navegador.',
      memory: 'los cambios no se guardarán.',
      cache: `ves los datos de la última vez (${new Date(state.cachedAt).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}). Para apuntar o cambiar jornadas hace falta conexión.`,
    }[state.mode];
  }
}

const times = (n) => (n === 1 ? '1 vez' : `${n} veces`);

function renderRank(t) {
  const box = $('rank');
  box.textContent = '';
  const order = NAMES.slice().sort((a, b) => t[b].cents - t[a].cents || NAMES.indexOf(a) - NAMES.indexOf(b));
  const pot = NAMES.reduce((sum, n) => sum + t[n].cents, 0);
  $('rankhint').textContent = state.jornadas.length ? 'Toca un nombre para ver sus jornadas' : '';
  const shareRank = $('sharerank');
  shareRank.hidden = !state.jornadas.length;
  if (state.jornadas.length) shareRank.href = waLink(rankingMessage(state.jornadas, siteUrl()));

  order.forEach((name, i) => {
    const r = t[name];
    const cards = [];
    for (const [slot, label] of SLOTS) {
      if (r[slot]) cards.push(h('span', { class: 'mini ' + slot }, h('b', { text: label }), ` ${times(r[slot])}`));
    }
    if (r.emp) cards.push(h('span', { class: 'mini tie' }, h('b', { text: 'Empate' }), ` ${times(r.emp)}`));
    if (!cards.length) cards.push(h('span', { class: 'none', text: 'Sin multas' }));
    const share = pot ? Math.round((r.cents / pot) * 100) : 0;
    const pressed = state.filter === name;
    const detail = [r.p7 && `${r.p7} veces 7º`, r.p8 && `${r.p8} veces 8º`, r.p9 && `${r.p9} veces 9º`, r.emp && `${r.emp} en empate`].filter(Boolean).join(', ');

    const btn = h('button', {
      class: 'rank-btn', type: 'button', 'aria-pressed': String(pressed),
      'aria-label': `${i + 1}º ${name}: ${fmt(r.cents)}${detail ? ', ' + detail : ''}. ${pressed ? 'Quitar filtro' : 'Ver sus jornadas'}`,
      onclick: () => setFilter(pressed ? null : name),
    },
      h('span', { class: 'rank-pos num', text: String(i + 1) }),
      h('span', { class: 'rank-name' }, h('span', { text: name }), i === 0 && r.cents > 0 ? h('span', { class: 'tag', text: 'Líder de multas' }) : null),
      h('span', { class: 'rank-amt num' }, h('span', { text: fmt(r.cents) }), r.cents ? h('small', { class: 'share', text: `${share}% del bote` }) : null),
      h('span', { class: 'det num' }, cards));
    box.append(h('li', { class: [state.firstPaint && state.ready ? 'reveal' : '', i === 0 && r.cents > 0 ? 'lead' : ''].join(' ').trim(), style: { '--i': i } }, btn));
  });
}

function setFilter(name) {
  state.filter = name;
  renderRank(totals(state.jornadas));
  renderHist();
  if (name && window.innerWidth < 900) {
    $('listtitle').scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }
}

function renderJnOptions() {
  const sel = $('jn');
  if (!sel.options.length) for (let n = 1; n <= TOTAL; n++) sel.append(h('option', { value: String(n) }));
  [...sel.options].forEach((o, i) => { o.textContent = `Jornada ${i + 1}${findJ(i + 1) ? ' · guardada' : ''}`; });
  if (state.ready && !state.defaultSet) {
    state.defaultSet = true;
    sel.value = String(nextMissing());
    prefill();
  }
  updateHint();
}

function currentN() { return parseInt($('jn').value, 10); }

function prefill() {
  const j = findJ(currentN());
  for (const [slot] of SLOTS) $(slot).value = j ? j[slot] : '';
  setTie(j && j.tie ? j.tie : '');
  $('jdate').value = j ? (j.date || '') : today();
  markFilled();
  updateHint();
}

/** Resalta los puestos que ya tienen nombre elegido. */
function markFilled() {
  for (const [slot] of SLOTS) $(slot).closest('.slot')?.classList.toggle('filled', !!$(slot).value);
}

function getTie() { return document.querySelector('input[name="tie"]:checked')?.value || ''; }
function setTie(v) { for (const r of document.querySelectorAll('input[name="tie"]')) r.checked = r.value === v; }

function updateHint() {
  const n = currentN();
  const saved = !!findJ(n);
  const hint = $('jhint');
  const left = saved ? graceLeft(n) : 0;
  const needsPin = saved && state.mode === 'remote' && !left;
  hint.hidden = !saved || !!left;
  hint.textContent = saved
    ? `Esta jornada ya está guardada. ${needsPin ? 'Para cambiarla o borrarla hace falta el PIN.' : 'Al guardar se sustituyen los nombres.'}`
    : '';
  const gh = $('gracehint');
  gh.hidden = !left;
  gh.textContent = left ? `La apuntaste tú desde este móvil: puedes corregirla o borrarla sin PIN durante ${minutes(left)}.` : '';
  $('savelabel').textContent = saved ? `Actualizar jornada ${n}` : `Guardar jornada ${n || ''}`.trim();
  if (state.store) {
    $('jprev').disabled = !(n > 1);
    $('jnext').disabled = !(n < TOTAL);
  }
}

function renderHist() {
  const list = $('list');
  list.textContent = '';
  const chip = $('filterchip');
  chip.hidden = !state.filter;
  if (state.filter) {
    chip.textContent = '';
    chip.append(state.filter, icon('x'));
    chip.setAttribute('aria-label', 'Quitar filtro de ' + state.filter);
  }
  $('listtitle').textContent = state.filter ? `Jornadas de ${state.filter}` : 'Jornadas guardadas';

  if (!state.ready) {
    for (let i = 0; i < 3; i++) list.append(h('li', { class: 'skeleton', 'aria-hidden': 'true' }));
    return;
  }
  if (!state.jornadas.length) {
    list.append(h('li', { class: 'empty' },
      h('strong', { text: 'Todavía no hay jornadas' }),
      h('span', { text: 'Elige la jornada y quién quedó 7º, 8º y 9º, y pulsa Guardar jornada.' })));
    return;
  }
  const f = state.filter;
  const rows = state.jornadas.filter((j) => !f || j.p7 === f || j.p8 === f || j.p9 === f).sort((a, b) => b.n - a.n);
  if (!rows.length) {
    list.append(h('li', { class: 'empty' }, h('span', { text: f + ' no ha pagado ninguna multa todavía.' })));
    return;
  }

  const total = rows.length;
  const shown = f || state.listAll ? rows : rows.slice(0, LIST_SHORT);
  shown.forEach((j, i) => {
    let amount = jornadaCents(j);
    if (f) amount = SLOTS.reduce((s, [slot]) => s + (j[slot] === f ? fineFor(j, slot) : 0), 0);
    const confirming = state.pendingDel === j.n;
    const lines = SLOTS.map(([slot, label]) => h('span', { class: `pill ${slot}${f === j[slot] ? ' me' : ''}` },
      h('span', { class: 'pos', text: label }),
      h('span', { text: j[slot] })));
    const tie = TIES[j.tie]
      ? h('span', { class: 'pill tie' }, h('span', { class: 'pos', text: 'Empate' }),
        h('span', { text: `${tieLabel(j.tie)} · ${fmt(fineFor(j, TIES[j.tie][0]))} cada uno` }))
      : null;
    const edit = h('button', { class: 'tool', type: 'button', 'aria-label': `Editar jornada ${j.n}`, title: 'Editar', onclick: () => onEdit(j.n) }, icon('edit'));
    const share = h('a', {
      class: 'tool wa-tool', href: waLink(jornadaMessage(j, state.jornadas, siteUrl())), target: '_blank', rel: 'noopener',
      'aria-label': `Compartir jornada ${j.n} por WhatsApp`, title: 'Compartir por WhatsApp',
    }, icon('wa'));
    const del = h('button', {
      class: 'tool' + (confirming ? ' confirm' : ''), type: 'button', title: 'Borrar',
      'aria-label': confirming ? `Confirmar borrado de la jornada ${j.n}` : `Borrar jornada ${j.n}`,
      onclick: () => onDelete(j.n),
    }, confirming ? 'Borrar' : icon('trash'));
    edit.disabled = del.disabled = !state.store;

    const left = graceLeft(j.n);
    const grace = left ? h('span', { class: 'pill grace', title: 'Puedes corregirla sin PIN' }, icon('undo'), h('span', { text: `Sin PIN · ${minutes(left)}` })) : null;
    const date = j.date ? h('span', { class: 'pill date', text: shortDate(j.date) }) : null;
    list.append(h('li', {
      class: ['jrow', state.flash === j.n ? 'flash' : '', state.firstPaint ? 'reveal' : ''].join(' ').trim(),
      style: { '--i': Math.min(i, 10) },
    },
      h('div', { class: 'jnum num' }, h('b', { text: 'J' + j.n }), h('small', { text: fmt(amount) })),
      h('div', { class: 'jbody' }, lines, tie, date, grace),
      h('div', { class: 'jtools' }, share, edit, del)));
  });
  state.flash = null;
  const more = $('listmore');
  more.hidden = !!f || total <= LIST_SHORT;
  more.textContent = state.listAll ? 'Ver menos' : `Ver todas (${total})`;
}


function say(text, kind = '') {
  const m = $('msg');
  m.textContent = text;
  m.className = 'msg' + (kind ? ' ' + kind : '');
  $('wabtn').hidden = true;
}

/* ---------- Utilidades de fecha y permisos ---------- */
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const shortDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
const minutes = (ms) => { const m = Math.max(1, Math.ceil(ms / 60000)); return `${m} min`; };

/** Permisos de corrección sin PIN guardados en este móvil (los caducados se tiran). */
function undoMap() {
  const now = Date.now();
  const m = ls.get(UNDO_KEY, {});
  const out = {};
  for (const [n, v] of Object.entries(m && typeof m === 'object' ? m : {})) if (v && v.token && v.expiresAt > now) out[n] = v;
  return out;
}
function graceLeft(n) {
  if (state.mode !== 'remote') return 0;
  const u = undoMap()[n];
  return u ? u.expiresAt - Date.now() : 0;
}
function keepUndo(undo) {
  if (!undo || !undo.token) return;
  const m = undoMap();
  m[undo.n] = { token: undo.token, expiresAt: undo.expiresAt };
  ls.set(UNDO_KEY, m);
}
function dropUndo(n) { const m = undoMap(); delete m[n]; ls.set(UNDO_KEY, m); }

/* ---------- Estadísticas ---------- */
const SLOT_LABEL = Object.fromEntries(SLOTS);
function tile(kicker, value, unit, sub, cls = '') {
  return h('div', { class: 'tile card ' + cls },
    h('p', { class: 'kicker', text: kicker }),
    h('p', { class: 'tile-value num' }, h('b', { text: value }), unit ? h('span', { text: unit }) : null),
    h('p', { class: 'tile-sub', text: sub }));
}
const range = (from, to) => (from === to ? `J${from}` : `J${from}–J${to}`);
/** "Jugador6 · J3–J6", o solo los nombres si son varios (cada uno con su tramo). */
const who = (rec) => (rec.names.length > 1 ? joinNames(rec.names) : `${rec.names[0]} · ${range(rec.from, rec.to)}`);
const jornadasWord = (n) => (n === 1 ? 'jornada' : 'jornadas');

function renderStats() {
  const box = $('stats');
  box.textContent = '';
  if (!state.ready) { box.append(h('div', { class: 'card skeleton-card', 'aria-hidden': 'true' })); return; }
  if (state.jornadas.length < 2) {
    box.append(h('div', { class: 'card empty' }, h('strong', { text: 'Aún no hay estadísticas' }), h('span', { text: 'Aparecen en cuanto haya dos jornadas guardadas.' })));
    return;
  }
  const r = records(state.jornadas);
  const tiles = [];
  if (r.slot) tiles.push(tile(`Racha de ${SLOT_LABEL[r.slot.slot]}`, String(r.slot.len), `${jornadasWord(r.slot.len)} seguidas`,
    who(r.slot), r.slot.slot));
  if (r.fined) tiles.push(tile('Más seguidas pagando', String(r.fined.len), jornadasWord(r.fined.len),
    who(r.fined), 'bad'));
  if (r.clean) tiles.push(tile('Más seguidas sin multa', String(r.clean.len), jornadasWord(r.clean.len),
    who(r.clean), 'good'));
  const month = worstMonth(state.jornadas);
  if (month && month.dated >= 4) {
    const label = new Date(month.month + '-15T12:00:00').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    tiles.push(tile('Peor mes', fmt(month.cents), '', `${joinNames(month.names)} · ${label}`, 'bad'));
  } else {
    const w = worstStretch(state.jornadas, 4);
    if (w) tiles.push(tile('Peor tramo de 4 jornadas', fmt(w.cents), '', who(w), 'bad'));
  }
  box.append(h('div', { class: 'tiles' }, tiles));

  if (r.now.length) {
    box.append(h('div', { class: 'card nowcard' },
      h('p', { class: 'kicker', text: 'Rachas abiertas' }),
      h('div', { class: 'nowchips' }, r.now.map((x) => h('span', { class: 'mini streak ' + x.kind },
        h('i', { 'aria-hidden': 'true' }), h('b', { text: x.name }),
        ` ${x.len} ${x.kind === 'fined' ? 'seguidas pagando' : 'sin pagar'}`)))));
  }
  box.append(potChart());
  const hint = !month || month.dated < 4 ? 'Rachas y récords. El peor mes saldrá cuando haya jornadas con fecha.' : 'Rachas y récords de la temporada';
  $('statshint').textContent = hint;
}

/** Gráfica del bote (SVG en línea): área del bote acumulado y las líneas de los 3 que más pagan. */
function potChart() {
  const series = potSeries(state.jornadas);
  const t = totals(state.jornadas);
  const top3 = NAMES.slice().sort((a, b) => t[b].cents - t[a].cents).slice(0, 3).filter((n) => t[n].cents);
  const W = 320, H = 150, L = 8, R = 52, T = 14, B = 22;
  const max = series.at(-1).cents || 1;
  const x = (i) => L + (series.length === 1 ? 0 : (i / (series.length - 1)) * (W - L - R));
  const y = (c) => T + (1 - c / max) * (H - T - B);
  const ns = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}) => { const e = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img',
    'aria-label': `Bote tras cada jornada: ${series.map((p) => `J${p.n} ${fmt(p.cents)}`).join(', ')}` });
  const defs = el('defs');
  const g = el('linearGradient', { id: 'potfill', x1: 0, y1: 0, x2: 0, y2: 1 });
  g.append(el('stop', { offset: '0', 'stop-color': '#e8272e', 'stop-opacity': '.35' }), el('stop', { offset: '1', 'stop-color': '#e8272e', 'stop-opacity': '0' }));
  defs.append(g);
  svg.append(defs);
  for (const f of [0, .5, 1]) svg.append(el('line', { x1: L, x2: W - R, y1: y(max * f), y2: y(max * f), class: 'grid' }));
  const pts = series.map((p, i) => `${x(i).toFixed(1)},${y(p.cents).toFixed(1)}`);
  svg.append(el('path', { d: `M${x(0)},${y(0)} L${pts.join(' L')} L${x(series.length - 1)},${y(0)} Z`, fill: 'url(#potfill)', stroke: 'none' }));
  // Líneas de los que más pagan
  const colors = ['var(--c9)', 'var(--c8)', 'var(--c7)'];
  top3.forEach((name, k) => {
    let acc = 0;
    const p = state.jornadas.slice().sort((a, b) => a.n - b.n).map((j, i) => {
      acc += SLOTS.reduce((s2, [s]) => s2 + (j[s] === name ? fineFor(j, s) : 0), 0);
      return `${x(i).toFixed(1)},${y(acc).toFixed(1)}`;
    });
    svg.append(el('polyline', { points: p.join(' '), class: 'pline', style: `stroke:${colors[k]}` }));
  });
  svg.append(el('polyline', { points: pts.join(' '), class: 'potline' }));
  const lx = x(series.length - 1), ly = y(max);
  svg.append(el('circle', { cx: lx, cy: ly, r: 4, class: 'potdot' }));
  const label = el('text', { x: lx + 8, y: ly + 4, class: 'clabel strong' });
  label.textContent = fmt(max).replace(/\s/g, '\u00a0');
  svg.append(label);
  const lab = (i, anchor) => { const tx = el('text', { x: x(i), y: H - 6, class: 'clabel', 'text-anchor': anchor }); tx.textContent = 'J' + series[i].n; svg.append(tx); };
  lab(0, 'start');
  if (series.length > 2) lab(Math.floor((series.length - 1) / 2), 'middle');
  lab(series.length - 1, 'end');

  const legend = h('div', { class: 'legend' },
    h('span', { class: 'lg pot' }, h('i'), 'Bote'),
    top3.map((name, k) => h('span', { class: 'lg', style: { '--lc': colors[k] } }, h('i'), name)));
  const left = TOTAL - state.jornadas.length;
  return h('div', { class: 'card chartcard' },
    h('div', { class: 'chart-head' }, h('p', { class: 'kicker', text: 'Cómo crece el bote' }),
      h('p', { class: 'tile-sub num', text: left ? `Si sigue así, ${fmt(jornadaCents() * TOTAL)} al final` : 'Temporada terminada' })),
    svg, legend);
}

/* ---------- Historial de cambios ---------- */
const ACT_ICON = { guardar: 'plus', editar: 'edit', borrar: 'trash', restaurar: 'undo' };
function renderAudit() {
  const list = $('audit');
  list.textContent = '';
  const more = $('auditmore');
  if (!state.ready) { list.append(h('li', { class: 'skeleton', 'aria-hidden': 'true' })); more.hidden = true; return; }
  const all = baseEntries(state.jornadas, state.audit);
  if (!all.length) {
    list.append(h('li', { class: 'empty' }, h('strong', { text: 'Sin cambios todavía' }),
      h('span', { text: state.mode === 'remote' || state.mode === 'cache'
        ? 'A partir de ahora, cada vez que alguien guarde, corrija o borre una jornada saldrá aquí.'
        : 'Sin conexión no se registra el historial.' })));
    more.hidden = true;
    return;
  }
  const rows = all.slice(0, state.auditShown);
  for (const e of rows) {
    const title = entryTitle(e);
    const who = e.who || 'Alguien';
    const rest = title.slice(who.length);
    const auth = entryAuth(e);
    list.append(h('li', { class: 'arow ' + (e.action || '') },
      h('span', { class: 'aicon', 'aria-hidden': 'true' }, icon(ACT_ICON[e.action] || 'edit')),
      h('div', { class: 'abody' },
        h('p', { class: 'atitle' }, h('b', { text: who }), rest),
        h('p', { class: 'asub' }, h('time', { datetime: new Date(e.at).toISOString(), title: new Date(e.at).toLocaleString('es-ES'), text: ago(e.at) }),
          entryDetail(e) ? ` · ${entryDetail(e)}` : '')),
      auth ? h('span', { class: 'aauth by-' + (e.auth || ''), text: auth }) : null));
  }
  more.hidden = all.length <= state.auditShown;
  more.textContent = `Ver más (${all.length - rows.length})`;
  $('auditcount').textContent = all.length ? `${all.length} ${all.length === 1 ? 'cambio' : 'cambios'} registrados` : '';
}

/* ---------- Quién eres ---------- */
function renderWho() {
  const p = $('whoami');
  p.textContent = '';
  p.hidden = !state.store;
  if (!state.store) return;
  if (state.me) p.append('Apuntas como ', h('b', { text: state.me }), ' · ');
  else p.append('Te preguntaremos quién eres al guardar · ');
  p.append(h('button', { type: 'button', class: 'linkbtn', text: state.me ? 'Cambiar' : 'Elegir ahora', onclick: () => openWho() }));
}

let whoResolve = null;
function openWho() {
  const dlg = $('whodlg');
  const grid = $('whogrid');
  grid.textContent = '';
  for (const n of NAMES) {
    grid.append(h('button', { type: 'button', class: 'whobtn' + (n === state.me ? ' on' : ''), 'aria-pressed': String(n === state.me), text: n,
      onclick: () => { state.me = n; ls.set(ME_KEY, n); dlg.close('ok'); } }));
  }
  return new Promise((resolve) => {
    whoResolve = resolve;
    dlg.showModal();
    grid.querySelector('.on, button')?.focus();
  });
}
function ensureWho() { return state.me ? Promise.resolve(state.me) : openWho(); }

/* ---------- PIN ---------- */
class Cancelled extends Error {}
let pinCtx = null;

/** Pide el PIN y ejecuta fn(pin). Si el PIN no vale, el diálogo sigue abierto con el error. */
function askPin(fn, { title = 'PIN de administrador', text } = {}) {
  const dlg = $('pindlg');
  $('pintitle').textContent = title;
  $('pintext').textContent = text || 'Para cambiar o borrar una jornada ya guardada hace falta el PIN.';
  $('pinmsg').textContent = '';
  $('pin').value = '';
  return new Promise((resolve, reject) => {
    pinCtx = { fn, resolve, reject };
    dlg.showModal();
    $('pin').focus();
  });
}

async function onPinSubmit(ev) {
  ev.preventDefault();
  if (!pinCtx) return;
  const pin = $('pin').value.trim();
  if (!/^\d{4,8}$/.test(pin)) { $('pinmsg').textContent = 'Escribe el PIN (solo números).'; return; }
  const ok = $('pinok');
  ok.disabled = true;
  ok.classList.add('busy');
  try {
    const res = await pinCtx.fn(pin);
    ss.set(PIN_KEY, pin);
    const { resolve } = pinCtx;
    pinCtx = null;
    $('pindlg').close('ok');
    resolve(res);
  } catch (e) {
    if (e.status === 401 || e.status === 429) {
      $('pinmsg').textContent = e.data?.error || 'PIN incorrecto.';
      $('pin').value = '';
      $('pin').focus();
    } else {
      const { reject } = pinCtx;
      pinCtx = null;
      $('pindlg').close('error');
      reject(e);
    }
  } finally {
    ok.disabled = false;
    ok.classList.remove('busy');
  }
}

/**
 * Ejecuta una acción sobre una jornada ya guardada: primero con el permiso de corrección de este
 * móvil (15 min), luego con el PIN de la sesión y, si no vale, pidiendo el PIN.
 */
async function guarded(n, fn, pinText) {
  if (state.mode !== 'remote') return fn({});
  const u = undoMap()[n];
  if (u) {
    try { return await fn({ undo: u.token }); } catch (e) { if (e.status !== 401) throw e; dropUndo(n); }
  }
  const saved = ss.get(PIN_KEY);
  if (saved) {
    try { return await fn({ pin: saved }); } catch (e) { if (e.status !== 401) throw e; ss.set(PIN_KEY, null); }
  }
  return askPin((pin) => fn({ pin }), { text: pinText });
}

/* ---------- Acciones ---------- */
function onEdit(n) {
  go('inicio');
  $('jn').value = String(n);
  prefill();
  const left = graceLeft(n);
  say(`Editando la jornada ${n}.${left ? '' : state.mode === 'remote' ? ' Al guardar te pedirá el PIN.' : ''}`);
  $('formpanel').scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
  $('p7').focus({ preventScroll: true });
}

const sameRec = (a, b) => a.p7 === b.p7 && a.p8 === b.p8 && a.p9 === b.p9 && (a.tie || '') === (b.tie || '') && (a.date || '') === (b.date || '');
const failText = (e, what) => (e instanceof Cancelled ? '' : e.data?.error || `No se pudo ${what}. Inténtalo de nuevo.`);

async function onDelete(n) {
  if (!state.store) return;
  clearTimeout(state.pendingTimer);
  if (state.pendingDel !== n) {
    state.pendingDel = n;
    state.pendingTimer = setTimeout(() => { state.pendingDel = null; renderHist(); }, 4000);
    renderHist();
    document.querySelector(`[aria-label="Confirmar borrado de la jornada ${n}"]`)?.focus();
    return;
  }
  state.pendingDel = null;
  renderHist();
  try {
    const who = await ensureWho();
    if (!who) return;
    const res = await guarded(n, (auth) => state.store.removeJornada(n, { who, ...auth }), `Para borrar la jornada ${n} hace falta el PIN.`);
    dropUndo(n);
    say(`Jornada ${n} borrada${res?.auth === 'propia' ? ' (corrección propia, sin PIN)' : ''}.`, 'ok');
  } catch (e) {
    const t = failText(e, 'borrar la jornada');
    if (t) say(t, 'error');
  }
  prefill();
  render();
}

async function onSubmit(ev) {
  ev.preventDefault();
  if (!state.store) return;
  const n = currentN();
  const rec = { n, p7: $('p7').value, p8: $('p8').value, p9: $('p9').value };
  const tie = getTie();
  if (tie) rec.tie = tie;
  const date = $('jdate').value;
  if (date) rec.date = date;
  if (!rec.p7 || !rec.p8 || !rec.p9) { say('Elige quién quedó 7º, 8º y 9º.', 'error'); return; }
  if (rec.p7 === rec.p8 || rec.p7 === rec.p9 || rec.p8 === rec.p9) { say('Elige tres participantes distintos.', 'error'); return; }
  const prev = findJ(n);
  if (prev && sameRec(prev, rec)) { say(`La jornada ${n} ya está guardada así: no hay nada que cambiar.`); return; }

  const who = await ensureWho();
  if (!who) { say('Elige quién eres para guardar.', 'error'); return; }
  const btn = $('save');
  btn.disabled = true;
  btn.classList.add('busy');
  try {
    const save = (auth) => state.store.saveJornada(rec, { who, ...auth });
    const res = prev ? await guarded(n, save, `Para cambiar la jornada ${n} hace falta el PIN.`) : await save({});
    keepUndo(res?.undo);
    const how = res?.auth === 'propia' ? ' Corregida sin PIN.' : res?.auth === 'pin' ? ' Cambio hecho con PIN.' : '';
    say(`Jornada ${n} ${prev ? 'actualizada' : 'guardada'}. Total de la jornada: ${fmt(jornadaCents(rec))}${rec.tie ? ' (con empate)' : ''}.${how}`, 'ok');
    showWa(findJ(n) || rec);
    state.flash = n;
    $('jn').value = String(nextMissing());
    prefill();
  } catch (e) {
    const t = failText(e, 'guardar la jornada');
    if (t) say(t, 'error');
  } finally {
    btn.classList.remove('busy');
    render();
  }
}

/** Botón verde para avisar al grupo tras guardar una jornada. */
function showWa(j) {
  const btn = $('wabtn');
  btn.href = waLink(jornadaMessage(j, state.jornadas, siteUrl()));
  btn.hidden = false;
}

function stepJornada(delta) {
  const n = Math.min(TOTAL, Math.max(1, currentN() + delta));
  $('jn').value = String(n);
  say('');
  prefill();
}

/* ---------- Almacenamiento ---------- */
function setupLocal() {
  let ok = true;
  try {
    const a = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    state.jornadas = Array.isArray(a) ? a.filter(isValidJornada) : [];
  } catch { ok = false; state.jornadas = []; }
  state.mode = ok ? 'local' : 'memory';
  const persist = () => {
    if (!ok) return;
    try { localStorage.setItem(LS_KEY, JSON.stringify(state.jornadas)); } catch { ok = false; state.mode = 'memory'; }
  };
  state.store = {
    async saveJornada(r) {
      state.jornadas = state.jornadas.filter((j) => j.n !== r.n).concat([{ ...r, updatedAt: Date.now() }]);
      persist();
      return { ok: true };
    },
    async removeJornada(n) {
      state.jornadas = state.jornadas.filter((j) => j.n !== n);
      persist();
      return { ok: true };
    },
  };
  state.ready = true;
  render();
}

/** fetch que lanza un error con status y el JSON de la respuesta. */
async function api(url, opts = {}) {
  const r = await fetch(url, { cache: 'no-store', ...opts });
  let data = null;
  try { data = await r.json(); } catch { /* sin cuerpo */ }
  if (!r.ok) { const e = new Error(data?.error || 'http ' + r.status); e.status = r.status; e.data = data; throw e; }
  return data;
}
const authHeaders = (a = {}) => ({ ...(a.pin ? { 'x-admin-pin': a.pin } : {}), ...(a.undo ? { 'x-undo-token': a.undo } : {}) });

function setupRemote() {
  let inflight = null;
  const remoteStore = {
    async saveJornada(r, { who, ...auth } = {}) {
      const res = await api(API, { method: 'POST', headers: { 'content-type': 'application/json', ...authHeaders(auth) }, body: JSON.stringify({ ...r, who }) });
      await load().catch(() => {});
      return res;
    },
    async removeJornada(n, { who, ...auth } = {}) {
      const res = await api(`${API}?n=${encodeURIComponent(n)}${who ? '&who=' + encodeURIComponent(who) : ''}`, { method: 'DELETE', headers: authHeaders(auth) });
      await load().catch(() => {});
      return res;
    },
  };
  const load = () => {
    if (inflight) return inflight;
    inflight = Promise.all([api(API), api(HIST_API).catch(() => null)]).then(([d, hist]) => {
      state.jornadas = (d && Array.isArray(d.jornadas) ? d.jornadas : []).filter(isValidJornada);
      if (hist && Array.isArray(hist.entries)) state.audit = hist.entries;
      state.mode = 'remote';
      state.store = remoteStore;
      state.ready = true;
      ls.set(CACHE_KEY, { at: Date.now(), jornadas: state.jornadas, audit: state.audit });
      render();
    }).finally(() => { inflight = null; });
    return inflight;
  };
  load().catch(() => {
    if (state.ready) return;
    const cache = ls.get(CACHE_KEY, null);
    const localData = ls.get(LS_KEY, []);
    if (cache && Array.isArray(cache.jornadas) && !(Array.isArray(localData) && localData.length)) {
      // Sin conexión, pero ya habíamos descargado los datos: se enseñan sin dejar cambiarlos.
      state.jornadas = cache.jornadas.filter(isValidJornada);
      state.audit = Array.isArray(cache.audit) ? cache.audit : [];
      state.cachedAt = cache.at || 0;
      state.mode = 'cache';
      state.store = null;
      state.ready = true;
      render();
    } else setupLocal();
  });
  const refresh = () => { if ((state.mode === 'remote' || state.mode === 'cache') && !document.hidden) load().catch(() => {}); };
  setInterval(refresh, REFRESH_MS);
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('online', refresh);
}

/* ---------- Instalar como app ---------- */
let installEvent = null;
const INSTALL_X = 'fantasy-install-dismissed-v1';
function renderInstall() {
  const card = $('install');
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const dismissed = !!ls.get(INSTALL_X, false);
  card.hidden = standalone || dismissed || !state.ready;
  $('foot').hidden = standalone || !dismissed;
  if (card.hidden) return;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  $('installbtn').hidden = !installEvent;
  $('installtext').textContent = installEvent
    ? 'Se abre a pantalla completa, con su icono.'
    : ios
      ? 'Compartir → «Añadir a pantalla de inicio».'
      : 'Menú del navegador → «Instalar app».';
}
function setupInstall() {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; renderInstall(); });
  window.addEventListener('appinstalled', () => { installEvent = null; ls.set(INSTALL_X, true); renderInstall(); });
  $('installbtn').addEventListener('click', async () => {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice.catch(() => null);
    installEvent = null;
    renderInstall();
  });
  $('installx').addEventListener('click', () => { ls.set(INSTALL_X, true); renderInstall(); });
  $('installlink').addEventListener('click', () => { ls.set(INSTALL_X, false); renderInstall(); $('install').scrollIntoView({ block: 'center' }); });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

/* ---------- Montaje ---------- */
function buildForm() {
  for (const [slot] of SLOTS) {
    const sel = $(slot);
    sel.append(h('option', { value: '', text: 'Elige…' }));
    for (const n of NAMES) sel.append(h('option', { value: n, text: n }));
  }
  $('form').addEventListener('submit', onSubmit);
  $('jn').addEventListener('change', () => { say(''); prefill(); });
  for (const [slot] of SLOTS) $(slot).addEventListener('change', markFilled);
  $('jprev').addEventListener('click', () => stepJornada(-1));
  $('jnext').addEventListener('click', () => stepJornada(1));
  $('filterchip').addEventListener('click', () => setFilter(null));
  $('auditmore').addEventListener('click', () => { state.auditShown += AUDIT_PAGE; renderAudit(); });
  $('listmore').addEventListener('click', () => { state.listAll = !state.listAll; renderHist(); });

  $('whodlg').addEventListener('close', () => {
    renderWho();
    if (whoResolve) { const r = whoResolve; whoResolve = null; r($('whodlg').returnValue === 'ok' ? state.me : null); }
  });
  $('pinform').addEventListener('submit', onPinSubmit);
  $('pincancel').addEventListener('click', () => $('pindlg').close('cancel'));
  $('pindlg').addEventListener('close', () => {
    if (pinCtx) { const { reject } = pinCtx; pinCtx = null; reject(new Cancelled()); }
  });
  // Cuenta atrás de "sin PIN durante X min"
  setInterval(() => { if (state.ready) { updateHint(); renderHist(); } }, 30000);
}

function buildTicker() {
  // Dos copias seguidas para que el desplazamiento sea continuo; la segunda se oculta a lectores de pantalla.
  const track = h('ul', { class: 'ticker-track' });
  for (let c = 0; c < 2; c++) {
    for (const [slug, name] of TEAMS) {
      track.append(h('li', c ? { 'aria-hidden': 'true' } : {},
        h('img', { src: `img/escudos/${slug}.png`, alt: c ? '' : name, title: name, width: 28, height: 28, loading: 'eager', decoding: 'async' })));
    }
  }
  $('ticker').append(track);
}

/* ---------- Pestañas (Inicio · Estadísticas · Historial) con #hash ---------- */
const VIEWS = ['inicio', 'estadisticas', 'historial'];
const TITLES = { inicio: 'Fantasy LaLiga', estadisticas: 'Estadísticas · Fantasy LaLiga', historial: 'Historial · Fantasy LaLiga' };
const viewFromHash = () => { const v = location.hash.slice(1); return VIEWS.includes(v) ? v : 'inicio'; };
function showView(v, scroll = true) {
  const changed = state.view !== v;
  state.view = v;
  for (const el of document.querySelectorAll('.view')) el.hidden = el.dataset.view !== v;
  for (const a of document.querySelectorAll('#tabbar a')) {
    if (a.dataset.tab === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  document.title = TITLES[v];
  if (changed && scroll) window.scrollTo(0, 0);
}
/** Cambiar de pestaña desde el código (deja la entrada en el historial del navegador). */
function go(v) {
  if (state.view === v) return;
  history.pushState(null, '', v === 'inicio' ? location.pathname + location.search : '#' + v);
  showView(v);
}
function setupTabs() {
  // Los enlaces internos que no son pestañas (#form, #apuntar…) no cambian de pestaña.
  window.addEventListener('hashchange', () => { if (VIEWS.includes(location.hash.slice(1)) || !location.hash) showView(viewFromHash()); });
  window.addEventListener('popstate', () => showView(viewFromHash()));
  showView(viewFromHash(), false);
}

/** Si hay grupo configurado: copia el mensaje y abre el grupo directamente (WhatsApp no deja rellenar un grupo por enlace). */
function setupGroupShare() {
  if (!GROUP_URL) return;
  const PREFIX = 'https://wa.me/?text=';
  let note;
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest && ev.target.closest('a[href^="' + PREFIX + '"]');
    if (!a) return;
    ev.preventDefault();
    const text = decodeURIComponent(a.getAttribute('href').slice(PREFIX.length));
    let copied = Promise.resolve(false);
    try { copied = navigator.clipboard.writeText(text).then(() => true, () => false); } catch { /* sin portapapeles */ }
    window.open(GROUP_URL, '_blank', 'noopener');
    if (!note) { note = h('p', { class: 'copied-note', role: 'status' }); document.body.append(note); }
    copied.then((ok) => {
      note.textContent = ok ? 'Mensaje copiado: pégalo en el grupo' : 'No se pudo copiar el mensaje';
      note.classList.add('show');
      clearTimeout(note._t);
      note._t = setTimeout(() => note.classList.remove('show'), 4000);
    });
  });
}

buildTicker();
buildForm();
setupTabs();
setupInstall();
setupGroupShare();
render();
setupRemote();
