'use strict';

/* =========================================================
   Setlist — coleção de jogos Nintendo (Switch, Switch 2, 3DS)
   Tudo guardado localmente no dispositivo (IndexedDB).
   ========================================================= */

const PLATFORMS = {
  switch:  { name: 'Switch',   short: 'NS',  color: 'var(--plat-switch)' },
  switch2: { name: 'Switch 2', short: 'NS2', color: 'var(--plat-switch2)' },
  '3ds':   { name: '3DS',      short: '3DS', color: 'var(--plat-3ds)' }
};
const PLATFORM_KEYS = Object.keys(PLATFORMS);

const STATUSES = {
  none:      { name: 'Sem estado', color: 'transparent' },
  backlog:   { name: 'Por jogar',  color: '#8e8e93' },
  playing:   { name: 'A jogar',    color: '#0a84ff' },
  finished:  { name: 'Terminado',  color: '#34c759' },
  completed: { name: '100%',       color: '#e6b800' },
  abandoned: { name: 'Abandonado', color: '#ff453a' }
};

const PRIORITIES = { 1: 'Alta', 2: 'Média', 3: 'Baixa' };

const ICON = {
  cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v5h6V3"/></svg>',
  cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17.5a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9a4 4 0 0 1-.5 8.5"/><path d="M12 11.5v8m-3-3 3 3 3-3"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-8-4.9-8-11a4.6 4.6 0 0 1 8-3 4.6 4.6 0 0 1 8 3c0 6.1-8 11-8 11z"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  chev: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
  ext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  wand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20L15 9M14 4v2M19 9h2M17.5 5.5l1.5-1.5M12 8l4 4"/></svg>'
};

/* ---------------- Utilitários ---------------- */

