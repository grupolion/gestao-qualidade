-- Gestão da Qualidade · Lion Fitness — esquema Supabase
-- Execute inteiro no Supabase: SQL Editor → New query → colar → Run. Pode ser executado de novo sem perder dados.

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------ perfis (1 por usuário do Supabase Auth)
create table if not exists public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  login text unique not null,
  nome text not null default '',
  perfil text not null default 'usuario' check (perfil in ('admin', 'usuario')),
  ativo boolean not null default false,
  setores text[] not null default '{}'
);

-- ------------------------------------------------------------------ registros (RNC e ações): JSON + versão otimista
create table if not exists public.rnc (
  id text primary key,
  dados jsonb not null,
  versao int not null default 1,
  setor text generated always as (dados->>'setor_origem') stored,
  atualizado_em timestamptz not null default now()
);
create table if not exists public.acoes (
  id text primary key,
  dados jsonb not null,
  versao int not null default 1,
  rnc_id text generated always as (nullif(dados->>'rnc_id', '')) stored,
  onde text generated always as (dados->>'onde') stored,
  atualizado_em timestamptz not null default now()
);
create table if not exists public.fotos (
  id bigint generated always as identity primary key,
  rnc_id text not null references public.rnc(id) on delete cascade,
  nome text not null,
  conteudo text not null,              -- imagem como código-fonte (data URL base64)
  criado_em timestamptz not null default now()
);
create index if not exists fotos_rnc on public.fotos(rnc_id);
create table if not exists public.lixeira (
  id bigint generated always as identity primary key,
  colecao text not null,
  registro_id text not null,
  dados jsonb not null,
  fotos jsonb,
  excluido_por text,
  excluido_em timestamptz not null default now()
);
create table if not exists public.config (
  chave text primary key,              -- setores, setor_params, parametros, colaboradores, centros_custo, maquinas, pecas
  valor jsonb not null
);
create table if not exists public.contadores (
  prefixo text primary key,            -- ex.: RNC-2026
  ultimo int not null default 0
);
-- ficha técnica já agregada por produto (importada pelo admin a partir de view_ficha_tecnica.txt)
create table if not exists public.ficha_produtos (
  codigo text primary key,
  nome text, valor numeric, familia text, grupo text,
  partes jsonb not null default '{}'
);

