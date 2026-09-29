'use strict';

/* =========================================================
   Cloud — login (Supabase Auth) e acesso à base de dados
   via REST, sem bibliotecas externas.
   ========================================================= */

const SUPA_URL = 'https://rfkxxzovukosbosyqhuj.supabase.co';
const SUPA_KEY = 'sb_publishable_swn6jkkTzo4KOH-N9ZqLJg_9eD1hGyg';
const APP_URL = 'https://pn1990.github.io/games-setlist/';

class CloudError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}

const AUTH_MESSAGES = {
  invalid_credentials: 'Email ou palavra-passe errados. (Se usas a fatura-ai, a conta e a palavra-passe são as mesmas.)',
  email_not_confirmed: 'Ainda não confirmaste o email. Abre o link que te enviámos.',
  user_already_exists: 'Já existe uma conta com este email (por exemplo, da fatura-ai). Usa “Entrar” com essa palavra-passe.',
  weak_password: 'A palavra-passe é demasiado fraca (mínimo 6 caracteres).',
  over_email_send_rate_limit: 'Demasiados emails enviados. Tenta daqui a alguns minutos.',
  validation_failed: 'Verifica o email e a palavra-passe.'
};

const Cloud = {
  session: null,
  _refreshing: null,

  load() {
    try { this.session = JSON.parse(localStorage.getItem('cloud:session') || 'null'); } catch { this.session = null; }
  },
  _save(s) {
    this.session = s;
    try {
      if (s) localStorage.setItem('cloud:session', JSON.stringify(s));
      else localStorage.removeItem('cloud:session');
    } catch { /* ignorar */ }
  },

  get loggedIn() { return !!this.session?.refresh_token; },
  get user() { return this.session?.user || null; },

  _storeTokenResponse(j) {
    this._save({
      access_token: j.access_token,
      refresh_token: j.refresh_token,
      expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600),
      user: { id: j.user?.id, email: j.user?.email }
    });
  },

  async _auth(path, body, token) {
    const headers = { apikey: SUPA_KEY, 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = await fetch(`${SUPA_URL}/auth/v1/${path}`, { method: 'POST', headers, body: JSON.stringify(body || {}) });
    const text = await r.text();
    let j = {};
    try { j = text ? JSON.parse(text) : {}; } catch { /* ignorar */ }
    if (!r.ok) {
      const code = j.error_code || j.code || j.error;
      throw new CloudError(AUTH_MESSAGES[code] || j.msg || j.error_description || j.message || `Erro ${r.status}`, r.status, code);
    }
    return j;
  },

  async signIn(email, password) {
    const j = await this._auth('token?grant_type=password', { email, password });
    this._storeTokenResponse(j);
    return this.user;
  },

  // Devolve { confirm: true } se for preciso confirmar o email
  async signUp(email, password) {
    const j = await this._auth(`signup?redirect_to=${encodeURIComponent(APP_URL)}`, { email, password });
    if (j.access_token) { this._storeTokenResponse(j); return { confirm: false }; }
    // O Supabase não revela se o email já existe: devolve um utilizador sem identidades e não envia email
    const u = j.user || j;
    if (Array.isArray(u.identities) && u.identities.length === 0) {
      throw new CloudError('Já existe uma conta com este email (por exemplo, da fatura-ai). Usa “Entrar” com essa palavra-passe.', 400, 'user_already_exists');
    }
    return { confirm: true };
  },

  async resetPassword(email) {
    await this._auth(`recover?redirect_to=${encodeURIComponent(APP_URL)}`, { email });
  },

  async signOut() {
    const token = this.session?.access_token;
    this._save(null);
    if (token) { try { await this._auth('logout', {}, token); } catch { /* ignorar */ } }
  },

  // Aceita tokens vindos no link de confirmação/recuperação (#access_token=...)
  consumeUrlHash() {
    const h = location.hash.replace(/^#/, '');
    if (!h.includes('access_token=')) return null;
    const p = new URLSearchParams(h);
    const token = p.get('access_token'), refresh = p.get('refresh_token');
    history.replaceState(null, '', location.pathname + location.search);
    if (!token || !refresh) return null;
    let user = {};
    try { user = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { /* ignorar */ }
    this._save({
      access_token: token,
      refresh_token: refresh,
      expires_at: parseInt(p.get('expires_at'), 10) || Math.floor(Date.now() / 1000) + 3600,
      user: { id: user.sub, email: user.email }
    });
    return p.get('type') || 'login';
  },

  async _refresh() {
    if (!this._refreshing) {
      this._refreshing = (async () => {
        try {
          const j = await this._auth('token?grant_type=refresh_token', { refresh_token: this.session.refresh_token });
          this._storeTokenResponse(j);
        } catch (err) {
          // Sessão inválida (ex.: palavra-passe mudada) → sair
          if (err.status === 400 || err.status === 401) this._save(null);
          throw err;
        } finally {
          this._refreshing = null;
        }
      })();
    }
    return this._refreshing;
  },

  async _token() {
    if (!this.loggedIn) throw new CloudError('Sem sessão', 401);
    if (!this.session.access_token || this.session.expires_at - 60 < Date.now() / 1000) await this._refresh();
    return this.session.access_token;
  },

  async request(path, { method = 'GET', body, headers = {} } = {}, retry = true) {
    const token = await this._token();
    const r = await fetch(`${SUPA_URL}${path}`, {
      method,
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers },
      body: body == null ? undefined : JSON.stringify(body)
    });
    if (r.status === 401 && retry) { await this._refresh(); return this.request(path, { method, body, headers }, false); }
    const text = await r.text();
    let j = null;
    try { j = text ? JSON.parse(text) : null; } catch { /* ignorar */ }
    if (!r.ok) throw new CloudError(j?.message || j?.error || `Erro ${r.status}`, r.status);
    return j;
  },

  async pullGames(since) {
    const out = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const q = new URLSearchParams({ select: 'id,data,deleted,updated_at', order: 'updated_at.asc,id.asc', limit: String(pageSize), offset: String(offset) });
      if (since) q.set('updated_at', `gt.${since}`);
      const rows = await this.request(`/rest/v1/setlist_games?${q}`);
      out.push(...(rows || []));
      if (!rows || rows.length < pageSize) break;
    }
    return out;
  },

  async pushGames(rows) {
    for (let i = 0; i < rows.length; i += 200) {
      await this.request('/rest/v1/setlist_games?on_conflict=id', {
        method: 'POST',
        body: rows.slice(i, i + 200),
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }
      });
    }
  },

  async updatePassword(password) {
    await this.request('/auth/v1/user', { method: 'PUT', body: { password } });
  },

  async getSettings() {
    const rows = await this.request('/rest/v1/setlist_settings?select=*');
    return rows?.[0] || null;
  },

  async saveSettings(values) {
    await this.request('/rest/v1/setlist_settings?on_conflict=user_id', {
      method: 'POST',
      body: { user_id: this.user?.id, ...values, updated_at: new Date().toISOString() },
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }
    });
  },

  // Capas oficiais da Nintendo Europa: items = [{ id, title, platform }]
  async findCovers(items) {
    return (await this.request('/functions/v1/setlist-covers', { method: 'POST', body: { items } }))?.results || {};
  },

  async coverCandidates(query, platform) {
    return (await this.request('/functions/v1/setlist-covers', { method: 'POST', body: { query, platform, candidates: true } }))?.covers || [];
  },

  async fetchPrices() {
    return (await this.request('/rest/v1/setlist_prices?select=*')) || [];
  },

  async lookupEan(ean, learn) {
    return this.request('/functions/v1/setlist-ean', { method: 'POST', body: learn ? { ean, learn: true, ...learn } : { ean } });
  },

  async refreshPrices() {
    return this.request('/functions/v1/setlist-prices', { method: 'POST', body: {} });
  }
};

Cloud.load();
