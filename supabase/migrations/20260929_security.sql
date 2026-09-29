-- Based on schema.sql + seguranca.sql recovered from app-v2-web.rar.
-- Apply to a staging copy first, then BEFORE publishing the matching frontend.
-- Atomic, no application data is deleted by this migration.
begin;

-- Public registration never grants administrator privileges based on a name.
create or replace function public.novo_usuario() returns trigger
language plpgsql security definer set search_path = '' as $$
declare lg text := lower(split_part(new.email, '@', 1));
begin
  insert into public.perfis(id, login, nome, perfil, ativo)
  values(new.id, lg, lg, 'usuario', false) on conflict(id) do nothing;
  return new;
end $$;

-- Remove direct destructive operations, including the former all-purpose RLS policies.
revoke delete, truncate on public.rnc, public.acoes from authenticated, anon;
revoke insert, delete, truncate on public.lixeira from authenticated, anon;
drop policy if exists rnc_all on public.rnc;
drop policy if exists acoes_all on public.acoes;
drop policy if exists lixeira_ins on public.lixeira;
drop policy if exists rnc_read on public.rnc;
drop policy if exists rnc_insert on public.rnc;
drop policy if exists rnc_update on public.rnc;
create policy rnc_read on public.rnc for select to authenticated
 using(public.eh_ativo() and public.rnc_visivel(id));
create policy rnc_insert on public.rnc for insert to authenticated
 with check(public.eh_ativo() and (public.eh_admin() or setor = any(public.meus_setores())));
create policy rnc_update on public.rnc for update to authenticated
 using(public.eh_ativo() and public.rnc_visivel(id))
 with check(public.eh_ativo() and (public.eh_admin() or setor = any(public.meus_setores())));
drop policy if exists acoes_read on public.acoes;
drop policy if exists acoes_insert on public.acoes;
drop policy if exists acoes_update on public.acoes;
create policy acoes_read on public.acoes for select to authenticated
 using(public.eh_ativo() and (public.eh_admin() or
 (rnc_id is not null and public.rnc_visivel(rnc_id)) or
 (rnc_id is null and onde = any(public.meus_setores()))));
create policy acoes_insert on public.acoes for insert to authenticated
 with check(public.eh_ativo() and (public.eh_admin() or
 (rnc_id is not null and public.rnc_visivel(rnc_id)) or
 (rnc_id is null and onde = any(public.meus_setores()))));
create policy acoes_update on public.acoes for update to authenticated
 using(public.eh_ativo() and (public.eh_admin() or
 (rnc_id is not null and public.rnc_visivel(rnc_id)) or
 (rnc_id is null and onde = any(public.meus_setores()))))
 with check(public.eh_ativo() and (public.eh_admin() or
 (rnc_id is not null and public.rnc_visivel(rnc_id)) or
 (rnc_id is null and onde = any(public.meus_setores()))));

drop policy if exists chu_sel on public.chaves_usuario;
drop policy if exists chu_upd on public.chaves_usuario;
create policy chu_sel on public.chaves_usuario for select to authenticated
 using(public.eh_ativo() and (user_id = auth.uid() or public.eh_admin()));
create policy chu_upd on public.chaves_usuario for update to authenticated
 using(public.eh_ativo() and (user_id = auth.uid() or public.eh_admin()))
 with check(public.eh_ativo() and (user_id = auth.uid() or public.eh_admin()));

-- NOT VALID preserves legacy rows but protects every new/updated photo.
alter table public.fotos drop constraint if exists fotos_raster_segura;
alter table public.fotos add constraint fotos_raster_segura check
 (length(conteudo) <= 12582912 and conteudo ~ '^data:image/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$') not valid;

create or replace function public.tem_sensivel(d jsonb) returns boolean
language sql immutable set search_path = '' as $$
 select exists(select 1 from jsonb_object_keys(d) k where k ~ '^(custo|horas_|pecas_subst|valor)')
$$;