-- ------------------------------------------------------------------ funções auxiliares
create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from perfis where id = auth.uid() and ativo and perfil = 'admin')
$$;
create or replace function public.eh_ativo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from perfis where id = auth.uid() and ativo)
$$;
create or replace function public.meus_setores() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce((select setores from perfis where id = auth.uid() and ativo), '{}')
$$;
create or replace function public.rnc_visivel(rid text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.eh_admin() or exists(select 1 from rnc where id = rid and setor = any(public.meus_setores()))
$$;

-- novo usuário do Auth → perfil (inativo; o admin ativa). O login gestor_qualidade nasce admin ativo.
create or replace function public.novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare lg text := lower(split_part(new.email, '@', 1));
begin
  insert into perfis(id, login, nome, perfil, ativo)
  values (new.id, lg,
          case when lg = 'gestor_qualidade' then 'Gestor da Qualidade' else lg end,
          case when lg = 'gestor_qualidade' then 'admin' else 'usuario' end,
          lg = 'gestor_qualidade')
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.novo_usuario();

-- próximo ID sequencial (RNC-AAAA-NNNN / AC-AAAA-NNNN) com trava de linha
create or replace function public.proximo_id(tipo text) returns text
language plpgsql security definer set search_path = public as $$
declare pre text; n int;
begin
  if not public.eh_ativo() then raise exception 'Usuário inativo'; end if;
  pre := (case when tipo = 'rnc' then 'RNC' else 'AC' end) || '-' || to_char(now(), 'YYYY');
  insert into contadores(prefixo, ultimo) values (pre, 0) on conflict do nothing;
  if tipo = 'rnc' then
    select greatest(c.ultimo, coalesce(max(split_part(r.id, '-', 3)::int), 0)) into n
      from contadores c left join rnc r on r.id like pre || '-%' where c.prefixo = pre group by c.ultimo;
  else
    select greatest(c.ultimo, coalesce(max(split_part(a.id, '-', 3)::int), 0)) into n
      from contadores c left join acoes a on a.id like pre || '-%' where c.prefixo = pre group by c.ultimo;
  end if;
  update contadores set ultimo = n + 1 where prefixo = pre;
  return pre || '-' || lpad((n + 1)::text, 4, '0');
end $$;

-- admin: definir senha de outro usuário / excluir usuário
create or replace function public.admin_definir_senha(uid uuid, senha text) returns void
language plpgsql security definer set search_path = public, auth, extensions as $$
begin
  if not public.eh_admin() then raise exception 'Somente administrador'; end if;
  if length(senha) < 4 then raise exception 'A senha deve ter ao menos 4 caracteres'; end if;
  update auth.users set encrypted_password = crypt(senha, gen_salt('bf')), updated_at = now() where id = uid;
end $$;
create or replace function public.admin_excluir_usuario(uid uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.eh_admin() then raise exception 'Somente administrador'; end if;
  if uid = auth.uid() then raise exception 'Você não pode excluir o próprio usuário'; end if;
  delete from auth.users where id = uid;
end $$;

-- ------------------------------------------------------------------ RLS
alter table perfis enable row level security;
alter table rnc enable row level security;
alter table acoes enable row level security;
alter table fotos enable row level security;
alter table lixeira enable row level security;
alter table config enable row level security;
alter table contadores enable row level security;
alter table ficha_produtos enable row level security;

drop policy if exists perfis_sel on perfis;
create policy perfis_sel on perfis for select to authenticated using (id = auth.uid() or public.eh_ativo());
drop policy if exists perfis_upd on perfis;
create policy perfis_upd on perfis for update to authenticated using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists rnc_all on rnc;
create policy rnc_all on rnc for all to authenticated
  using (public.eh_admin() or setor = any(public.meus_setores()))
  with check (public.eh_admin() or setor = any(public.meus_setores()));

drop policy if exists acoes_all on acoes;
create policy acoes_all on acoes for all to authenticated
  using (public.eh_admin() or (rnc_id is not null and public.rnc_visivel(rnc_id))
         or (rnc_id is null and onde = any(public.meus_setores())))
  with check (public.eh_admin() or (rnc_id is not null and public.rnc_visivel(rnc_id))
         or (rnc_id is null and onde = any(public.meus_setores())));

drop policy if exists fotos_all on fotos;
create policy fotos_all on fotos for all to authenticated
  using (public.rnc_visivel(rnc_id)) with check (public.rnc_visivel(rnc_id));

drop policy if exists lixeira_ins on lixeira;
create policy lixeira_ins on lixeira for insert to authenticated with check (public.eh_ativo());
drop policy if exists lixeira_sel on lixeira;
create policy lixeira_sel on lixeira for select to authenticated using (public.eh_admin());

drop policy if exists config_sel on config;
create policy config_sel on config for select to authenticated using (public.eh_ativo());
drop policy if exists config_w on config;
create policy config_w on config for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists ficha_sel on ficha_produtos;
create policy ficha_sel on ficha_produtos for select to authenticated using (public.eh_ativo());
drop policy if exists ficha_w on ficha_produtos;
create policy ficha_w on ficha_produtos for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

-- ------------------------------------------------------------------ configuração padrão
insert into config(chave, valor) values
  ('setores', '{}'), ('setor_params', '{}'),
  ('parametros', '{"custo_hora_padrao": 60.0, "refresh_segundos": 30}'),
  ('colaboradores', '[]'), ('centros_custo', '[]'), ('maquinas', '[]'), ('pecas', '[]')
on conflict (chave) do nothing;
