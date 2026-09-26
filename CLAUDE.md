# Setlist — notas para o Claude

App PWA estática (GitHub Pages) para a coleção de jogos Nintendo do Pedro. Ver README.md.

## Supabase (IMPORTANTE)
- A Setlist usa o projeto Supabase **fatura-ai** (`rfkxxzovukosbosyqhuj`), partilhado com a app fatura-ai
  (o plano gratuito só permite 2 projetos ativos).
- Tudo o que pertence à Setlist tem prefixo `setlist`. **Não apagar** ao trabalhar na fatura-ai:
  - tabelas `public.setlist_games`, `public.setlist_prices`, `public.setlist_settings`
  - schema `setlist_private` (tabela `config` com o segredo do cron)
  - funções `public.setlist_verify_cron`, `public.setlist_touch`
  - edge function `setlist-prices`
  - cron job `setlist-prices-daily` (07:13 UTC)
- As contas de login (auth.users) são partilhadas entre as duas apps.
- SQL de referência em `supabase/migrations/`, código da edge function em `supabase/functions/setlist-prices/`.

## App
- `cloud.js`: login e REST do Supabase sem dependências (chave publishable).
- `app.js`: IndexedDB local + sincronização (`Sync`), preços (`priceOf`), UI.
- Ao mudar ficheiros da app, subir o `?v=` em `index.html` e a `VERSION` em `sw.js`.
