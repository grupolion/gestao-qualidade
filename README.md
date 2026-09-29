# Gestão da Qualidade — versão web (GitHub Pages + Supabase)

## 1. Supabase (uma vez)
1. Crie um projeto em supabase.com.
2. SQL Editor → execute `supabase/schema.sql` e depois `supabase/seed.sql` (setores, metas, colaboradores etc. do app antigo).
3. Authentication → Sign In / Providers → Email: **desative "Confirm email"**.
4. Authentication → Users → *Add user*: e-mail `gestor_qualidade@gq.local` + senha (vira o administrador).
5. Project Settings → API: copie *Project URL* e *anon key* para `js/config.js`.

## 2. GitHub Pages
Envie o conteúdo desta pasta `web/` para um repositório (pode ser privado no plano pago; público no gratuito —
nenhum dado fica no repositório, só no Supabase). Settings → Pages → Deploy from branch → `main` / root.

## 3. Primeiro acesso
Entre como `gestor_qualidade` → ⚙️ Administração:
- **Ficha técnica**: envie `view_ficha_tecnica.txt`.
- **Usuários**: crie os logins e marque os setores de cada um.

Login no app = login simples (ex.: `joao.silva`); internamente vira `joao.silva@gq.local`.
Fotos são reduzidas (máx. 1600 px, JPEG) e gravadas no banco.
Para rodar localmente: `python -m http.server` nesta pasta e abra http://localhost:8000.
