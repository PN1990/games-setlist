// Setlist — capas oficiais da Nintendo Europa (packshots PEGI) para Switch, Switch 2 e 3DS.
// POST { items: [{ id, title, platform }] }            → melhor capa para cada jogo
// POST { query, platform, candidates: true }            → várias opções para o utilizador escolher
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false }
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const SEARCH = 'https://searching.nintendo-europe.com/pt/select';
// Códigos de sistema da Nintendo: HAC = Switch, BEE = Switch 2, CTR = 3DS
const SYSTEM: Record<string, string> = { switch: 'HAC', switch2: 'BEE', '3ds': 'CTR' };

function norm(s: string): string {
  return (s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[™®©]/g, ' ')
    .replace(/nintendo switch 2 edition|nintendo switch edition/g, '')
    .replace(/&/g, ' and ')
    .replace(/colour/g, 'color').replace(/favourite/g, 'favorite') // ortografia UK/US
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Palavras que aparecem em muitos títulos e não servem para distinguir jogos
const GENERIC = new Set(('the of and a an to in for hd remaster remastered edition deluxe definitive complete collection ' +
  'ultimate anniversary gold royal legend legends nintendo switch 3d 3ds new super game games i ii iii iv v vi x ' +
  '1 2 3 4 5 s f plus world chronicles').split(' '));

function score(query: string, candidate: string): number {
  const a = norm(query), b = norm(candidate);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = new Set(a.split(' ')), B = new Set(b.split(' '));
  let inter = 0;
  A.forEach(t => { if (B.has(t)) inter++; });
  let s = (2 * inter) / (A.size + B.size);
  // As palavras distintivas do nome (ex.: "Suikoden", "Legacy") têm de existir no candidato
  const key = [...A].filter(t => !GENERIC.has(t));
  if (key.length) {
    const cover = key.filter(t => B.has(t)).length / key.length;
    if (cover < 0.75) return Math.min(s, 0.3);
  }
  const bundle = /\b(conjunto|bundle|pack|colecao|dlc|passe|pass|expansion|expansao|demo)\b/;
  if (bundle.test(b) && !bundle.test(a)) s -= 0.25;
  return s;
}

type Doc = { title: string; image_url?: string; image_url_sq_s?: string; playable_on_txt?: string[]; url?: string };
type Cover = { title: string; packshot: string | null; square: string | null; system: string; url: string | null; score: number };

const isPackshot = (u?: string) => !!u && /packshot|\/PS_/i.test(u);

function toCover(d: Doc, q: string): Cover {
  return {
    title: d.title,
    packshot: isPackshot(d.image_url) ? d.image_url! : null,
    square: d.image_url_sq_s || (!isPackshot(d.image_url) ? d.image_url || null : null),
    system: (d.playable_on_txt || []).includes('BEE') ? 'switch2' : (d.playable_on_txt || []).includes('HAC') ? 'switch' : '3ds',
    url: d.url ? `https://www.nintendo.com${d.url}` : null,
    score: score(q, d.title)
  };
}

async function search(q: string, platform: string | null, rows = 15): Promise<Doc[]> {
  const sys = platform ? SYSTEM[platform] : null;
  const p = new URLSearchParams({
    q, rows: String(rows), wt: 'json',
    fq: sys ? `type:GAME AND playable_on_txt:${sys}` : 'type:GAME AND (playable_on_txt:HAC OR playable_on_txt:BEE OR playable_on_txt:CTR)',
    fl: 'title,image_url,image_url_sq_s,playable_on_txt,url'
  });
  const r = await fetch(`${SEARCH}?${p}`);
  if (!r.ok) throw new Error(`nintendo ${r.status}`);
  const j = await r.json();
  return (j.response?.docs || []).filter((d: Doc) => d.image_url || d.image_url_sq_s);
}

// Melhor capa para um jogo: mesma plataforma primeiro; Switch 2 aceita também a versão Switch
async function best(title: string, platform: string): Promise<Cover | null> {
  const tries = platform === 'switch2' ? ['switch2', 'switch'] : [platform];
  for (const p of tries) {
    const docs = await search(title, p);
    const ranked = docs.map(d => toCover(d, title)).sort((a, b) => b.score - a.score);
    const top = ranked[0];
    if (top && top.score >= 0.5) return top;
  }
  return null;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: u, error } = await admin.auth.getUser(token);
    if (error || !u?.user) return json({ error: 'unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));

    if (body.candidates) {
      const q = String(body.query || '').slice(0, 120);
      if (!q) return json({ covers: [] });
      const platform = SYSTEM[body.platform] ? body.platform : null;
      let docs = await search(q, platform, 12);
      if (!docs.length && platform) docs = await search(q, null, 12);
      const covers = docs.map(d => toCover(d, q)).sort((a, b) => b.score - a.score).slice(0, 8);
      return json({ covers });
    }

    const items = (Array.isArray(body.items) ? body.items : []).slice(0, 25)
      .filter((i: { id?: string; title?: string; platform?: string }) => i?.id && i?.title && SYSTEM[i.platform || '']);
    const results: Record<string, Cover | null> = {};
    // 5 pesquisas em paralelo de cada vez
    for (let i = 0; i < items.length; i += 5) {
      await Promise.all(items.slice(i, i + 5).map(async (it: { id: string; title: string; platform: string }) => {
        try { results[it.id] = await best(it.title, it.platform); }
        catch (e) { console.warn('cover', it.title, String(e)); results[it.id] = null; }
      }));
    }
    return json({ results });
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
