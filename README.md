# Setlist — Jogos Nintendo

App web (PWA) para gerir a coleção de jogos **Nintendo Switch**, **Switch 2** e **3DS**, feita para o iPhone.

## Funcionalidades
- Checklist da coleção com formato **Físico**, **Digital** ou **ambos**
- **Wishlist** com prioridade e preço alvo, e botão “Já comprei” para passar para a coleção
- **Conta (login)**: a coleção fica na nuvem (Supabase) e sincroniza entre dispositivos; funciona offline
- **Preços da eShop (Portugal)** para a wishlist de Switch/Switch 2, atualizados automaticamente todos os dias:
  preço atual, promoções (−%), data de fim, preço mais baixo registado e aviso de preço alvo
- **Leitor de código de barras (EAN)**: aponta a câmara à caixa para saber se já tens o jogo ou para o adicionar já preenchido
- **Capas oficiais da Nintendo Europa** (fotos das caixas PEGI da plataforma certa), com escolha manual entre várias opções
- Descrição, ano, produtora, editora e género via **Wikipedia/Wikidata** (ou foto tirada à caixa)
- Tempos do **HowLongToBeat** (Principal / + Extras / Completista) com link direto para o jogo
- Estado (Por jogar, A jogar, Terminado, 100%, Abandonado), avaliação, favoritos e notas
- Pesquisa, filtros, ordenação, vista em grelha ou lista, estatísticas
- Lista inicial (`seed.json`), importação em massa (`Título; plataforma; formato`) e backups em JSON

## Instalar no iPhone
1. Abrir `https://pn1990.github.io/games-setlist/` no Safari
2. Partilhar → **Adicionar ao ecrã principal**

## Estrutura
- `index.html`, `styles.css`, `app.js` — a app
- `cloud.js` — login e sincronização (REST do Supabase, sem dependências)
- `sw.js` — offline e cache das capas
- `supabase/functions/setlist-prices` — edge function: preços da eShop PT e wishlists do Deku Deals
- `supabase/functions/setlist-covers` — edge function: capas oficiais da Nintendo Europa (Switch, Switch 2, 3DS)
- `supabase/functions/setlist-ean` — edge function: código de barras → nome do jogo (UPCitemdb / Open Products Facts, com cache)
- `vendor/zxing.min.js` — leitor de códigos de barras (ZXing, Apache 2.0)
- `supabase/migrations` — tabelas `setlist_games` / `setlist_prices` (RLS) e cron diário