const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : null; };
const fmtHours = h => h == null || h === '' ? '—' : (Number.isInteger(h) ? h : h.toFixed(1).replace('.', ',')) + 'h';
const fmtMoney = v => v == null ? '—' : v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });
const fmtDate = d => { if (!d) return '—'; const x = new Date(d); return isNaN(x) ? d : x.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' }); };

let toastTimer;
function toast(msg, ms = 2200, top = false) {
  const t = $('#toast');
  t.classList.toggle('top', top);
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

function lsGet(k, def) { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch { return def; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignorar */ } }

async function fetchJSON(url, ms = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------- Base de dados (IndexedDB) ---------------- */

const DB = {
  db: null,
  open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('setlist', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('games', { keyPath: 'id' });
      req.onsuccess = () => { this.db = req.result; resolve(); };
      req.onerror = () => reject(req.error);
    });
  },
  tx(mode) { return this.db.transaction('games', mode).objectStore('games'); },
  all() {
    return new Promise((resolve, reject) => {
      const req = this.tx('readonly').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },
  put(g) {
    return new Promise((resolve, reject) => {
      const req = this.tx('readwrite').put(g);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },
  putMany(list) {
    return new Promise((resolve, reject) => {
      const t = this.db.transaction('games', 'readwrite');
      const s = t.objectStore('games');
      list.forEach(g => s.put(g));
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },
  del(id) {
    return new Promise((resolve, reject) => {
      const req = this.tx('readwrite').delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },
  clear() {
    return new Promise((resolve, reject) => {
      const req = this.tx('readwrite').clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
};

/* ---------------- Estado ---------------- */

let games = [];

const ui = {
  tab: 'collection',
  search: '',
  platform: 'all',
  format: 'all',
  status: 'all',
  sort: lsGet('sort', 'title'),
  wishSort: lsGet('wishSort', 'priority'),
  view: lsGet('view', 'grid')
};

function blankGame(list = 'collection') {
  return {
    id: uid(),
    title: '',
    list,
    platform: lsGet('lastPlatform', 'switch'),
    physical: list === 'collection',
    digital: false,
    status: 'none',
    rating: 0,
    favorite: false,
    priority: 2,
    cover: '',
    description: '',
    year: '',
    releaseDate: '',
    developer: '',
    publisher: '',
    genres: '',
    hltb: { main: null, extra: null, complete: null },
    hltbId: '',
    wikiUrl: '',
    notes: '',
    price: null,
    purchaseDate: '',
    addedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

async function saveGame(g) {
  g.updatedAt = new Date().toISOString();
  const i = games.findIndex(x => x.id === g.id);
  if (i >= 0) games[i] = g; else games.push(g);
  await DB.put(g);
  Sync.markDirty([g.id]);
}

async function saveMany(list) {
  await DB.putMany(list);
  for (const g of list) {
    const i = games.findIndex(x => x.id === g.id);
    if (i >= 0) games[i] = g; else games.push(g);
  }
  Sync.markDirty(list.map(g => g.id));
}

async function deleteGame(id) {
  games = games.filter(g => g.id !== id);
  await DB.del(id);
  Sync.markDeleted([id]);
}

const getGame = id => games.find(g => g.id === id);

/* ---------------- Sincronização com a nuvem ---------------- */

const Sync = {
  dirty: new Set(lsGet('sync:dirty', [])),
  deleted: new Set(lsGet('sync:deleted', [])),
  timer: null,
  running: false,
  again: false,
  status: 'idle', // idle | syncing | error | offline
  error: '',
  lastSync: lsGet('sync:last', null),

  persist() { lsSet('sync:dirty', [...this.dirty]); lsSet('sync:deleted', [...this.deleted]); },
  markDirty(ids) { ids.forEach(id => { this.deleted.delete(id); this.dirty.add(id); }); this.persist(); this.schedule(); },
  markDeleted(ids) { ids.forEach(id => { this.dirty.delete(id); this.deleted.add(id); }); this.persist(); this.schedule(); },
  reset() { this.dirty.clear(); this.deleted.clear(); this.persist(); },

  schedule(ms = 1500) {
    if (!Cloud.loggedIn || this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; this.run(); }, ms);
  },

  async run() {
    if (!Cloud.loggedIn) return;
    if (this.running) { this.again = true; return; }
    if (!navigator.onLine) { this.status = 'offline'; updateSyncUI(); return; }
    this.running = true;
    this.status = 'syncing';
    updateSyncUI();
    try {
      await this.push();
      const changed = await this.pull();
      await loadPrices();
      await loadSettings();
      this.status = 'idle';
      this.error = '';
      this.lastSync = new Date().toISOString();
      lsSet('sync:last', this.lastSync);
      if (changed) refreshAfterSync();
      maybeRefreshPrices();
    } catch (err) {
      console.warn('sync', err);
      this.status = 'error';
      this.error = err.message || String(err);
      if (!Cloud.loggedIn) render();
    }
    this.running = false;
    updateSyncUI();
    if (this.again) { this.again = false; this.schedule(300); }
  },

  async push() {
    const ids = [...this.dirty], dels = [...this.deleted];
    if (!ids.length && !dels.length) return;
    const snapshot = new Map();
    const rows = [];
    for (const id of ids) {
      const g = getGame(id);
      if (g) { snapshot.set(id, g.updatedAt); rows.push({ id, data: g, deleted: false }); }
      else this.dirty.delete(id);
    }
    for (const id of dels) rows.push({ id, data: {}, deleted: true });
    if (rows.length) await Cloud.pushGames(rows);
    for (const id of ids) { const g = getGame(id); if (!g || g.updatedAt === snapshot.get(id)) this.dirty.delete(id); }
    for (const id of dels) if (!getGame(id)) this.deleted.delete(id);
    this.persist();
  },

  async pull() {
    const key = 'sync:lastPull:' + Cloud.user?.id;
    const last = lsGet(key, null);
    // Margem de 10 s para não perder alterações gravadas ao mesmo tempo noutro dispositivo
    const since = last ? new Date(Date.parse(last) - 10000).toISOString() : null;
    const rows = await Cloud.pullGames(since);
    let changed = false;
    const puts = [];
    for (const r of rows) {
      const local = getGame(r.id);
      if (r.deleted) {
        if (local && !this.dirty.has(r.id)) {
          games = games.filter(g => g.id !== r.id);
          await DB.del(r.id);
          changed = true;
        }
        continue;
      }
      const remote = r.data;
      if (!remote || !remote.id || !remote.title) continue;
      const rU = remote.updatedAt || '', lU = local?.updatedAt || '';
      const take = !local || (this.dirty.has(r.id) ? rU > lU : rU !== lU);
      if (take) {
        const g = { ...blankGame(remote.list), ...remote, hltb: { main: null, extra: null, complete: null, ...(remote.hltb || {}) } };
        const i = games.findIndex(x => x.id === g.id);
        if (i >= 0) games[i] = g; else games.push(g);
        puts.push(g);
        this.dirty.delete(g.id);
        changed = true;
      }
    }
    if (puts.length) await DB.putMany(puts);
    if (rows.length) lsSet(key, rows[rows.length - 1].updated_at);
    this.persist();
    return changed;
  }
};

function refreshAfterSync() {
  if (!sheet.isOpen) render();
  else if (currentDetailId && !draft) {
    if (getGame(currentDetailId)) refreshDetail(); else sheet.close();
  }
}

function syncLabel() {
  if (!Cloud.loggedIn) return '';
  if (Sync.status === 'syncing') return 'A sincronizar…';
  if (Sync.status === 'offline') return 'Offline — sincroniza quando voltares a ter rede';
  if (Sync.status === 'error') return 'Erro ao sincronizar: ' + Sync.error;
  if (Sync.dirty.size || Sync.deleted.size) return 'Alterações por enviar…';
  return Sync.lastSync ? 'Sincronizado ' + timeAgo(Sync.lastSync) : 'Ainda não sincronizado';
}

function updateSyncUI() {
  const el = document.getElementById('sync-status');
  if (el) el.textContent = syncLabel();
}

function timeAgo(iso) {
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'agora mesmo';
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  if (s < 86400) return `há ${Math.round(s / 3600)} h`;
  return `há ${Math.round(s / 86400)} dias`;
}

/* ---------------- Preços da eShop ---------------- */

let prices = lsGet('prices', {});
let settings = lsGet('settings', null);

const DEKU_RE = /^https?:\/\/(?:www\.)?dekudeals\.com\/wishlist\/[a-z0-9]+/i;

async function loadSettings() {
  if (!Cloud.loggedIn) return;
  settings = await Cloud.getSettings();
  lsSet('settings', settings);
}

async function linkDeku() {
  const cur = settings?.deku_wishlist_url || '';
  const url = prompt('Cola o link público da tua wishlist do Deku Deals\n(ex.: https://www.dekudeals.com/wishlist/abc123)\n\nDeixa vazio para desligar.', cur);
  if (url == null) return;
  const clean = url.trim();
  if (clean && !DEKU_RE.test(clean)) { toast('Esse link não parece uma wishlist do Deku Deals'); return; }
  try {
    await Cloud.saveSettings({ deku_wishlist_url: clean.match(DEKU_RE)?.[0] || null, deku_error: null });
    await loadSettings();
    render();
    if (clean) { toast('Wishlist do Deku ligada ✓'); refreshPricesNow(true); }
    else toast('Wishlist do Deku desligada');
  } catch (err) {
    toast('Erro: ' + err.message);
  }
}
let lastPriceCall = 0;
let priceRefreshRunning = false;

async function loadPrices() {
  if (!Cloud.loggedIn) return;
  const rows = await Cloud.fetchPrices();
  prices = {};
  rows.forEach(r => { prices[r.game_id] = r; });
  lsSet('prices', prices);
}

// Informação de preço válida para este jogo (só wishlist Switch/Switch 2)
function priceOf(g) {
  if (!g || g.list !== 'wishlist' || g.platform === '3ds') return null;
  const p = prices[g.id];
  if (!p || p.query_title !== g.title.trim() || p.platform !== g.platform) return null;
  return p;
}

function needsPriceCheck(g) {
  if (g.list !== 'wishlist' || g.platform === '3ds') return false;
  const p = prices[g.id];
  return !p || p.query_title !== g.title.trim() || p.platform !== g.platform;
}

// Pede ao servidor preços novos se houver jogos da wishlist ainda sem preço
function maybeRefreshPrices() {
  if (!Cloud.loggedIn || priceRefreshRunning || Date.now() - lastPriceCall < 60000) return;
  if (games.some(needsPriceCheck)) refreshPricesNow(false);
}

async function refreshPricesNow(manual = true) {
  if (!Cloud.loggedIn) { toast('Entra na tua conta para ver preços'); return; }
  if (priceRefreshRunning) return;
  priceRefreshRunning = true;
  lastPriceCall = Date.now();
  if (manual) toast('A procurar preços na eShop…', 20000);
  try {
    if (Sync.dirty.size || Sync.deleted.size) await Sync.push();
    const r = await Cloud.refreshPrices();
    await Sync.pull();
    await loadPrices();
    await loadSettings();
    refreshAfterSync();
    const added = Object.values(r?.deku || {}).reduce((n, d) => n + (d.added || 0), 0);
    if (manual) toast([added ? `${added} jogos novos do Deku` : '', r?.on_sale ? `${r.on_sale} em promoção 🎉` : 'Preços atualizados'].filter(Boolean).join(' · '), 3000);
  } catch (err) {
    if (manual) toast('Não foi possível atualizar os preços');
    console.warn('prices', err);
  }
  priceRefreshRunning = false;
}

function formatLabel(g) {
  if (g.physical && g.digital) return 'Físico + Digital';
  if (g.physical) return 'Físico';
  if (g.digital) return 'Digital';
  return 'Sem formato';
}

/* ---------------- Capas ---------------- */

function coverSrc(g) {
  if (g.cover) return { src: g.cover, square: false };
  const e = priceOf(g)?.eshop_image;
  return e ? { src: e, square: true } : null;
}

function coverHTML(g, extra = '') {
  const p = PLATFORMS[g.platform] || PLATFORMS.switch;
  const c = coverSrc(g);
  const img = c ? `<img src="${esc(c.src)}" alt="" loading="lazy" class="${c.square ? 'sq' : ''}" onerror="this.remove()">` : '';
  return `<div class="cover ${extra}">
    <div class="ph" style="background:linear-gradient(160deg, ${p.color}, #1c1c1e)">${esc(g.title)}</div>
    ${img}
    <div class="plat-bar" style="background:${p.color}"></div>
  </div>`;
}

function formatBadges(g) {
  let s = '';
  if (g.physical) s += `<span class="badge" title="Físico">${ICON.cart}</span>`;
  if (g.digital) s += `<span class="badge" title="Digital">${ICON.cloud}</span>`;
  return s;
}

function platPill(g) {
  const p = PLATFORMS[g.platform] || PLATFORMS.switch;
  return `<span class="pill" style="background:${p.color}">${esc(p.name)}</span>`;
}

function formatPills(g) {
  let s = '';
  if (g.physical) s += `<span class="pill soft">${ICON.cart}Físico</span>`;
  if (g.digital) s += `<span class="pill soft">${ICON.cloud}Digital</span>`;
  return s;
}

/* ---------------- Render principal ---------------- */

const showLogin = () => ui.tab === 'login' || (!Cloud.loggedIn && !lsGet('skipLogin', false));

function render() {
  const login = showLogin();
  document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === ui.tab));
  $('#tabbar').hidden = login;
  $('#fab').hidden = login || !(ui.tab === 'collection' || ui.tab === 'wishlist');
  const v = $('#view');
  if (login) v.innerHTML = renderLogin();
  else if (ui.tab === 'collection' || ui.tab === 'wishlist') v.innerHTML = renderListTab(ui.tab);
  else if (ui.tab === 'stats') v.innerHTML = renderStats();
  else v.innerHTML = renderMore();
}

function filteredGames(list) {
  const q = norm(ui.search);
  let arr = games.filter(g => g.list === list);
  if (ui.platform !== 'all') arr = arr.filter(g => g.platform === ui.platform);
  if (list === 'collection') {
    if (ui.format === 'physical') arr = arr.filter(g => g.physical);
    if (ui.format === 'digital') arr = arr.filter(g => g.digital);
    if (ui.format === 'both') arr = arr.filter(g => g.physical && g.digital);
    if (ui.format === 'fav') arr = arr.filter(g => g.favorite);
    if (ui.status !== 'all') arr = arr.filter(g => (g.status || 'none') === ui.status);
  }
  if (q) arr = arr.filter(g => norm(g.title).includes(q) || norm(g.developer).includes(q) || norm(g.publisher).includes(q) || norm(g.genres).includes(q));

  const sort = list === 'wishlist' ? ui.wishSort : ui.sort;
  const byTitle = (a, b) => a.title.localeCompare(b.title, 'pt', { sensitivity: 'base', numeric: true });
  const cmp = {
    title: byTitle,
    recent: (a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''),
    platform: (a, b) => PLATFORM_KEYS.indexOf(a.platform) - PLATFORM_KEYS.indexOf(b.platform) || byTitle(a, b),
    year: (a, b) => (String(b.year || b.releaseDate || '0')).localeCompare(String(a.year || a.releaseDate || '0')) || byTitle(a, b),
    rating: (a, b) => (b.rating || 0) - (a.rating || 0) || byTitle(a, b),
    hltb: (a, b) => (a.hltb?.main ?? 9999) - (b.hltb?.main ?? 9999) || byTitle(a, b),
    priority: (a, b) => (a.priority || 2) - (b.priority || 2) || byTitle(a, b),
    price: (a, b) => (priceOf(a)?.current_price ?? a.price ?? 99999) - (priceOf(b)?.current_price ?? b.price ?? 99999) || byTitle(a, b),
    discount: (a, b) => (priceOf(b)?.discount_pct || 0) - (priceOf(a)?.discount_pct || 0) || byTitle(a, b)
  }[sort] || byTitle;
  return arr.sort(cmp);
}

function renderListTab(list) {
  const isWish = list === 'wishlist';
  const all = games.filter(g => g.list === list);
  const arr = filteredGames(list);
  const title = isWish ? 'Wishlist' : 'Coleção';
  const sub = isWish
    ? `${all.length} ${all.length === 1 ? 'jogo desejado' : 'jogos desejados'}`
    : `${all.length} ${all.length === 1 ? 'jogo' : 'jogos'} · ${all.filter(g => g.physical).length} físicos · ${all.filter(g => g.digital).length} digitais`;

  const platChips = [['all', 'Todas'], ...PLATFORM_KEYS.map(k => [k, PLATFORMS[k].name])]
    .map(([k, n]) => `<button class="chip ${ui.platform === k ? 'active' : ''}" data-action="filter-platform" data-v="${k}">${k !== 'all' ? `<span class="dot" style="background:${ui.platform === k ? '#fff' : PLATFORMS[k].color}"></span>` : ''}${n}</button>`).join('');

  let secondRow = '';
  if (!isWish) {
    const fmt = [['all', 'Todos'], ['physical', 'Físico'], ['digital', 'Digital'], ['both', 'Ambos'], ['fav', '★ Favoritos']]
      .map(([k, n]) => `<button class="chip ${ui.format === k ? 'active' : ''}" data-action="filter-format" data-v="${k}">${n}</button>`).join('');
    const st = Object.entries(STATUSES).filter(([k]) => k !== 'none')
      .map(([k, s]) => `<button class="chip ${ui.status === k ? 'active' : ''}" data-action="filter-status" data-v="${k}"><span class="dot" style="background:${ui.status === k ? '#fff' : s.color}"></span>${s.name}</button>`).join('');
    secondRow = `<div class="chips">${fmt}</div><div class="chips">${st}</div>`;
  }

  const sortOpts = isWish
    ? [['priority', 'Prioridade'], ['title', 'Título'], ['recent', 'Recentes'], ['discount', 'Promoções'], ['price', 'Preço'], ['platform', 'Plataforma']]
    : [['title', 'Título'], ['recent', 'Recentes'], ['platform', 'Plataforma'], ['year', 'Ano'], ['rating', 'Avaliação'], ['hltb', 'Duração']];
  const curSort = isWish ? ui.wishSort : ui.sort;

  return `
    <div class="page-head">
      <div><h1>${title}</h1><div class="sub">${sub}</div></div>
    </div>
    <div class="search">
      <div class="search-box">${ICON.search}
        <input id="search" type="search" placeholder="Procurar" value="${esc(ui.search)}" autocomplete="off" enterkeyhint="search">
      </div>
    </div>
    <div class="chips">${platChips}</div>
    ${secondRow}
    <div class="toolbar">
      <span id="result-count">${countLabel(arr.length)}</span>
      <span style="display:flex;align-items:center;gap:10px">
        <select id="sort" aria-label="Ordenar">${sortOpts.map(([k, n]) => `<option value="${k}" ${curSort === k ? 'selected' : ''}>↕ ${n}</option>`).join('')}</select>
        <span class="seg-mini">
          <button data-action="view" data-v="grid" class="${ui.view === 'grid' ? 'active' : ''}" aria-label="Grelha">${ICON.grid}</button>
          <button data-action="view" data-v="list" class="${ui.view === 'list' ? 'active' : ''}" aria-label="Lista">${ICON.list}</button>
        </span>
      </span>
    </div>
    <div id="list-results">${resultsHTML(list, all, arr)}</div>`;
}

const countLabel = n => `${n} ${n === 1 ? 'resultado' : 'resultados'}`;

function updateResults() {
  const list = ui.tab;
  const all = games.filter(g => g.list === list);
  const arr = filteredGames(list);
  $('#list-results').innerHTML = resultsHTML(list, all, arr);
  $('#result-count').textContent = countLabel(arr.length);
}

function resultsHTML(list, all, arr) {
  const isWish = list === 'wishlist';
  let body;
  if (!all.length) {
    body = `<div class="empty">
      <div class="big">${isWish ? '💭' : '🎮'}</div>
      <h3>${isWish ? 'A wishlist está vazia' : 'Ainda não tens jogos'}</h3>
      <div>${isWish ? 'Adiciona os jogos que queres comprar.' : 'Adiciona o primeiro jogo ou importa uma lista inteira de uma vez.'}</div>
      <button class="btn" data-action="new">Adicionar jogo</button>
      ${isWish ? '' : `<br><button class="btn secondary" style="margin-top:10px" data-action="seed">Carregar a minha lista (${SEED_COUNT} jogos)</button>
      <br><button class="btn ghost" style="margin-top:10px" data-action="bulk">Importar outra lista</button>`}
    </div>`;
  } else if (!arr.length) {
    body = `<div class="empty"><div class="big">🔍</div><h3>Nada encontrado</h3><div>Experimenta mudar os filtros.</div></div>`;
  } else if (ui.view === 'grid') {
    body = `<div class="grid">${arr.map(cardHTML).join('')}</div>`;
  } else {
    body = `<div class="list">${arr.map(rowHTML).join('')}</div>`;
  }
  return body;
}

// Preço atual da eShop (ou preço alvo manual) para mostrar nas listas
function priceTag(g) {
  const p = priceOf(g);
  if (p && p.current_price != null) {
    const target = g.price != null && p.current_price <= g.price ? ' 🎯' : '';
    return p.discount_pct
      ? `<span class="sale">−${p.discount_pct}%</span> <b>${fmtMoney(p.current_price)}</b>${target}`
      : `${fmtMoney(p.current_price)}${target}`;
  }
  return g.price != null ? `alvo ${fmtMoney(g.price)}` : '';
}

function cardHTML(g) {
  const st = STATUSES[g.status] || STATUSES.none;
  const tag = g.list === 'wishlist' ? priceTag(g) : '';
  const extra = tag ? ` · ${tag}` : '';
  const sale = priceOf(g)?.discount_pct;
  return `<button class="card" data-action="open" data-id="${g.id}">
    <div style="position:relative">
      ${coverHTML(g)}
      <div class="badges" style="position:absolute;left:5px;bottom:5px">${formatBadges(g)}</div>
      ${g.status && g.status !== 'none' && g.list === 'collection' ? `<span class="status-dot" style="position:absolute;right:6px;top:10px;background:${st.color}"></span>` : ''}
      ${g.favorite ? `<span class="fav" style="position:absolute;right:5px;bottom:5px">${ICON.star}</span>` : ''}
      ${sale ? `<span class="sale-badge">−${sale}%</span>` : ''}
    </div>
    <div class="t">${esc(g.title)}</div>
    <div class="p">${esc(PLATFORMS[g.platform]?.name || '')}${extra}</div>
  </button>`;
}

function rowHTML(g) {
  const p = PLATFORMS[g.platform] || PLATFORMS.switch;
  const st = STATUSES[g.status] || STATUSES.none;
  const c = coverSrc(g);
  const img = c ? `<img src="${esc(c.src)}" alt="" loading="lazy" class="${c.square ? 'sq' : ''}" onerror="this.remove()">` : '';
  let meta = platPill(g) + formatPills(g);
  if (g.list === 'collection' && g.status && g.status !== 'none') meta += `<span style="color:${st.color};font-weight:600">● ${st.name}</span>`;
  if (g.list === 'wishlist') {
    meta += `<span>${PRIORITIES[g.priority || 2]}</span>`;
    const tag = priceTag(g);
    if (tag) meta += `<span>${tag}</span>`;
  }
  return `<button class="row" data-action="open" data-id="${g.id}">
    <div class="thumb"><div class="ph" style="background:${p.color}">${esc(g.title.charAt(0).toUpperCase())}</div>${img}</div>
    <div class="info">
      <div class="t">${g.favorite ? '<span style="color:#ffcc00">★</span> ' : ''}${esc(g.title)}</div>
      <div class="m">${meta}</div>
    </div>
    <span class="chev">${ICON.chev}</span>
  </button>`;
}

/* ---------------- Estatísticas ---------------- */

function renderStats() {
  const col = games.filter(g => g.list === 'collection');
  const wish = games.filter(g => g.list === 'wishlist');
  const phys = col.filter(g => g.physical).length;
  const dig = col.filter(g => g.digital).length;
  const both = col.filter(g => g.physical && g.digital).length;
  const spent = col.reduce((s, g) => s + (g.price || 0), 0);
  const wishCost = wish.reduce((s, g) => s + (priceOf(g)?.current_price ?? g.price ?? 0), 0);
  const onSale = wish.filter(g => priceOf(g)?.discount_pct).length;
  const backlog = col.filter(g => g.status === 'backlog');
  const backlogHours = backlog.reduce((s, g) => s + (g.hltb?.main || 0), 0);
  const backlogKnown = backlog.filter(g => g.hltb?.main).length;
  const done = col.filter(g => g.status === 'finished' || g.status === 'completed').length;
  const rated = col.filter(g => g.rating);
  const avg = rated.length ? rated.reduce((s, g) => s + g.rating, 0) / rated.length : 0;

  const maxPlat = Math.max(1, ...PLATFORM_KEYS.map(k => col.filter(g => g.platform === k).length));
  const platBars = PLATFORM_KEYS.map(k => {
    const list = col.filter(g => g.platform === k);
    const onlyP = list.filter(g => g.physical && !g.digital).length;
    const onlyD = list.filter(g => g.digital && !g.physical).length;
    const b = list.filter(g => g.physical && g.digital).length;
    const pct = n => (n / maxPlat * 100).toFixed(1) + '%';
    return `<div class="bar">
      <div class="top"><span><b>${PLATFORMS[k].name}</b></span><span>${list.length} · ${onlyP} F · ${onlyD} D · ${b} F+D</span></div>
      <div class="track">
        <div class="fill" style="width:${pct(onlyP)};background:${PLATFORMS[k].color}"></div>
        <div class="fill" style="width:${pct(b)};background:${PLATFORMS[k].color};opacity:.6"></div>
        <div class="fill" style="width:${pct(onlyD)};background:${PLATFORMS[k].color};opacity:.3"></div>
      </div>
    </div>`;
  }).join('');

  const statusBars = Object.entries(STATUSES).map(([k, s]) => {
    const n = col.filter(g => (g.status || 'none') === k).length;
    const pct = col.length ? (n / col.length * 100).toFixed(1) : 0;
    return `<div class="bar"><div class="top"><span>${s.name}</span><span>${n}</span></div>
      <div class="track"><div class="fill" style="width:${pct}%;background:${k === 'none' ? 'var(--text-3)' : s.color}"></div></div></div>`;
  }).join('');

  return `
    <div class="page-head"><div><h1>Estatísticas</h1><div class="sub">Um resumo da tua coleção</div></div></div>
    <div class="tiles">
      <div class="tile"><div class="v">${col.length}</div><div class="l">Jogos na coleção</div></div>
      <div class="tile"><div class="v">${wish.length}</div><div class="l">Na wishlist</div></div>
      <div class="tile"><div class="v">${phys}</div><div class="l">Físicos</div></div>
      <div class="tile"><div class="v">${dig}</div><div class="l">Digitais</div></div>
      <div class="tile"><div class="v">${both}</div><div class="l">Em ambos os formatos</div></div>
      <div class="tile"><div class="v">${col.length ? Math.round(done / col.length * 100) : 0}%</div><div class="l">Terminados (${done})</div></div>
      <div class="tile"><div class="v">${fmtHours(Math.round(backlogHours))}</div><div class="l">Por jogar (${backlogKnown}/${backlog.length} com HLTB)</div></div>
      <div class="tile"><div class="v">${avg ? avg.toFixed(1).replace('.', ',') + '★' : '—'}</div><div class="l">Avaliação média</div></div>
      <div class="tile"><div class="v" style="font-size:22px">${fmtMoney(spent)}</div><div class="l">Investido na coleção</div></div>
      <div class="tile"><div class="v" style="font-size:22px">${fmtMoney(wishCost)}</div><div class="l">Para comprar a wishlist${onSale ? ` · ${onSale} em promoção` : ''}</div></div>
    </div>
    <div class="group-title" style="margin-top:22px">Por plataforma</div>
    <div class="bars">${platBars}</div>
    <div class="legend"><span><i style="background:var(--text-2)"></i>Só físico (F)</span><span><i style="background:var(--text-2);opacity:.6"></i>Ambos (F+D)</span><span><i style="background:var(--text-2);opacity:.3"></i>Só digital (D)</span></div>
    <div class="group-title" style="margin-top:22px">Por estado</div>
    <div class="bars">${statusBars}</div>`;
}

/* ---------------- Mais ---------------- */

/* ---------------- Login ---------------- */

function renderLogin() {
  const signup = ui.loginMode === 'signup';
  return `<div class="login">
    <img class="login-logo" src="icons/icon-192.png" alt="">
    <h1>Setlist</h1>
    <p class="sub">A tua coleção Nintendo guardada na nuvem, com preços da eShop atualizados todos os dias.</p>
    <div class="segmented" style="margin:18px 0 14px">
      <button class="${signup ? '' : 'active'}" data-action="login-mode" data-v="signin">Entrar</button>
      <button class="${signup ? 'active' : ''}" data-action="login-mode" data-v="signup">Criar conta</button>
    </div>
    <form id="login-form" class="group" autocomplete="on">
      <div class="field"><label>Email</label><input id="login-email" type="email" autocomplete="email" autocapitalize="none" placeholder="nome@email.com" value="${esc(ui.loginEmail || '')}" required></div>
      <div class="field"><label>Palavra-passe</label><input id="login-password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" placeholder="${signup ? 'mínimo 6 caracteres' : '••••••'}" required></div>
    </form>
    <div id="login-msg" class="hint" style="min-height:20px"></div>
    <button class="btn block" data-action="do-login" id="login-btn">${signup ? 'Criar conta' : 'Entrar'}</button>
    ${signup ? '' : '<button class="more-link" style="display:block;margin:14px auto 0" data-action="forgot">Esqueci-me da palavra-passe</button>'}
    <button class="more-link" style="display:block;margin:26px auto 0;color:var(--text-2)" data-action="skip-login">${Cloud.loggedIn ? 'Voltar' : 'Continuar sem conta'}</button>
  </div>`;
}

function loginMsg(text, ok = false) {
  const el = $('#login-msg');
  if (el) { el.textContent = text; el.style.color = ok ? 'var(--ok)' : '#ff3b30'; }
}

async function doLogin() {
  const email = $('#login-email').value.trim();
  const pw = $('#login-password').value;
  ui.loginEmail = email;
  if (!email || !pw) { loginMsg('Preenche o email e a palavra-passe.'); return; }
  const btn = $('#login-btn');
  btn.disabled = true;
  try {
    if (ui.loginMode === 'signup') {
      if (pw.length < 6) { loginMsg('A palavra-passe precisa de pelo menos 6 caracteres.'); btn.disabled = false; return; }
      const r = await Cloud.signUp(email, pw);
      if (r.confirm) {
        ui.loginMode = 'signin';
        render();
        loginMsg('Conta criada! Confirma o email (vê a caixa de correio) e depois entra aqui.', true);
        return;
      }
    } else {
      await Cloud.signIn(email, pw);
    }
    await afterLogin();
  } catch (err) {
    loginMsg(navigator.onLine ? err.message : 'Estás offline.');
    btn.disabled = false;
  }
}

async function afterLogin() {
  lsSet('skipLogin', false);
  // Enviar para a conta os jogos que já estão neste dispositivo
  const linkKey = 'sync:linked:' + Cloud.user?.id;
  if (!lsGet(linkKey, false)) { Sync.markDirty(games.map(g => g.id)); lsSet(linkKey, true); }
  ui.tab = 'collection';
  render();
  toast(`Olá! Sessão iniciada como ${Cloud.user?.email || ''}`);
  await Sync.run();
}

async function logout() {
  if (!confirm('Terminar sessão? Os jogos continuam guardados neste dispositivo.')) return;
  await Cloud.signOut();
  Sync.reset();
  prices = {};
  lsSet('prices', {});
  settings = null;
  lsSet('settings', null);
  lsSet('skipLogin', true);
  render();
  toast('Sessão terminada');
}

function dekuLabel() {
  if (!settings?.deku_wishlist_url) return 'Ligar';
  if (settings.deku_error) return 'Erro — toca para verificar';
  if (!settings.deku_synced_at) return 'Ligada · a aguardar';
  return `Ligada · ${settings.deku_count ?? 0} jogos · ${timeAgo(settings.deku_synced_at)}`;
}

function renderAccount() {
  if (!Cloud.loggedIn) {
    return `<div class="card-list">
      <button class="link-row" data-action="go-login"><span>Entrar / criar conta</span>${ICON.chev}</button>
    </div>
    <div class="hint">Com conta, a coleção fica guardada na nuvem, sincroniza entre dispositivos e recebes preços da eShop.</div>`;
  }
  return `<div class="card-list">
      <div class="link-row" style="color:var(--text)"><span>${esc(Cloud.user?.email || '')}</span></div>
      <button class="link-row" data-action="sync-now"><span>Sincronizar agora</span><span class="d" id="sync-status">${esc(syncLabel())}</span></button>
      <button class="link-row" data-action="refresh-prices"><span>Atualizar preços da wishlist</span>${ICON.chev}</button>
      <button class="link-row" data-action="deku-link"><span>Wishlist do Deku Deals</span><span class="d">${esc(dekuLabel())}</span></button>
      <button class="link-row danger" data-action="logout"><span>Terminar sessão</span></button>
    </div>
    <div class="hint">Os preços da eShop (Portugal) dos jogos da wishlist de Switch e Switch 2 são atualizados automaticamente todos os dias. Se ligares a tua wishlist do Deku Deals, os jogos que lá adicionares (ou removeres) passam também para a wishlist da Setlist.</div>`;
}

function renderMore() {
  const missing = games.filter(g => !g.cover).length;
  return `
    <div class="page-head"><div><h1>Mais</h1><div class="sub">Conta, importar, backups e ajuda</div></div></div>
    <div class="group-title">Conta</div>
    ${renderAccount()}
    <div class="group-title">Adicionar</div>
    <div class="card-list">
      <button class="link-row" data-action="seed"><span>Carregar a minha lista inicial</span><span class="d">${SEED_COUNT} jogos</span></button>
      <button class="link-row" data-action="bulk"><span>Importar lista de jogos</span>${ICON.chev}</button>
      <button class="link-row" data-action="autofill"><span>Preencher capas e info em falta</span><span class="d">${missing} sem capa</span></button>
    </div>
    <div class="group-title">Backup</div>
    <div class="card-list">
      <button class="link-row" data-action="export"><span>Exportar backup (JSON)</span>${ICON.chev}</button>
      <button class="link-row" data-action="import"><span>Importar backup</span>${ICON.chev}</button>
    </div>
    <div class="hint">Os dados ficam guardados só neste dispositivo. Faz um backup de vez em quando (por exemplo para o iCloud Drive) para não perderes nada.</div>
    <div class="group-title">Instalar no iPhone</div>
    <div class="about">
      1. Abre esta página no <b>Safari</b>.<br>
      2. Toca em <b>Partilhar</b> (o quadrado com a seta).<br>
      3. Escolhe <b>Adicionar ao ecrã principal</b>.<br>
      A app passa a abrir em ecrã inteiro e funciona offline.
    </div>
    <div class="group-title">Sobre as informações</div>
    <div class="about">
      As capas, descrições e dados (ano, produtora, género) vêm da <b>Wikipedia/Wikidata</b>.
      O HowLongToBeat não tem API pública, por isso a app abre a página do jogo no HLTB e tu podes
      copiar as horas para os campos <b>Principal</b>, <b>+ Extras</b> e <b>Completista</b>.
      Também podes tirar uma foto à tua caixa e usá-la como capa.
    </div>
    <div class="group-title">Zona perigosa</div>
    <div class="card-list">
      <button class="link-row danger" data-action="wipe"><span>Apagar todos os dados</span></button>
    </div>
    <div class="hint" style="text-align:center;margin-top:24px">Setlist · ${games.length} jogos guardados</div>`;
}

/* ---------------- Sheet (modal) ---------------- */

const sheet = {
  el: null,
  onClose: null,
  open(html, onClose) {
    this.el.innerHTML = html;
    this.onClose = onClose || null;
    this.el.style.transform = '';
    this.el.classList.add('open');
    $('#sheet-backdrop').classList.add('open');
    document.body.style.overflow = 'hidden';
  },
  replace(html) {
    const body = this.el.querySelector('.sheet-body');
    const scroll = body ? body.scrollTop : 0;
    this.el.innerHTML = html;
    const nb = this.el.querySelector('.sheet-body');
    if (nb) nb.scrollTop = scroll;
  },
  close() {
    this.el.classList.remove('open');
    this.el.style.transform = '';
    $('#sheet-backdrop').classList.remove('open');
    document.body.style.overflow = '';
    const cb = this.onClose;
    this.onClose = null;
    if (cb) cb();
  },
  get isOpen() { return this.el.classList.contains('open'); }
};

function sheetHead(title, left, right) {
  return `<div class="sheet-head">
    ${left ? `<button class="link left" data-action="${left[0]}">${left[1]}</button>` : '<span class="link"></span>'}
    <h2>${esc(title)}</h2>
    ${right ? `<button class="link right" data-action="${right[0]}">${right[1]}</button>` : '<span class="link"></span>'}
  </div>`;
}

// Arrastar para baixo para fechar
function setupSheetDrag() {
  let startY = null, dy = 0;
  const el = sheet.el;
  el.addEventListener('touchstart', e => {
    if (e.target.closest('.sheet-head') && !e.target.closest('button')) {
      startY = e.touches[0].clientY; dy = 0;
      el.style.transition = 'none';
    }
  }, { passive: true });
  el.addEventListener('touchmove', e => {
    if (startY == null) return;
    dy = Math.max(0, e.touches[0].clientY - startY);
    el.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  el.addEventListener('touchend', () => {
    if (startY == null) return;
    el.style.transition = '';
    startY = null;
    if (dy > 110) sheet.close();
    else el.style.transform = '';
  });
}

/* ---------------- Detalhe do jogo ---------------- */

let currentDetailId = null;

function openDetail(id) {
  currentDetailId = id;
  sheet.open(detailHTML(getGame(id)), () => { currentDetailId = null; render(); });
}

function refreshDetail() {
  const g = getGame(currentDetailId);
  if (g) sheet.replace(detailHTML(g));
}

function hltbUrl(g) {
  return g.hltbId
    ? `https://howlongtobeat.com/game/${encodeURIComponent(g.hltbId)}`
    : `https://howlongtobeat.com/?q=${encodeURIComponent(g.title)}`;
}

function detailHTML(g) {
  if (!g) return '';
  const isWish = g.list === 'wishlist';
  const st = g.status || 'none';
  const line1 = [g.year || (g.releaseDate || '').slice(0, 4), g.developer].filter(Boolean).join(' · ');

  const statusBtns = Object.entries(STATUSES).map(([k, s]) =>
    `<button class="${st === k ? 'on' : ''}" style="${st === k && k !== 'none' ? `color:${s.color}` : ''}" data-action="set-status" data-v="${k}">${s.name}</button>`).join('');

  const stars = [1, 2, 3, 4, 5].map(n =>
    `<button class="${(g.rating || 0) >= n ? 'on' : ''}" data-action="set-rating" data-v="${n}" aria-label="${n} estrelas">${ICON.star}</button>`).join('');

  const kv = [
    ['Lançamento', g.releaseDate ? fmtDate(g.releaseDate) : g.year],
    ['Produtora', g.developer],
    ['Editora', g.publisher],
    ['Género', g.genres],
    [isWish ? 'Preço alvo' : 'Preço pago', g.price != null ? fmtMoney(g.price) : ''],
    ['Comprado em', !isWish ? (g.purchaseDate ? fmtDate(g.purchaseDate) : '') : ''],
    ['Prioridade', isWish ? PRIORITIES[g.priority || 2] : ''],
    ['Adicionado', fmtDate(g.addedAt)]
  ].filter(([, v]) => v);

  const hasHltb = g.hltb && (g.hltb.main || g.hltb.extra || g.hltb.complete);

  return `${sheetHead(g.title, ['close', 'Fechar'], ['edit', 'Editar'])}
  <div class="sheet-body">
    <div class="detail-hero">
      ${coverHTML(g)}
      <div class="meta">
        <div class="pills">${platPill(g)}${isWish ? '<span class="pill" style="background:#ff2d55">Wishlist</span>' : ''}</div>
        <h1>${esc(g.title)}</h1>
        ${line1 ? `<div class="line">${esc(line1)}</div>` : ''}
        ${g.genres ? `<div class="line">${esc(g.genres)}</div>` : ''}
        <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn small ${g.favorite ? '' : 'ghost'}" data-action="toggle-fav" style="${g.favorite ? 'background:#ffcc00;color:#1c1c1e' : ''}">${ICON.star}Favorito</button>
        </div>
      </div>
    </div>

    <div class="group-title" style="margin-top:22px">${isWish ? 'Formato desejado' : 'Tenho em'}</div>
    <div class="toggles">
      <button class="toggle ${g.physical ? 'on' : ''}" data-action="toggle-format" data-v="physical">${ICON.cart}Físico</button>
      <button class="toggle ${g.digital ? 'on' : ''}" data-action="toggle-format" data-v="digital">${ICON.cloud}Digital</button>
    </div>

    ${isWish ? '' : `
    <div class="group-title">Estado</div>
    <div class="status-grid">${statusBtns}</div>
    <div class="group-title">A minha avaliação</div>
    <div class="stars">${stars}</div>`}

    ${isWish ? eshopHTML(g) : ''}

    <div class="group-title">Duração · HowLongToBeat</div>
    ${hasHltb ? `<div class="hltb">
      <div class="box"><div class="v">${fmtHours(g.hltb.main)}</div><div class="l">Principal</div></div>
      <div class="box"><div class="v">${fmtHours(g.hltb.extra)}</div><div class="l">+ Extras</div></div>
      <div class="box"><div class="v">${fmtHours(g.hltb.complete)}</div><div class="l">Completista</div></div>
    </div>` : '<div class="hint" style="margin-top:0">Ainda sem tempos. Abre o HLTB e copia as horas em “Editar”.</div>'}
    <div class="card-list" style="margin-top:8px">
      <a class="link-row" href="${esc(hltbUrl(g))}" target="_blank" rel="noopener"><span>Ver no HowLongToBeat</span>${ICON.ext}</a>
    </div>

    ${g.description ? `
    <div class="group-title">Sobre</div>
    <div class="desc clamp" id="desc">${esc(g.description)}</div>
    <button class="more-link" data-action="expand-desc">Ler mais</button>` : ''}

    <div class="group-title">Detalhes</div>
    <div class="kv">${kv.map(([k, v]) => `<div class="r"><span>${k}</span><span>${esc(v)}</span></div>`).join('')}</div>

    ${g.notes ? `<div class="group-title">Notas</div><div class="desc" style="white-space:pre-wrap">${esc(g.notes)}</div>` : ''}

    <div class="group-title">Ações</div>
    <div class="card-list">
      ${isWish
        ? '<button class="link-row" data-action="move" data-v="collection"><span>✓ Já comprei — passar para a coleção</span></button>'
        : '<button class="link-row" data-action="move" data-v="wishlist"><span>Passar para a wishlist</span></button>'}
      <button class="link-row" data-action="duplicate"><span>Duplicar (ex.: outra plataforma)</span></button>
      ${g.wikiUrl ? `<a class="link-row" href="${esc(g.wikiUrl)}" target="_blank" rel="noopener"><span>Abrir na Wikipedia</span>${ICON.ext}</a>` : ''}
      ${g.dekuLink ? `<a class="link-row" href="${esc(g.dekuLink)}?country=pt" target="_blank" rel="noopener"><span>Ver no Deku Deals</span>${ICON.ext}</a>`
        : g.platform !== '3ds' ? `<a class="link-row" href="https://www.dekudeals.com/search?q=${encodeURIComponent(g.title)}" target="_blank" rel="noopener"><span>Ver preços no Deku Deals</span>${ICON.ext}</a>` : ''}
      <button class="link-row danger" data-action="delete"><span>Apagar jogo</span></button>
    </div>
  </div>`;
}

function eshopHTML(g) {
  if (g.platform === '3ds') return '';
  const head = '<div class="group-title">Preço na eShop · Portugal</div>';
  if (!Cloud.loggedIn) {
    return head + `<div class="card-list"><button class="link-row" data-action="go-login"><span>Entra na conta para ver o preço atual</span>${ICON.chev}</button></div>`;
  }
  const p = priceOf(g);
  if (!p) {
    return head + `<div class="card-list"><button class="link-row" data-action="refresh-prices"><span>Procurar preço agora</span><span class="d">${priceRefreshRunning ? 'a procurar…' : ''}</span></button></div>`;
  }
  if (p.error === 'not_found' || !p.nsuid) {
    return head + `<div class="hint" style="margin-top:0">Não encontrei este jogo na eShop portuguesa. Confirma se o título está igual ao da eShop (ex.: em inglês) e depois toca em “Procurar preço agora”.</div>
      <div class="card-list" style="margin-top:8px"><button class="link-row" data-action="refresh-prices"><span>Procurar preço agora</span></button></div>`;
  }
  const status = { preorder: 'Pré-venda', onsale: '', not_found: 'Indisponível', sales_termination: 'Já não está à venda' }[p.sales_status] ?? '';
  const target = g.price != null && p.current_price != null && p.current_price <= g.price;
  return head + `<div class="price-box">
      <div class="price-main">
        <span class="now ${p.discount_pct ? 'on-sale' : ''}">${p.current_price != null ? fmtMoney(p.current_price) : '—'}</span>
        ${p.discount_pct ? `<span class="was">${fmtMoney(p.regular_price)}</span><span class="sale">−${p.discount_pct}%</span>` : ''}
      </div>
      ${p.discount_pct && p.discount_end ? `<div class="price-line">Promoção até ${fmtDate(p.discount_end)}</div>` : ''}
      ${status ? `<div class="price-line">${status}</div>` : ''}
      ${target ? '<div class="price-line" style="color:var(--ok);font-weight:700">🎯 Está abaixo do teu preço alvo!</div>' : ''}
      <div class="price-line">Mais baixo registado: ${p.lowest_price != null ? fmtMoney(p.lowest_price) : '—'}</div>
      <div class="price-line small">“${esc(p.eshop_title || '')}” · verificado ${p.checked_at ? timeAgo(p.checked_at) : '—'}</div>
    </div>
    <div class="card-list" style="margin-top:8px">
      ${p.eshop_url ? `<a class="link-row" href="${esc(p.eshop_url)}" target="_blank" rel="noopener"><span>Abrir na eShop</span>${ICON.ext}</a>` : ''}
      <button class="link-row" data-action="refresh-prices"><span>Atualizar preços</span></button>
    </div>`;
}

/* ---------------- Editor ---------------- */

let draft = null;
let editorState = { isNew: false, results: null, loading: false, loadingDetails: false, error: '', fromDetail: false };

function openEditor(g, opts = {}) {
  draft = JSON.parse(JSON.stringify(g));
  draft.hltb = draft.hltb || { main: null, extra: null, complete: null };
  editorState = { isNew: !!opts.isNew, results: null, loading: false, loadingDetails: false, error: '', fromDetail: !!opts.fromDetail };
  const html = editorHTML();
  if (opts.fromDetail && sheet.isOpen) {
    sheet.replace(html);
    sheet.el.querySelector('.sheet-body').scrollTop = 0;
  } else {
    sheet.open(html, () => { draft = null; render(); });
  }
  if (opts.isNew) setTimeout(() => sheet.el.querySelector('#f-title')?.focus(), 350);
}

function refreshEditor() { sheet.replace(editorHTML()); }

function editorHTML() {
  const d = draft;
  const isWish = d.list === 'wishlist';
  const es = editorState;

  const plat = PLATFORM_KEYS.map(k => `<button class="${d.platform === k ? 'active' : ''}" data-v="${k}" data-action="ed-platform">${PLATFORMS[k].name}</button>`).join('');
  const lists = [['collection', 'Coleção'], ['wishlist', 'Wishlist']].map(([k, n]) => `<button class="${d.list === k ? 'active' : ''}" data-v="${k}" data-action="ed-list">${n}</button>`).join('');
  const statusOpts = Object.entries(STATUSES).map(([k, s]) => `<option value="${k}" ${d.status === k ? 'selected' : ''}>${s.name}</option>`).join('');
  const prioOpts = Object.entries(PRIORITIES).map(([k, n]) => `<option value="${k}" ${String(d.priority || 2) === k ? 'selected' : ''}>${n}</option>`).join('');

  let results = '';
  if (es.loading) results = '<div class="loading"><span class="spinner"></span>A procurar na Wikipedia…</div>';
  else if (es.loadingDetails) results = '<div class="loading"><span class="spinner"></span>A carregar informação…</div>';
  else if (es.error) results = `<div class="hint">${esc(es.error)}</div>`;
  else if (es.results) {
    results = es.results.length
      ? `<div class="results">${es.results.map((r, i) => `<button class="result" data-action="pick-result" data-i="${i}">
          ${r.thumb ? `<img src="${esc(r.thumb)}" alt="">` : '<div class="noimg"></div>'}
          <div><div class="t">${esc(r.title)}</div><div class="d">${esc(r.description || '')}</div></div>
        </button>`).join('')}
        <button class="btn ghost small" data-action="close-results">Nenhum destes</button></div>`
      : '<div class="hint">Sem resultados. Experimenta o nome em inglês.</div>';
  }

  return `${sheetHead(es.isNew ? 'Novo jogo' : 'Editar', ['cancel-edit', 'Cancelar'], ['save', 'Guardar'])}
  <div class="sheet-body">
    <div class="group-title">Título</div>
    <div class="title-input">
      <input id="f-title" data-f="title" value="${esc(d.title)}" placeholder="Nome do jogo" autocomplete="off" enterkeyhint="search">
      <button class="btn small" data-action="search-info">${ICON.wand}Info</button>
    </div>
    <div class="hint">Toca em “Info” para ir buscar capa, descrição e dados à Wikipedia.</div>
    ${results}

    <div class="group-title">Lista</div>
    <div class="segmented">${lists}</div>

    <div class="group-title">Plataforma</div>
    <div class="segmented plat">${plat}</div>

    <div class="group-title">${isWish ? 'Formato desejado' : 'Formato que tenho'}</div>
    <div class="toggles">
      <button class="toggle ${d.physical ? 'on' : ''}" data-action="ed-format" data-v="physical">${ICON.cart}Físico</button>
      <button class="toggle ${d.digital ? 'on' : ''}" data-action="ed-format" data-v="digital">${ICON.cloud}Digital</button>
    </div>

    <div class="group-title">Capa</div>
    <div class="cover-edit">
      ${coverHTML(d)}
      <div class="actions">
        <button class="btn secondary small" data-action="search-info">${ICON.search}Procurar capa</button>
        <button class="btn secondary small" data-action="cover-photo">${ICON.camera}Foto / galeria</button>
        <button class="btn ghost small" data-action="cover-url">Colar URL</button>
        ${d.cover ? '<button class="btn danger small" data-action="cover-remove">Remover</button>' : ''}
      </div>
    </div>

    <div class="group-title">${isWish ? 'Wishlist' : 'Progresso'}</div>
    <div class="group">
      ${isWish ? `
      <div class="field"><label>Prioridade</label><select data-f="priority">${prioOpts}</select></div>
      <div class="field"><label>Preço alvo</label><input data-f="price" type="text" inputmode="decimal" placeholder="avisa-me abaixo de…" value="${d.price ?? ''}"><span class="unit">€</span></div>
      ` : `
      <div class="field"><label>Estado</label><select data-f="status">${statusOpts}</select></div>
      <div class="field"><label>Avaliação</label><select data-f="rating">${[0, 1, 2, 3, 4, 5].map(n => `<option value="${n}" ${(d.rating || 0) === n ? 'selected' : ''}>${n ? '★'.repeat(n) : '—'}</option>`).join('')}</select></div>
      <div class="field"><label>Preço pago</label><input data-f="price" type="text" inputmode="decimal" placeholder="0,00" value="${d.price ?? ''}"><span class="unit">€</span></div>
      <div class="field"><label>Comprado em</label><input data-f="purchaseDate" type="date" value="${esc(d.purchaseDate)}"></div>
      `}
    </div>

    <div class="group-title">HowLongToBeat (horas)</div>
    <div class="group">
      <div class="field"><label>Principal</label><input data-f="hltb.main" type="text" inputmode="decimal" placeholder="—" value="${d.hltb.main ?? ''}"><span class="unit">h</span></div>
      <div class="field"><label>+ Extras</label><input data-f="hltb.extra" type="text" inputmode="decimal" placeholder="—" value="${d.hltb.extra ?? ''}"><span class="unit">h</span></div>
      <div class="field"><label>Completista</label><input data-f="hltb.complete" type="text" inputmode="decimal" placeholder="—" value="${d.hltb.complete ?? ''}"><span class="unit">h</span></div>
    </div>
    <div class="card-list" style="margin-top:8px">
      <a class="link-row" href="${esc(hltbUrl(d))}" target="_blank" rel="noopener"><span>Abrir no HowLongToBeat</span>${ICON.ext}</a>
    </div>

    <div class="group-title">Informação</div>
    <div class="group">
      <div class="field"><label>Ano</label><input data-f="year" type="text" inputmode="numeric" placeholder="2025" value="${esc(d.year)}"></div>
      <div class="field"><label>Produtora</label><input data-f="developer" placeholder="Nintendo EPD" value="${esc(d.developer)}"></div>
      <div class="field"><label>Editora</label><input data-f="publisher" placeholder="Nintendo" value="${esc(d.publisher)}"></div>
      <div class="field"><label>Género</label><input data-f="genres" placeholder="Plataformas" value="${esc(d.genres)}"></div>
      <div class="field stack"><label>Descrição</label><textarea data-f="description" rows="4" placeholder="Opcional">${esc(d.description)}</textarea></div>
    </div>

    <div class="group-title">Notas</div>
    <div class="group">
      <div class="field stack"><textarea data-f="notes" rows="3" placeholder="Edição especial, emprestado a…, código por usar…">${esc(d.notes)}</textarea></div>
    </div>

    <div style="height:14px"></div>
    <button class="btn block" data-action="save">Guardar</button>
  </div>`;
}

function onEditorInput(e) {
  const el = e.target;
  const f = el.dataset.f;
  if (!f || !draft) return;
  let v = el.value;
  if (f === 'price') v = v.trim() === '' ? null : num(v);
  if (f === 'rating' || f === 'priority') v = parseInt(v, 10);
  if (f.startsWith('hltb.')) {
    draft.hltb[f.slice(5)] = v.trim() === '' ? null : num(v);
    return;
  }
  draft[f] = v;
  if (f === 'title') {
    // atualizar o texto do placeholder da capa sem re-render
    sheet.el.querySelectorAll('.cover-edit .ph').forEach(p => { p.textContent = v; });
  }
}

async function saveDraft() {
  if (!draft) return;
  draft.title = (draft.title || '').trim();
  if (!draft.title) { toast('Escreve o nome do jogo'); sheet.el.querySelector('#f-title')?.focus(); return; }
  const dup = games.find(g => g.id !== draft.id && g.list === draft.list && g.platform === draft.platform && norm(g.title) === norm(draft.title));
  if (dup && editorState.isNew && !confirm(`Já tens “${dup.title}” (${PLATFORMS[dup.platform].name}) nesta lista. Adicionar mesmo assim?`)) return;
  lsSet('lastPlatform', draft.platform);
  const saved = draft;
  await saveGame(saved);
  toast(editorState.isNew ? 'Jogo adicionado' : 'Guardado');
  if (editorState.fromDetail) {
    draft = null;
    currentDetailId = saved.id;
    sheet.onClose = () => { currentDetailId = null; render(); };
    refreshDetail();
    sheet.el.querySelector('.sheet-body').scrollTop = 0;
  } else {
    sheet.close();
  }
}

/* ---------------- Wikipedia / Wikidata ---------------- */

const WIKI = 'https://en.wikipedia.org/w/api.php';
const WIKIDATA = 'https://www.wikidata.org/w/api.php';

async function wikiSearch(title) {
  const params = new URLSearchParams({
    action: 'query', format: 'json', origin: '*',
    generator: 'search', gsrsearch: `${title} video game`, gsrlimit: '8', gsrnamespace: '0',
    prop: 'pageimages|description|pageprops', piprop: 'thumbnail', pithumbsize: '500', pilicense: 'any',
    ppprop: 'wikibase_item'
  });
  const j = await fetchJSON(`${WIKI}?${params}`);
  const pages = Object.values(j.query?.pages || {}).sort((a, b) => a.index - b.index);
  const res = pages.map(p => ({
    title: p.title,
    pageid: p.pageid,
    description: p.description || '',
    thumb: p.thumbnail?.source || '',
    qid: p.pageprops?.wikibase_item || ''
  }));
  // Jogos primeiro
  const isGame = r => /video ?game|videojogo/i.test(r.description);
  return [...res.filter(isGame), ...res.filter(r => !isGame(r))];
}

async function wikiExtract(lang, title) {
  const params = new URLSearchParams({
    action: 'query', format: 'json', origin: '*', prop: 'extracts', exintro: '1', explaintext: '1',
    redirects: '1', titles: title
  });
  const j = await fetchJSON(`https://${lang}.wikipedia.org/w/api.php?${params}`);
  const p = Object.values(j.query?.pages || {})[0];
  return (p?.extract || '').trim();
}

async function wikidataLabels(ids) {
  if (!ids.length) return {};
  const params = new URLSearchParams({
    action: 'wbgetentities', format: 'json', origin: '*', ids: ids.slice(0, 50).join('|'),
    props: 'labels', languages: 'pt|en'
  });
  const j = await fetchJSON(`${WIKIDATA}?${params}`);
  const out = {};
  for (const [id, e] of Object.entries(j.entities || {})) out[id] = e.labels?.pt?.value || e.labels?.en?.value || '';
  return out;
}

async function wikiDetails(r) {
  const info = {
    cover: r.thumb || '',
    wikiUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`
  };
  let ptTitle = '';
  if (r.qid) {
    try {
      const params = new URLSearchParams({ action: 'wbgetentities', format: 'json', origin: '*', ids: r.qid, props: 'claims|sitelinks' });
      const j = await fetchJSON(`${WIKIDATA}?${params}`);
      const e = j.entities?.[r.qid];
      const claims = e?.claims || {};
      const vals = p => (claims[p] || []).map(c => c.mainsnak?.datavalue?.value).filter(Boolean);
      const ids = p => vals(p).map(v => v.id).filter(Boolean);

      const dates = vals('P577').map(v => v.time).filter(Boolean).sort();
      if (dates.length) {
        const t = dates[0].replace(/^\+/, '');
        info.year = t.slice(0, 4);
        if (!/-00-/.test(t.slice(0, 8))) info.releaseDate = t.slice(0, 10).replace(/-00$/, '-01');
      }
      const hltb = vals('P2816');
      if (hltb.length) info.hltbId = String(hltb[0]);

      const dev = ids('P178').slice(0, 3), pub = ids('P123').slice(0, 3), gen = ids('P136').slice(0, 3);
      const labels = await wikidataLabels([...new Set([...dev, ...pub, ...gen])]);
      const join = arr => arr.map(id => labels[id]).filter(Boolean).join(', ');
      info.developer = join(dev);
      info.publisher = join(pub);
      info.genres = join(gen);
      ptTitle = e?.sitelinks?.ptwiki?.title || '';
    } catch (err) {
      console.warn('Wikidata', err);
    }
  }
  try {
    let desc = ptTitle ? await wikiExtract('pt', ptTitle) : '';
    if (!desc) desc = await wikiExtract('en', r.title);
    if (desc) info.description = desc.length > 1600 ? desc.slice(0, 1600).replace(/\s+\S*$/, '') + '…' : desc;
    if (ptTitle) info.wikiUrl = `https://pt.wikipedia.org/wiki/${encodeURIComponent(ptTitle.replace(/ /g, '_'))}`;
  } catch (err) {
    console.warn('Extract', err);
  }
  return info;
}

function applyInfo(g, info, overwrite = true) {
  for (const k of ['cover', 'description', 'year', 'releaseDate', 'developer', 'publisher', 'genres', 'hltbId', 'wikiUrl']) {
    if (info[k] && (overwrite || !g[k])) g[k] = info[k];
  }
}

async function searchInfo() {
  const t = (draft.title || '').trim();
  if (!t) { toast('Escreve primeiro o nome do jogo'); return; }
  editorState.loading = true; editorState.error = ''; editorState.results = null;
  refreshEditor();
  try {
    editorState.results = await wikiSearch(t);
  } catch (err) {
    editorState.error = navigator.onLine ? 'Não foi possível contactar a Wikipedia. Tenta outra vez.' : 'Estás offline.';
  }
  editorState.loading = false;
  refreshEditor();
}

async function pickResult(i) {
  const r = editorState.results?.[i];
  if (!r) return;
  editorState.results = null;
  editorState.loadingDetails = true;
  refreshEditor();
  try {
    const info = await wikiDetails(r);
    applyInfo(draft, info, true);
    toast('Informação preenchida');
  } catch (err) {
    toast('Erro ao carregar informação');
  }
  editorState.loadingDetails = false;
  refreshEditor();
}

/* ---------------- Capa: foto / URL ---------------- */

function resizeImage(file, max = 600) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagem inválida')); };
    img.src = url;
  });
}

/* ---------------- Importar lista ---------------- */

function parsePlatform(s) {
  const x = norm(s).replace(/[\s_-]/g, '');
  if (!x) return null;
  if (/^(3ds|n3ds|new3ds|2ds|nintendo3ds)$/.test(x)) return '3ds';
  if (/^(switch2|ns2|sw2|s2|nintendoswitch2)$/.test(x)) return 'switch2';
  if (/^(switch|ns|sw|s1|nintendoswitch)$/.test(x)) return 'switch';
  return null;
}
function parseFormat(s) {
  const x = norm(s);
  if (!x) return null;
  if (/^(ambos|both|f\+d|fd|a)$/.test(x.replace(/\s/g, ''))) return { physical: true, digital: true };
  if (/^(fisico|f|physical|p|caixa|cartucho)$/.test(x)) return { physical: true, digital: false };
  if (/^(digital|d|eshop)$/.test(x)) return { physical: false, digital: true };
  return null;
}

function openBulk() {
  sheet.open(`${sheetHead('Importar lista', ['close', 'Fechar'], ['do-bulk', 'Importar'])}
  <div class="sheet-body">
    <div class="about">
      Escreve ou cola um jogo por linha. Opcionalmente podes indicar a plataforma e o formato separados por <b>;</b><br>
      <span style="font-family:ui-monospace,Menlo,monospace;font-size:13px">Mario Kart World; switch 2; físico<br>Zelda Breath of the Wild; switch; ambos<br>Pokémon Y; 3ds</span>
    </div>
    <div style="height:12px"></div>
    <textarea class="bulk" id="bulk-text" placeholder="Um jogo por linha…"></textarea>
    <div class="group-title">Valores por omissão</div>
    <div class="group">
      <div class="field"><label>Lista</label><select id="bulk-list"><option value="collection">Coleção</option><option value="wishlist">Wishlist</option></select></div>
      <div class="field"><label>Plataforma</label><select id="bulk-platform">${PLATFORM_KEYS.map(k => `<option value="${k}">${PLATFORMS[k].name}</option>`).join('')}</select></div>
      <div class="field"><label>Formato</label><select id="bulk-format"><option value="physical">Físico</option><option value="digital">Digital</option><option value="both">Ambos</option></select></div>
    </div>
    <div class="field" style="padding:0 4px;margin-top:10px">
      <label style="width:auto;flex:1">Procurar capas automaticamente</label>
      <input type="checkbox" id="bulk-auto" checked style="flex:none;width:22px;height:22px;-webkit-appearance:checkbox;appearance:auto;accent-color:var(--accent)">
    </div>
    <div class="hint">Linhas repetidas (mesmo nome, plataforma e lista) são ignoradas.</div>
    <div style="height:14px"></div>
    <button class="btn block" data-action="do-bulk">Importar</button>
  </div>`, () => render());
}

async function doBulk() {
  const text = $('#bulk-text').value;
  const list = $('#bulk-list').value;
  const defPlat = $('#bulk-platform').value;
  const defFmt = $('#bulk-format').value;
  const auto = $('#bulk-auto').checked;
  const added = [];
  let skipped = 0;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/^\s*[-*•\d.)]+\s+/, '').trim();
    if (!line) continue;
    const parts = line.split(/\s*[;|\t]\s*/);
    const title = parts[0].trim();
    if (!title) continue;
    let platform = defPlat, fmt = null;
    for (const p of parts.slice(1)) {
      platform = parsePlatform(p) || platform;
      fmt = parseFormat(p) || fmt;
    }
    if (!fmt) fmt = { physical: defFmt !== 'digital', digital: defFmt !== 'physical' };
    const exists = [...games, ...added].some(g => g.list === list && g.platform === platform && norm(g.title) === norm(title));
    if (exists) { skipped++; continue; }
    const g = blankGame(list);
    Object.assign(g, { title, platform, physical: fmt.physical, digital: fmt.digital });
    added.push(g);
  }
  if (!added.length) { toast(skipped ? 'Todos os jogos já existiam' : 'Não há nada para importar'); return; }
  await saveMany(added);
  sheet.close();
  ui.tab = list;
  render();
  toast(`${added.length} jogos importados${skipped ? ` · ${skipped} repetidos ignorados` : ''}`, 3000);
  if (auto) autofill(added);
}

/* ---------------- Lista inicial ---------------- */

const SEED_COUNT = 143;

async function loadSeed() {
  let seed;
  try { seed = await (await fetch('seed.json', { cache: 'no-cache' })).json(); }
  catch { toast('Não foi possível carregar a lista'); return; }
  const added = [];
  for (const s of seed.games || []) {
    const exists = [...games, ...added].some(g => g.list === 'collection' && g.platform === s.platform && norm(g.title) === norm(s.title));
    if (exists) continue;
    const g = blankGame('collection');
    Object.assign(g, { title: s.title, platform: s.platform, physical: !!s.physical, digital: !!s.digital });
    added.push(g);
  }
  if (!added.length) { toast('A lista já está toda carregada ✓'); return; }
  if (!confirm(`Adicionar ${added.length} jogos à coleção e procurar as capas automaticamente?`)) return;
  await saveMany(added);
  ui.tab = 'collection';
  render();
  toast(`${added.length} jogos adicionados`, 2500);
  autofill(added);
}

/* ---------------- Preencher capas automaticamente ---------------- */

let autofillRunning = false;

async function autofill(list) {
  if (autofillRunning) { toast('Já está a correr'); return; }
  const todo = (list || games).filter(g => !g.cover);
  if (!todo.length) { toast('Todos os jogos já têm capa 🎉'); return; }
  if (!navigator.onLine) { toast('Estás offline'); return; }
  autofillRunning = true;
  let ok = 0;
  for (let i = 0; i < todo.length; i++) {
    const g = getGame(todo[i].id);
    if (!g) continue;
    toast(`🔎 A procurar capas… ${i + 1}/${todo.length}`, 60000, true);
    try {
      const res = await wikiSearch(g.title);
      const best = res.find(r => r.thumb && /video ?game/i.test(r.description)) || res.find(r => r.thumb);
      if (best) {
        const info = await wikiDetails(best);
        const fresh = getGame(g.id);
        if (fresh) {
          applyInfo(fresh, info, false);
          await saveGame(fresh);
          ok++;
          if (!sheet.isOpen) render();
        }
      }
    } catch (err) {
      console.warn('autofill', g.title, err);
    }
    await new Promise(r => setTimeout(r, 250));
  }
  autofillRunning = false;
  render();
  toast(`Capas encontradas: ${ok}/${todo.length}. Confirma se estão certas!`, 4000);
}

/* ---------------- Backup ---------------- */

async function exportBackup() {
  const data = JSON.stringify({ app: 'setlist', version: 1, exportedAt: new Date().toISOString(), games }, null, 1);
  const name = `setlist-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([data], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Backup Setlist' }); return; }
    catch (err) { if (err.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

async function importBackup(file) {
  try {
    const j = JSON.parse(await file.text());
    const list = Array.isArray(j) ? j : j.games;
    if (!Array.isArray(list)) throw new Error('formato');
    const valid = list.filter(g => g && g.id && g.title).map(g => ({ ...blankGame(g.list || 'collection'), ...g }));
    if (!valid.length) throw new Error('vazio');
    if (!confirm(`Importar ${valid.length} jogos? Os jogos que já existem são atualizados, os restantes mantêm-se.`)) return;
    await saveMany(valid);
    render();
    toast(`${valid.length} jogos importados`);
  } catch (err) {
    toast('Ficheiro de backup inválido');
  }
}

/* ---------------- Eventos ---------------- */

async function handleAction(el) {
  const a = el.dataset.action;
  const v = el.dataset.v;
  const g = currentDetailId ? getGame(currentDetailId) : null;

  switch (a) {
    // Navegação e filtros
    case 'filter-platform': ui.platform = v; render(); break;
    case 'filter-format': ui.format = ui.format === v ? 'all' : v; render(); break;
    case 'filter-status': ui.status = ui.status === v ? 'all' : v; render(); break;
    case 'view': ui.view = v; lsSet('view', v); render(); break;

    // Abrir / criar
    case 'open': openDetail(el.dataset.id); break;
    case 'new': openEditor(blankGame(ui.tab === 'wishlist' ? 'wishlist' : 'collection'), { isNew: true }); break;
    case 'close': sheet.close(); break;

    // Detalhe
    case 'edit': if (g) openEditor(g, { fromDetail: true }); break;
    case 'toggle-fav': if (g) { g.favorite = !g.favorite; await saveGame(g); refreshDetail(); } break;
    case 'toggle-format':
      if (g) { g[v] = !g[v]; await saveGame(g); refreshDetail(); }
      break;
    case 'set-status': if (g) { g.status = v; await saveGame(g); refreshDetail(); } break;
    case 'set-rating':
      if (g) { const n = parseInt(v, 10); g.rating = g.rating === n ? 0 : n; await saveGame(g); refreshDetail(); }
      break;
    case 'expand-desc': {
      const d = $('#desc');
      if (d) { d.classList.toggle('clamp'); el.textContent = d.classList.contains('clamp') ? 'Ler mais' : 'Ler menos'; }
      break;
    }
    case 'move':
      if (g) {
        g.list = v;
        if (v === 'collection') {
          if (!g.physical && !g.digital) g.physical = true;
          if (!g.status || g.status === 'none') g.status = 'backlog';
          g.addedAt = new Date().toISOString();
          if (g.price != null && !g.purchaseDate) g.purchaseDate = new Date().toISOString().slice(0, 10);
        }
        await saveGame(g);
        toast(v === 'collection' ? 'Passou para a coleção 🎉' : 'Passou para a wishlist');
        refreshDetail();
      }
      break;
    case 'duplicate':
      if (g) {
        const copy = { ...JSON.parse(JSON.stringify(g)), id: uid(), addedAt: new Date().toISOString() };
        const next = PLATFORM_KEYS.find(k => k !== g.platform) || g.platform;
        copy.platform = next;
        copy.status = 'none'; copy.rating = 0; copy.price = null; copy.purchaseDate = ''; copy.notes = '';
        openEditor(copy, { isNew: true, fromDetail: true });
      }
      break;
    case 'delete':
      if (g && confirm(`Apagar “${g.title}”?`)) {
        await deleteGame(g.id);
        toast('Jogo apagado');
        sheet.close();
      }
      break;

    // Editor
    case 'cancel-edit':
      if (editorState.fromDetail && getGame(draft?.id)) {
        currentDetailId = draft.id; draft = null; refreshDetail();
      } else if (editorState.fromDetail && currentDetailId && getGame(currentDetailId)) {
        draft = null; refreshDetail();
      } else {
        sheet.close();
      }
      break;
    case 'save': await saveDraft(); break;
    case 'ed-platform': draft.platform = v; refreshEditor(); break;
    case 'ed-list':
      draft.list = v;
      if (v === 'collection' && !draft.physical && !draft.digital) draft.physical = true;
      refreshEditor();
      break;
    case 'ed-format': draft[v] = !draft[v]; refreshEditor(); break;
    case 'search-info': await searchInfo(); break;
    case 'pick-result': await pickResult(parseInt(el.dataset.i, 10)); break;
    case 'close-results': editorState.results = null; refreshEditor(); break;
    case 'cover-photo': $('#file-cover').click(); break;
    case 'cover-url': {
      const url = prompt('Cola o endereço (URL) da imagem da capa:', draft.cover && !draft.cover.startsWith('data:') ? draft.cover : '');
      if (url != null) { draft.cover = url.trim(); refreshEditor(); }
      break;
    }
    case 'cover-remove': draft.cover = ''; refreshEditor(); break;

    // Conta
    case 'login-mode': ui.loginEmail = $('#login-email')?.value || ui.loginEmail; ui.loginMode = v; render(); break;
    case 'do-login': await doLogin(); break;
    case 'forgot': {
      const email = ($('#login-email')?.value || '').trim();
      if (!email) { loginMsg('Escreve primeiro o teu email.'); break; }
      try { await Cloud.resetPassword(email); loginMsg('Enviámos-te um email para definires uma nova palavra-passe.', true); }
      catch (err) { loginMsg(err.message); }
      break;
    }
    case 'skip-login': lsSet('skipLogin', true); ui.tab = Cloud.loggedIn ? 'more' : 'collection'; render(); break;
    case 'go-login': ui.tab = 'login'; ui.loginMode = 'signin'; render(); window.scrollTo({ top: 0 }); break;
    case 'logout': await logout(); break;
    case 'sync-now': Sync.run(); break;
    case 'refresh-prices': refreshPricesNow(true); break;
    case 'deku-link': await linkDeku(); break;

    // Mais
    case 'seed': await loadSeed(); break;
    case 'bulk': openBulk(); break;
    case 'do-bulk': await doBulk(); break;
    case 'autofill': autofill(); break;
    case 'export': exportBackup(); break;
    case 'import': $('#file-backup').click(); break;
    case 'wipe':
      if (confirm('Apagar TODOS os jogos da coleção e da wishlist?') && confirm('Tens a certeza? Isto não pode ser desfeito (a não ser que tenhas um backup).')) {
        const ids = games.map(g => g.id);
        await DB.clear(); games = [];
        Sync.markDeleted(ids);
        render(); toast('Dados apagados');
      }
      break;
  }
}

function bindEvents() {
  document.addEventListener('click', e => {
    const tab = e.target.closest('[data-tab]');
    if (tab) {
      if (ui.tab !== tab.dataset.tab) {
        ui.tab = tab.dataset.tab;
        ui.search = '';
        ui.platform = 'all'; ui.format = 'all'; ui.status = 'all';
        render();
      }
      window.scrollTo({ top: 0 });
      return;
    }
    const el = e.target.closest('[data-action]');
    if (el) {
      if (el.tagName === 'A') return;
      e.preventDefault();
      handleAction(el);
    }
  });

  $('#sheet-backdrop').addEventListener('click', () => sheet.close());
  document.addEventListener('submit', e => { e.preventDefault(); if (e.target.id === 'login-form') doLogin(); });

  document.addEventListener('input', e => {
    if (e.target.id === 'search') {
      ui.search = e.target.value;
      updateResults();
      return;
    }
    if (e.target.closest('#sheet') && e.target.dataset.f) onEditorInput(e);
  });

  document.addEventListener('change', e => {
    if (e.target.id === 'sort') {
      if (ui.tab === 'wishlist') { ui.wishSort = e.target.value; lsSet('wishSort', ui.wishSort); }
      else { ui.sort = e.target.value; lsSet('sort', ui.sort); }
      render();
      return;
    }
    if (e.target.closest('#sheet') && e.target.dataset.f && e.target.tagName === 'SELECT') onEditorInput(e);
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.id === 'f-title') { e.preventDefault(); e.target.blur(); searchInfo(); }
    if (e.key === 'Enter' && e.target.id === 'search') e.target.blur();
    if (e.key === 'Enter' && (e.target.id === 'login-password' || e.target.id === 'login-email')) { e.preventDefault(); doLogin(); }
    if (e.key === 'Escape' && sheet.isOpen) sheet.close();
  });

  $('#file-cover').addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f || !draft) return;
    try { draft.cover = await resizeImage(f); refreshEditor(); }
    catch { toast('Não foi possível ler a imagem'); }
  });

  $('#file-backup').addEventListener('change', e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) importBackup(f);
  });
}

/* ---------------- Arranque ---------------- */

async function init() {
  sheet.el = $('#sheet');
  setupSheetDrag();
  bindEvents();
  try {
    await DB.open();
    games = await DB.all();
  } catch (err) {
    console.error(err);
    toast('Erro ao abrir a base de dados');
  }
  const fromLink = Cloud.consumeUrlHash();
  render();
  if (fromLink === 'recovery') {
    const pw = prompt('Escreve a nova palavra-passe (mínimo 6 caracteres):');
    if (pw && pw.length >= 6) {
      try { await Cloud.updatePassword(pw); toast('Palavra-passe alterada ✓'); }
      catch (err) { toast('Erro: ' + err.message); }
    }
  }
  if (fromLink) await afterLogin();
  else if (Cloud.loggedIn) Sync.run();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') Sync.schedule(200); });
  window.addEventListener('online', () => Sync.schedule(200));
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW', err));
  }
}

init();