-- Audit ownership and workflow rules cannot be supplied by browser state.
create or replace function public.proteger_registro() returns trigger
language plpgsql security definer set search_path = '' as $$
declare ator text; evento jsonb; hist jsonb; anterior text; destino text;
begin
  if not public.eh_ativo() then raise exception 'Usuário inativo'; end if;
  select login into ator from public.perfis where id = auth.uid();
  destino := new.dados->>'status';
  if tg_op = 'UPDATE' then
    if new.id <> old.id then raise exception 'O identificador é imutável'; end if;
    anterior := old.dados->>'status';
    if new.versao <> old.versao + 1 then raise exception 'Versão inválida'; end if;
    hist := coalesce(old.dados->'historico', '[]'::jsonb);
    new.dados := new.dados || jsonb_build_object('criado_em',old.dados->'criado_em','criado_por',old.dados->'criado_por');
  else
    if new.versao <> 1 then raise exception 'Versão inicial inválida'; end if;
    hist := '[]'::jsonb;
    new.dados := new.dados || jsonb_build_object('criado_em',now(),'criado_por',ator);
  end if;
  if tg_table_name = 'rnc' then
    if not public.eh_admin() and (destino in ('Finalizada','Cancelada') or anterior in ('Finalizada','Cancelada','Fechada','Encerrada')) then
      raise exception 'Somente o administrador altera registros encerrados';
    end if;
    if destino = 'Finalizada' and (tg_op='INSERT' or anterior is distinct from destino or new.dados->>'eficaz' is distinct from old.dados->>'eficaz') then
      if new.dados->>'eficaz' is distinct from 'Sim' then raise exception 'Verifique a eficácia'; end if;
      if exists(select 1 from public.acoes where rnc_id = new.id and coalesce(dados->>'status','') not in ('Concluída','Cancelada')) then
        raise exception 'Existem tarefas abertas';
      end if;
    end if;
  else
    -- Lock the parent: serializes task changes against finalization.
    if nullif(new.dados->>'rnc_id','') is not null then
      perform 1 from public.rnc where id = new.dados->>'rnc_id' for update;
      if not found then raise exception 'RNC inexistente'; end if;
      if exists(select 1 from public.rnc where id = new.dados->>'rnc_id' and dados->>'status' in ('Finalizada','Cancelada'))
         and (not public.eh_admin() or tg_op='INSERT' or (new.dados - '_c' - array(select k from jsonb_object_keys(new.dados) k where k ~ '^(custo|horas_|pecas_subst|valor)'))
           is distinct from (old.dados - '_c' - array(select k from jsonb_object_keys(old.dados) k where k ~ '^(custo|horas_|pecas_subst|valor)'))) then
        raise exception 'Reabra a RNC antes de alterar suas ações';
      end if;
    end if;
  end if;
  if public.cripto_ativa() and public.tem_sensivel(new.dados) then raise exception 'Campos sensíveis devem ser cifrados'; end if;
  evento := jsonb_build_object('em',now(),'por',ator,'acao',case when tg_op='INSERT' then 'criado' when anterior is distinct from destino then 'status' else 'alterado' end);
  if tg_op='UPDATE' and anterior is distinct from destino then evento := evento || jsonb_build_object('de',anterior,'para',destino); end if;
  new.dados := new.dados || jsonb_build_object('id',new.id,'historico',hist || jsonb_build_array(evento),'alterado_por',ator,'alterado_em',now());
  new.atualizado_em := now();
  return new;
end $$;
drop trigger if exists proteger_registro on public.rnc;
create trigger proteger_registro before insert or update on public.rnc for each row execute function public.proteger_registro();
drop trigger if exists proteger_registro on public.acoes;
create trigger proteger_registro before insert or update on public.acoes for each row execute function public.proteger_registro();

