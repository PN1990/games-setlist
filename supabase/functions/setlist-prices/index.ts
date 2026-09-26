// Setlist — preços da eShop Nintendo (Portugal) para os jogos da wishlist.
// Chamada pela app (com o token do utilizador) ou pelo pg_cron (com x-cron-secret).
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const SEARCH = 'https://searching.nintendo-europe.com/pt/select';
const PRICE = 'https://api.ec.nintendo.com/v1/price';
const SYSTEM: Record<string, string> = { switch: 'HAC', switch2: 'BEE' };

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false }
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

function norm(s: string): string {
  return (s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/nintendo switch 2 edition|nintendo switch edition/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function score(query: string, candidate: string): number {
  const a = norm(query), b = norm(candidate);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = new Set(a.split(' ')), B = new Set(b.split(' '));
  let inter = 0;
  A.forEach(t => { if (B.has(t)) inter++; });
  let s = (2 * inter) / (A.size + B.size);
  const bundle = /\b(conjunto|bundle|pack|colecao|collection|dlc|passe|pass|expansion|expansao)\b/;
  if (bundle.test(b) && !bundle.test(a)) s -= 0.25;
  return s;
}

type Doc = { title: string; nsuid_txt?: string[]; url?: string; image_url_sq_s?: string; playable_on_txt?: string[] };

async function searchEshop(title: string, platform: string): Promise<Doc | null> {
  const tryFq = async (sys: string | null) => {
    const p = new URLSearchParams({
      q: title, rows: '15', wt: 'json',
      fq: sys ? `type:GAME AND playable_on_txt:${sys}` : 'type:GAME AND (playable_on_txt:HAC OR playable_on_txt:BEE)',
      fl: 'title,nsuid_txt,url,image_url_sq_s,playable_on_txt'
    });
    const r = await fetch(`${SEARCH}?${p}`);
    if (!r.ok) throw new Error(`search ${r.status}`);
    const j = await r.json();
    const docs: Doc[] = (j.response?.docs || []).filter((d: Doc) => d.nsuid_txt?.length);
    let best: Doc | null = null, bestScore = 0;
    for (const d of docs) {
      const s = score(title, d.title);
      if (s > bestScore) { best = d; bestScore = s; }
    }
    return bestScore >= 0.6 ? best : null;
  };
  return (await tryFq(SYSTEM[platform] || null)) || (await tryFq(null));
}

type PriceInfo = { sales_status: string; regular: number | null; current: number | null; pct: number | null; end: string | null };

async function fetchPrices(nsuids: string[]): Promise<Record<string, PriceInfo>> {
  const out: Record<string, PriceInfo> = {};
  for (let i = 0; i < nsuids.length; i += 50) {
    const ids = nsuids.slice(i, i + 50);
    const r = await fetch(`${PRICE}?country=PT&lang=pt&ids=${ids.join(',')}`);
    if (!r.ok) throw new Error(`price ${r.status}`);
    const j = await r.json();
    for (const p of j.prices || []) {
      const regular = p.regular_price ? parseFloat(p.regular_price.raw_value) : null;
      const disc = p.discount_price ? parseFloat(p.discount_price.raw_value) : null;
      const current = disc ?? regular;
      out[String(p.title_id)] = {
        sales_status: p.sales_status,
        regular,
        current,
        pct: disc != null && regular ? Math.round((1 - disc / regular) * 100) : null,
        end: p.discount_price?.end_datetime || null
      };
    }
  }
  return out;
}

// ---------- Wishlists do Deku Deals (sincronização num só sentido: Deku → Setlist) ----------
// Cada utilizador pode ligar várias wishlists, cada uma associada a uma plataforma.

const DEKU_RE = /^https?:\/\/(?:www\.)?dekudeals\.com\/wishlist\/([a-z0-9]+)/i;
const PLATFORMS = new Set(['switch', 'switch2', '3ds']);

type DekuList = { url: string; platform?: string; synced_at?: string; count?: number; error?: string | null };
type DekuItem = { name: string; link: string; added_at?: string };
type Row = { id: string; data: Record<string, unknown>; deleted: boolean };

async function syncList(userId: string, list: DekuList, code: string, rows: Row[]) {
  const platform = PLATFORMS.has(list.platform || '') ? list.platform! : 'switch';
  const r = await fetch(`https://www.dekudeals.com/wishlist/${code}.json`);
  if (!r.ok) throw new Error(`deku ${r.status}`);
  const j = await r.json();
  if (!Array.isArray(j.items)) throw new Error('deku sem items');
  const items = (j.items as DekuItem[]).filter(i => i && i.name && i.link);

  const ids = new Set(rows.map(r => r.id));
  const mine = rows.filter(r => r.data?.dekuList === code);
  const linked = new Set(mine.map(r => r.data.dekuLink as string));

  const now = new Date().toISOString();
  const inserts = [];
  for (const it of items) {
    const slug = it.link.split('/').pop()!.replace(/[^a-z0-9-]/gi, '').slice(0, 80);
    const id = `deku-${userId}-${code}-${slug}`;
    // Já existe (mesmo que apagado de propósito na Setlist) → não voltar a criar
    if (ids.has(id) || linked.has(it.link)) continue;
    inserts.push({
      id, user_id: userId, deleted: false,
      data: {
        id, title: it.name, list: 'wishlist', platform, physical: false, digital: false,
        status: 'none', rating: 0, favorite: false, priority: 2, price: null,
        hltb: { main: null, extra: null, complete: null },
        dekuLink: it.link, dekuList: code, addedAt: it.added_at || now, updatedAt: now
      }
    });
  }
  if (inserts.length) {
    const { error } = await admin.from('setlist_games').insert(inserts);
    if (error) throw error;
  }

  // Removidos no Deku → sair da wishlist da Setlist (só os desta lista que continuam na wishlist)
  let removed = 0;
  if (items.length) {
    const links = new Set(items.map(i => i.link));
    for (const r of mine) {
      if (r.deleted || r.data.list !== 'wishlist' || links.has(r.data.dekuLink as string)) continue;
      await admin.from('setlist_games').update({ deleted: true, data: {} }).eq('id', r.id);
      removed++;
    }
  }
  return { count: items.length, added: inserts.length, removed };
}

async function dekuSync(userId: string | null) {
  let q = admin.from('setlist_settings').select('user_id,deku_lists');
  if (userId) q = q.eq('user_id', userId);
  const { data: settings, error } = await q;
  if (error) throw error;
  const report: Record<string, { added: number; removed: number }> = {};
  for (const st of (settings || []) as { user_id: string; deku_lists: DekuList[] }[]) {
    const lists = Array.isArray(st.deku_lists) ? st.deku_lists : [];
    if (!lists.length) continue;
    const { data: rows, error: gErr } = await admin.from('setlist_games')
      .select('id,data,deleted').eq('user_id', st.user_id).limit(5000);
    if (gErr) throw gErr;
    const total = { added: 0, removed: 0 };
    const updated: DekuList[] = [];
    for (const list of lists) {
      const code = (list.url || '').match(DEKU_RE)?.[1];
      if (!code) { updated.push({ ...list, error: 'invalid_url' }); continue; }
      try {
        const res = await syncList(st.user_id, list, code, (rows || []) as Row[]);
        total.added += res.added; total.removed += res.removed;
        updated.push({ ...list, synced_at: new Date().toISOString(), count: res.count, error: null });
      } catch (e) {
        updated.push({ ...list, error: String((e as Error).message || e) });
      }
    }
    await admin.from('setlist_settings').update({ deku_lists: updated }).eq('user_id', st.user_id);
    report[st.user_id] = total;
  }
  return report;
}

type GameRow = { id: string; user_id: string; data: { title?: string; platform?: string; list?: string } };
type PriceRow = Record<string, unknown> & { game_id: string; nsuid?: string | null; query_title?: string; platform?: string; lowest_price?: number | null; checked_at?: string };

async function run(userId: string | null) {
  let deku: Record<string, unknown> = {};
  try { deku = await dekuSync(userId); } catch (e) { console.error('deku', e); }
  let q = admin.from('setlist_games').select('id,user_id,data').eq('deleted', false).eq('data->>list', 'wishlist').in('data->>platform', ['switch', 'switch2']);
  if (userId) q = q.eq('user_id', userId);
  const { data: games, error } = await q.limit(1000);
  if (error) throw error;
  if (!games?.length) return { games: 0, updated: 0, deku };

  const ids = (games as GameRow[]).map(g => g.id);
  const { data: existing } = await admin.from('setlist_prices').select('*').in('game_id', ids);
  const byGame = new Map<string, PriceRow>((existing || []).map((p: PriceRow) => [p.game_id, p]));

  const rows: PriceRow[] = [];
  for (const g of games as GameRow[]) {
    const title = (g.data.title || '').trim();
    const platform = g.data.platform || 'switch';
    const prev = byGame.get(g.id);
    const row: PriceRow = { ...(prev || {}), game_id: g.id, user_id: g.user_id, query_title: title, platform, error: null };
    // Voltar a procurar se o título/plataforma mudou ou ainda não há correspondência
    if (!prev?.nsuid || prev.query_title !== title || prev.platform !== platform) {
      try {
        const d = await searchEshop(title, platform);
        if (d) {
          Object.assign(row, {
            nsuid: d.nsuid_txt![0],
            eshop_title: d.title,
            eshop_url: d.url ? `https://www.nintendo.com${d.url}` : null,
            eshop_image: d.image_url_sq_s || null,
            lowest_price: null
          });
        } else {
          Object.assign(row, { nsuid: null, eshop_title: null, eshop_url: null, eshop_image: null, regular_price: null, current_price: null, discount_pct: null, discount_end: null, sales_status: null, error: 'not_found' });
        }
      } catch (e) {
        row.error = String(e);
      }
    }
    rows.push(row);
  }

  const nsuids = [...new Set(rows.map(r => r.nsuid).filter(Boolean) as string[])];
  const prices = nsuids.length ? await fetchPrices(nsuids) : {};
  const now = new Date().toISOString();
  for (const r of rows) {
    r.checked_at = now;
    const p = r.nsuid ? prices[r.nsuid as string] : null;
    if (!p) { if (r.nsuid && !r.error) r.error = 'no_price'; continue; }
    r.sales_status = p.sales_status;
    r.regular_price = p.regular;
    r.current_price = p.current;
    r.discount_pct = p.pct;
    r.discount_end = p.end;
    const low = r.lowest_price as number | null | undefined;
    if (p.current != null) r.lowest_price = low == null ? p.current : Math.min(low, p.current);
  }
  const { error: upErr } = await admin.from('setlist_prices').upsert(rows, { onConflict: 'game_id' });
  if (upErr) throw upErr;
  return { games: rows.length, matched: rows.filter(r => r.nsuid).length, on_sale: rows.filter(r => r.discount_pct).length, deku };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const cronSecret = req.headers.get('x-cron-secret');
    if (cronSecret) {
      const { data: ok } = await admin.rpc('setlist_verify_cron', { secret: cronSecret });
      if (!ok) return json({ error: 'unauthorized' }, 401);
      return json(await run(null));
    }
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: u, error } = await admin.auth.getUser(token);
    if (error || !u?.user) return json({ error: 'unauthorized' }, 401);
    return json(await run(u.user.id));
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
