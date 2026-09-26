// Setlist — descobrir o jogo a partir do código de barras (EAN/UPC) da caixa.
// Fontes: cache própria (setlist_ean) → UPCitemdb (trial) → Open Products Facts.
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

// Normaliza para EAN-13 e valida o dígito de controlo
function normEan(raw: string): string | null {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length === 12) d = '0' + d; // UPC-A
  if (d.length !== 13 && d.length !== 8) return null;
  const digits = d.split('').map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((s, n, i) => s + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check ? d : null;
}

function detectPlatform(t: string): string | null {
  const s = t.toLowerCase();
  if (/switch\s*2|switch2|\bns2\b/.test(s)) return 'switch2';
  if (/\b3ds\b|\b2ds\b/.test(s)) return '3ds';
  if (/switch|\bnsw\b/.test(s)) return 'switch';
  return null;
}

function cleanTitle(t: string): string {
  let s = t
    .replace(/\s+/g, ' ')
    .replace(/(\w) s\b/g, "$1's") // apóstrofos perdidos: "Kirby s Return" → "Kirby's Return"
    .replace(/nintendo switch 2 edition/ig, '')
    .replace(/\((?:[^)]*?(?:switch|3ds|2ds|pal|eu|uk|version|edition\s*$)[^)]*)\)/ig, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/^(?:nintendo\s+)?(?:switch\s*2|switch|3ds|2ds)\s*[:\-–]\s*/i, '')
    .replace(/\b(?:for|para|pour|für)\s+(?:the\s+)?nintendo\s+(?:switch\s*2|switch|3ds)\b/ig, '')
    .replace(/\bnintendo\s+(?:switch\s*2|switch|3ds|2ds)\b/ig, '')
    .replace(/\b(?:eu|uk|pal|pegi)\s*(?:version|edition)?\b.*$/i, '')
    .replace(/\bregion\s*free\b/ig, '')
    .replace(/\bvideo\s*game\b/ig, '')
    .replace(/(?:\s*[-–|,:]\s*)+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s || t.trim();
}

async function lookupUpcItemDb(ean: string): Promise<string | null> {
  const r = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${ean}`);
  if (!r.ok) return null;
  const j = await r.json();
  return j.items?.[0]?.title || null;
}

async function lookupOpenProducts(ean: string): Promise<string | null> {
  for (const host of ['world.openproductsfacts.org', 'world.openfoodfacts.org']) {
    const r = await fetch(`https://${host}/api/v2/product/${ean}.json?fields=product_name`);
    if (!r.ok) continue;
    const j = await r.json();
    if (j.status === 1 && j.product?.product_name) return j.product.product_name;
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
    const ean = normEan(body.ean);
    if (!ean) return json({ error: 'invalid_ean' }, 400);

    // Aprender: o utilizador corrigiu o título/plataforma deste código
    if (body.learn && body.title) {
      await admin.from('setlist_ean').upsert({
        ean, title: String(body.title).slice(0, 200), platform: body.platform || null,
        source: 'user', updated_at: new Date().toISOString()
      });
      return json({ ean, saved: true });
    }

    const { data: cached } = await admin.from('setlist_ean').select('*').eq('ean', ean).maybeSingle();
    if (cached?.title) return json({ ean, title: cached.title, platform: cached.platform, raw: cached.raw_title, source: cached.source, cached: true });

    let raw: string | null = null, source = '';
    try { raw = await lookupUpcItemDb(ean); if (raw) source = 'upcitemdb'; } catch (e) { console.warn('upcitemdb', e); }
    if (!raw) {
      try { raw = await lookupOpenProducts(ean); if (raw) source = 'openproductsfacts'; } catch (e) { console.warn('opf', e); }
    }
    if (!raw) return json({ ean, title: null });

    const result = { ean, title: cleanTitle(raw), platform: detectPlatform(raw), raw, source };
    await admin.from('setlist_ean').upsert({ ean, title: result.title, platform: result.platform, raw_title: raw, source });
    return json(result);
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
