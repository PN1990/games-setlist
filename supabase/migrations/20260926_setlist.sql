-- Setlist: tabelas no projeto Supabase (partilhado com a fatura-ai; prefixo setlist_).
-- Aplicado via Supabase MCP. Guardado aqui como referência.

create table public.setlist_games (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now()
);
create index setlist_games_user_updated_idx on public.setlist_games (user_id, updated_at);

create or replace function public.setlist_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger setlist_games_touch before insert or update on public.setlist_games
for each row execute function public.setlist_touch();

alter table public.setlist_games enable row level security;
create policy "setlist_games select own" on public.setlist_games for select to authenticated using (user_id = (select auth.uid()));
create policy "setlist_games insert own" on public.setlist_games for insert to authenticated with check (user_id = (select auth.uid()));
create policy "setlist_games update own" on public.setlist_games for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "setlist_games delete own" on public.setlist_games for delete to authenticated using (user_id = (select auth.uid()));

-- Preços da eShop, escritos só pela edge function (service role)
create table public.setlist_prices (
  game_id text primary key references public.setlist_games(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  query_title text, platform text, nsuid text,
  eshop_title text, eshop_url text, eshop_image text,
  sales_status text, regular_price numeric, current_price numeric,
  discount_pct int, discount_end timestamptz, lowest_price numeric,
  error text, checked_at timestamptz
);
create index setlist_prices_user_idx on public.setlist_prices (user_id);
alter table public.setlist_prices enable row level security;
create policy "setlist_prices select own" on public.setlist_prices for select to authenticated using (user_id = (select auth.uid()));
create policy "setlist_prices delete own" on public.setlist_prices for delete to authenticated using (user_id = (select auth.uid()));

-- Segredo do cron (schema privado, fora da API)
create schema if not exists setlist_private;
revoke all on schema setlist_private from public, anon, authenticated;
create table setlist_private.config (key text primary key, value text not null);
revoke all on setlist_private.config from public, anon, authenticated;
insert into setlist_private.config (key, value) values ('cron_secret', encode(extensions.gen_random_bytes(24), 'hex'));

create or replace function public.setlist_verify_cron(secret text) returns boolean
language sql security definer set search_path = '' as $$
  select exists (select 1 from setlist_private.config where key = 'cron_secret' and value = secret);
$$;
revoke all on function public.setlist_verify_cron(text) from public, anon, authenticated;
grant execute on function public.setlist_verify_cron(text) to service_role;

-- Atualização diária dos preços (07:13 UTC)
select cron.schedule('setlist-prices-daily', '13 7 * * *', $$
  select net.http_post(
    url := 'https://rfkxxzovukosbosyqhuj.supabase.co/functions/v1/setlist-prices',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select value from setlist_private.config where key='cron_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 120000);
$$);

-- Definições por utilizador (link da wishlist do Deku Deals, sincronizada pela edge function)
create table public.setlist_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  deku_wishlist_url text,
  deku_synced_at timestamptz,
  deku_count int,
  deku_error text,
  updated_at timestamptz not null default now()
);
alter table public.setlist_settings enable row level security;
create policy "setlist_settings select own" on public.setlist_settings for select to authenticated using (user_id = (select auth.uid()));
create policy "setlist_settings insert own" on public.setlist_settings for insert to authenticated with check (user_id = (select auth.uid()));
create policy "setlist_settings update own" on public.setlist_settings for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