-- Internal verifier. No API grants: clients call only the specific operations below.
create or replace function public.exigir_senha(atual text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare h text;
begin
  if not public.eh_ativo() or atual is null then raise exception 'Credenciais inválidas'; end if;
  select encrypted_password into h from auth.users where id=auth.uid();
  if h is null or h='' or crypt(atual,h) is distinct from h then raise exception 'Credenciais inválidas'; end if;
end $$;

create or replace function public.atualizar_senha_chave(uid uuid, senha text, chave jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if senha is null or length(senha)<12 or octet_length(senha)>72 then raise exception 'Use 12 ou mais caracteres e no máximo 72 bytes'; end if;
  if public.cripto_ativa() then
    if chave is null or coalesce(chave->>'salt','')='' or coalesce(chave->>'iv','')='' or coalesce(chave->>'wrapped','')='' or coalesce((chave->>'iter')::int,0)<600000 then raise exception 'Chave cifrada obrigatória'; end if;
    insert into public.chaves_usuario(user_id,salt,iv,wrapped,iter) values(uid,chave->>'salt',chave->>'iv',chave->>'wrapped',(chave->>'iter')::int)
    on conflict(user_id) do update set salt=excluded.salt,iv=excluded.iv,wrapped=excluded.wrapped,iter=excluded.iter,atualizado_em=now();
  end if;
  update auth.users set encrypted_password=crypt(senha,gen_salt('bf',12)),updated_at=now() where id=uid;
  if not found then raise exception 'Usuário inexistente'; end if;
  delete from auth.sessions where user_id=uid;
end $$;
create or replace function public.trocar_senha_segura(atual text,nova text,chave jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_senha(atual);
  perform public.atualizar_senha_chave(auth.uid(),nova,chave);
end $$;
create or replace function public.admin_definir_senha_segura(uid uuid,senha text,chave jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.eh_admin() then raise exception 'Somente administrador'; end if;
  perform public.atualizar_senha_chave(uid,senha,chave);
end $$;
revoke execute on function public.admin_definir_senha(uuid,text) from public,anon,authenticated;

create or replace function public.excluir_registro_seguro(colecao text,registro text) returns void
language plpgsql security definer set search_path = '' as $$
declare r record; ator text;
begin
  if not public.eh_ativo() then raise exception 'Usuário inativo'; end if;
  select login into ator from public.perfis where id=auth.uid();
  if colecao='rnc' then
    if not public.eh_admin() then raise exception 'Somente administrador'; end if;
    select * into r from public.rnc where id=registro for update;
    if not found then return; end if;
    insert into public.lixeira(colecao,registro_id,dados,fotos,excluido_por)
    values('rnc',r.id,r.dados,(select jsonb_agg(jsonb_build_object('nome',nome,'conteudo',conteudo)) from public.fotos where rnc_id=registro),ator);
    insert into public.lixeira(colecao,registro_id,dados,excluido_por)
    select 'acoes',id,dados,ator from public.acoes where rnc_id=registro;
    delete from public.acoes where rnc_id=registro;
    delete from public.rnc where id=registro;
  elsif colecao='acoes' then
    select * into r from public.acoes where id=registro for update;
    if not found then return; end if;
    if not(public.eh_admin() or (r.rnc_id is not null and public.rnc_visivel(r.rnc_id)) or (r.rnc_id is null and r.onde=any(public.meus_setores()))) then raise exception 'Acesso negado'; end if;
    if not public.eh_admin() and exists(select 1 from public.rnc where id=r.rnc_id and dados->>'status' in ('Finalizada','Cancelada')) then raise exception 'RNC encerrada'; end if;
    insert into public.lixeira(colecao,registro_id,dados,excluido_por) values('acoes',r.id,r.dados,ator);
    delete from public.acoes where id=registro;
  else raise exception 'Coleção inválida'; end if;
end $$;
create or replace function public.admin_apagar_dados(senha_atual text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.eh_admin() then raise exception 'Somente administrador'; end if;
  perform public.exigir_senha(senha_atual);
  lock table public.rnc,public.acoes,public.fotos in exclusive mode;
  delete from public.acoes;
  delete from public.rnc;
end $$;

-- Atomic initial envelopes: a dropped connection cannot strand a master key.
create or replace function public.preparar_criptografia(mestra jsonb,usuario jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.eh_admin() then raise exception 'Somente administrador'; end if;
  insert into public.chaves(id,salt,iv,wrapped,iter) values('mestra',mestra->>'salt',mestra->>'iv',mestra->>'wrapped',(mestra->>'iter')::int);
  insert into public.chaves_usuario(user_id,salt,iv,wrapped,iter) values(auth.uid(),usuario->>'salt',usuario->>'iv',usuario->>'wrapped',(usuario->>'iter')::int)
  on conflict(user_id) do update set salt=excluded.salt,iv=excluded.iv,wrapped=excluded.wrapped,iter=excluded.iter,atualizado_em=now();
end $$;

create or replace function public.cripto_pendente() returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.eh_admin() then raise exception 'Somente administrador'; end if;
  return not public.cripto_ativa()
    or exists(select 1 from public.rnc where public.tem_sensivel(dados))
    or exists(select 1 from public.acoes where public.tem_sensivel(dados))
    or exists(select 1 from public.lixeira where public.tem_sensivel(dados))
    or exists(select 1 from public.config where chave in ('setor_params','maquinas','pecas','parametros') and coalesce(valor->>'_c','') not like 'enc:v1:%')
    or exists(select 1 from public.ficha_produtos where coalesce(partes->>'_c','') not like 'enc:v1:%');
end $$;

create or replace function public.migrar_cifra(tabela text,original jsonb,novo jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare atual jsonb; pk text; ident text;
begin
  if not public.eh_admin() or not public.cripto_ativa() then raise exception 'Acesso negado'; end if;
  if tabela not in ('config','rnc','acoes','lixeira','ficha_produtos') then raise exception 'Tabela inválida'; end if;
  pk := case tabela when 'config' then 'chave' when 'ficha_produtos' then 'codigo' else 'id' end;
  ident := original->>pk;
  execute format('select to_jsonb(t) from public.%I t where %I::text=$1 for update',tabela,pk) into atual using ident;
  if atual is distinct from original then raise exception 'Registro alterado; retome a migração'; end if;
  if novo->>pk is distinct from ident then raise exception 'Identificador inválido'; end if;
  if tabela='config' then
    if ident not in ('setor_params','maquinas','pecas','parametros') then raise exception 'Configuração inválida'; end if;
    update public.config set valor=novo->'valor' where chave=ident;
  elsif tabela='ficha_produtos' then
    update public.ficha_produtos set nome='',valor=null,familia=null,grupo=null,partes=novo->'partes' where codigo=ident;
  elsif tabela='lixeira' then
    update public.lixeira set dados=novo->'dados' where id=ident::bigint;
  else
    execute format('update public.%I set dados=$1,versao=versao+1 where id=$2',tabela) using novo->'dados',ident;
  end if;
end $$;

-- Reject writes from old tabs that still think encryption is disabled.
create or replace function public.proteger_cifra() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.cripto_ativa() then
    if tg_table_name='config' then
      if new.chave in ('setor_params','maquinas','pecas','parametros') and coalesce(new.valor->>'_c','') not like 'enc:v1:%' then raise exception 'Configuração deve ser cifrada'; end if;
    elsif tg_table_name='ficha_produtos' then
      if coalesce(new.partes->>'_c','') not like 'enc:v1:%' or nullif(new.nome,'') is not null or new.valor is not null or new.familia is not null or new.grupo is not null then raise exception 'Ficha deve ser cifrada'; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists proteger_cifra on public.config;
create trigger proteger_cifra before insert or update on public.config for each row execute function public.proteger_cifra();
drop trigger if exists proteger_cifra on public.ficha_produtos;
create trigger proteger_cifra before insert or update on public.ficha_produtos for each row execute function public.proteger_cifra();

-- Explicit grants; never expose SECURITY DEFINER helpers by default.
revoke all on function public.novo_usuario(),public.tem_sensivel(jsonb),public.proteger_registro(),public.exigir_senha(text),public.atualizar_senha_chave(uuid,text,jsonb),public.proteger_cifra() from public,anon,authenticated;
revoke all on function public.trocar_senha_segura(text,text,jsonb),public.admin_definir_senha_segura(uuid,text,jsonb),public.excluir_registro_seguro(text,text),public.admin_apagar_dados(text),public.preparar_criptografia(jsonb,jsonb),public.cripto_pendente(),public.migrar_cifra(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.trocar_senha_segura(text,text,jsonb),public.admin_definir_senha_segura(uuid,text,jsonb),public.excluir_registro_seguro(text,text),public.admin_apagar_dados(text),public.preparar_criptografia(jsonb,jsonb),public.cripto_pendente(),public.migrar_cifra(text,jsonb,jsonb) to authenticated;
commit;
