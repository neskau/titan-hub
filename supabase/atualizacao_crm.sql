-- Titan Hub: atualização do CRM (0005 + 0006). Rodar UMA vez no SQL Editor de um banco que já tem a instalação inicial.


-- ===================== supabase/migrations/0005_crm.sql =====================

-- Titan Hub — Fase 2: CRM de vendas
-- Rodar depois da 0004. Regras de negócio:
--   * Vendedora vê e trabalha só a PRÓPRIA carteira (empresas com vendedora_id = ela).
--   * Gestor/admin veem tudo, distribuem carteiras e definem metas.
--   * Integradores entram por cadastro no site (vira oportunidade "Novo cadastro" para o gestor
--     distribuir) ou pela vendedora, que cria a conta e já vincula à carteira dela.

-- ============ Funções auxiliares ============
create or replace function eh_gestor() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(meu_papel() in ('gestor','admin'), false)
$$;

-- A empresa está na carteira de quem chama? (gestor/admin: todas)
create or replace function empresa_na_carteira(p_empresa uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select eh_gestor() or (eh_equipe() and exists (
    select 1 from empresas where id = p_empresa and vendedora_id = auth.uid()))
$$;

-- ============ Visibilidade por carteira nas tabelas existentes ============
drop policy if exists empresas_propria on empresas;
drop policy if exists empresas_equipe on empresas;
create policy empresas_leitura on empresas for select
  using (id = minha_empresa() or eh_gestor() or (eh_equipe() and vendedora_id = auth.uid()));
-- Vendedora edita só a própria carteira e não consegue "passar" a empresa para outra pessoa.
create policy empresas_edicao on empresas for update
  using (eh_gestor() or (eh_equipe() and vendedora_id = auth.uid()))
  with check (eh_gestor() or (eh_equipe() and vendedora_id = auth.uid()));

drop policy if exists pedidos_leitura on pedidos;
drop policy if exists pedidos_equipe on pedidos;
create policy pedidos_leitura on pedidos for select
  using (empresa_id = minha_empresa() or empresa_na_carteira(empresa_id));
create policy pedidos_edicao on pedidos for update
  using (empresa_na_carteira(empresa_id)) with check (empresa_na_carteira(empresa_id));

drop policy if exists itens_leitura on pedido_itens;
create policy itens_leitura on pedido_itens for select using (
  exists (select 1 from pedidos p where p.id = pedido_id
          and (p.empresa_id = minha_empresa() or empresa_na_carteira(p.empresa_id))));

-- Perfis: vendedora vê a equipe e os usuários das empresas da carteira dela.
drop policy if exists perfis_proprio on perfis;
create policy perfis_proprio on perfis for select using (
  id = auth.uid() or eh_gestor()
  or (eh_equipe() and (papel <> 'integrador' or (empresa_id is not null and empresa_na_carteira(empresa_id)))));

-- Cancelamento: só pedidos da própria carteira (gestor: todos).
create or replace function cancelar_pedido(p_pedido uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status status_pedido;
  v_cd text;
  v_empresa uuid;
  v_item record;
begin
  if not eh_equipe() then raise exception 'Sem permissão'; end if;
  select status, cd_id, empresa_id into v_status, v_cd, v_empresa from pedidos where id = p_pedido for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if not empresa_na_carteira(v_empresa) then raise exception 'Este pedido não é da sua carteira'; end if;
  if v_status = 'cancelado' then raise exception 'Este pedido já está cancelado'; end if;
  if v_status = 'entregue' then raise exception 'Pedido já entregue não pode ser cancelado'; end if;

  for v_item in select produto_id, quantidade from pedido_itens where pedido_id = p_pedido order by produto_id loop
    insert into estoque (produto_id, cd_id, quantidade) values (v_item.produto_id, v_cd, v_item.quantidade)
      on conflict (produto_id, cd_id) do update
      set quantidade = estoque.quantidade + excluded.quantidade, atualizado_em = now();
    insert into movimentos_estoque (produto_id, cd_id, delta, motivo, referencia, usuario_id)
    values (v_item.produto_id, v_cd, v_item.quantidade, 'cancelamento', p_pedido::text, auth.uid());
  end loop;

  perform set_config('titan.pedido_interno', p_pedido::text, true);
  update pedidos set status = 'cancelado', atualizado_em = now() where id = p_pedido;
  perform set_config('titan.pedido_interno', '', true);
end $$;
revoke all on function cancelar_pedido(uuid) from public, anon;
grant execute on function cancelar_pedido(uuid) to authenticated;

-- ============ Tabelas do CRM ============
do $$ begin
  create type etapa_oportunidade as enum ('novo','contato','orcamento','negociacao','ganho','perdido');
exception when duplicate_object then null; end $$;

create table if not exists oportunidades (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (length(titulo) between 2 and 160),
  empresa_id uuid references empresas(id) on delete set null,
  -- dados do prospect (quando ainda não é integrador cadastrado)
  contato_nome text,
  contato_telefone text,
  cidade text,
  uf text,
  cnpj text,
  vendedora_id uuid references perfis(id),        -- null = aguardando distribuição pelo gestor
  etapa etapa_oportunidade not null default 'novo',
  valor_estimado numeric(14,2) check (valor_estimado >= 0),
  kwp numeric(10,2) check (kwp >= 0),
  origem text not null default 'manual'
    check (origem in ('portal','manual','indicacao','instagram','whatsapp','feira','prospeccao','site','outro')),
  motivo_perda text,
  previsao_fechamento date,
  fechado_em timestamptz,
  criado_por uuid references perfis(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists oportunidades_vendedora_idx on oportunidades (vendedora_id, etapa);
create index if not exists oportunidades_empresa_idx on oportunidades (empresa_id);

create table if not exists atividades (
  id uuid primary key default gen_random_uuid(),
  oportunidade_id uuid references oportunidades(id) on delete cascade,
  empresa_id uuid references empresas(id) on delete cascade,
  tipo text not null check (tipo in ('nota','ligacao','whatsapp','email','visita','tarefa','sistema')),
  descricao text not null check (length(descricao) between 1 and 2000),
  -- tarefas: prazo, responsável e conclusão
  vencimento timestamptz,
  responsavel_id uuid references perfis(id),
  concluida boolean not null default false,
  concluida_em timestamptz,
  autor_id uuid references perfis(id),
  criado_em timestamptz not null default now(),
  check (oportunidade_id is not null or empresa_id is not null)
);
create index if not exists atividades_oport_idx on atividades (oportunidade_id, criado_em desc);
create index if not exists atividades_empresa_idx on atividades (empresa_id, criado_em desc);
create index if not exists atividades_tarefas_idx on atividades (responsavel_id, concluida, vencimento) where tipo = 'tarefa';

create table if not exists metas (
  vendedora_id uuid references perfis(id) on delete cascade,
  mes date not null check (extract(day from mes) = 1),   -- sempre o dia 1 do mês
  valor numeric(14,2) not null check (valor >= 0),
  atualizado_em timestamptz not null default now(),
  primary key (vendedora_id, mes)
);

-- ============ Regras de acesso do CRM ============
alter table oportunidades enable row level security;
alter table atividades enable row level security;
alter table metas enable row level security;

create or replace function oportunidade_visivel(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select eh_gestor() or (eh_equipe() and exists (
    select 1 from oportunidades where id = p_id and vendedora_id = auth.uid()))
$$;

drop policy if exists oport_leitura on oportunidades;
drop policy if exists oport_insercao on oportunidades;
drop policy if exists oport_edicao on oportunidades;
drop policy if exists oport_exclusao on oportunidades;
create policy oport_leitura on oportunidades for select
  using (eh_gestor() or (eh_equipe() and vendedora_id = auth.uid()));
create policy oport_insercao on oportunidades for insert
  with check (eh_gestor() or (eh_equipe() and vendedora_id = auth.uid()
              and (empresa_id is null or empresa_na_carteira(empresa_id))));
create policy oport_edicao on oportunidades for update
  using (eh_gestor() or (eh_equipe() and vendedora_id = auth.uid()))
  with check (eh_gestor() or (eh_equipe() and vendedora_id = auth.uid()
              and (empresa_id is null or empresa_na_carteira(empresa_id))));
create policy oport_exclusao on oportunidades for delete using (eh_gestor());

drop policy if exists ativ_leitura on atividades;
drop policy if exists ativ_insercao on atividades;
drop policy if exists ativ_edicao on atividades;
drop policy if exists ativ_exclusao on atividades;
create policy ativ_leitura on atividades for select using (
  eh_gestor() or (eh_equipe() and (
    responsavel_id = auth.uid()
    or (oportunidade_id is not null and oportunidade_visivel(oportunidade_id))
    or (empresa_id is not null and empresa_na_carteira(empresa_id)))));
create policy ativ_insercao on atividades for insert with check (
  eh_equipe() and tipo <> 'sistema' and autor_id = auth.uid()
  and (oportunidade_id is null or oportunidade_visivel(oportunidade_id))
  and (empresa_id is null or empresa_na_carteira(empresa_id))
  and (responsavel_id is null or responsavel_id = auth.uid() or eh_gestor()));
-- Editar: quem é responsável pela tarefa, quem escreveu, ou o gestor. Registros do sistema não mudam.
create policy ativ_edicao on atividades for update
  using (tipo <> 'sistema' and (eh_gestor() or (eh_equipe() and (responsavel_id = auth.uid() or autor_id = auth.uid()))))
  with check (tipo <> 'sistema' and (eh_gestor() or (eh_equipe() and (responsavel_id = auth.uid() or autor_id = auth.uid()))));
create policy ativ_exclusao on atividades for delete
  using (tipo <> 'sistema' and (eh_gestor() or (eh_equipe() and autor_id = auth.uid())));

drop policy if exists metas_leitura on metas;
drop policy if exists metas_gestao on metas;
create policy metas_leitura on metas for select using (eh_gestor() or (eh_equipe() and vendedora_id = auth.uid()));
create policy metas_gestao on metas for all using (eh_gestor()) with check (eh_gestor());

-- ============ Automação ============
-- Oportunidade: mantém datas e fecha/reabre de forma consistente.
create or replace function oportunidade_antes_gravar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.atualizado_em := now();
  if tg_op = 'INSERT' then new.criado_por := coalesce(new.criado_por, auth.uid()); end if;
  if new.etapa in ('ganho','perdido') then
    new.fechado_em := coalesce(new.fechado_em, now());
  else
    new.fechado_em := null; new.motivo_perda := null;
  end if;
  if new.etapa = 'perdido' and coalesce(trim(new.motivo_perda), '') = '' then
    raise exception 'Informe o motivo da perda';
  end if;
  -- vendedora não pode tirar a oportunidade dela nem passar para outra
  if tg_op = 'UPDATE' and auth.uid() is not null and not eh_gestor()
     and new.vendedora_id is distinct from old.vendedora_id then
    raise exception 'Só o gestor pode transferir oportunidades';
  end if;
  return new;
end $$;
drop trigger if exists ao_gravar_oportunidade on oportunidades;
create trigger ao_gravar_oportunidade before insert or update on oportunidades
  for each row execute function oportunidade_antes_gravar();

-- Registra a mudança de etapa na linha do tempo.
create or replace function oportunidade_depois_gravar() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_rot text[] := array['Novo lead','Primeiro contato','Orçamento enviado','Negociação','Ganho','Perdido'];
begin
  if tg_op = 'UPDATE' and new.etapa is distinct from old.etapa then
    insert into atividades (oportunidade_id, empresa_id, tipo, descricao, autor_id)
    values (new.id, new.empresa_id, 'sistema',
      'Etapa: ' || v_rot[array_position(enum_range(null::etapa_oportunidade), old.etapa)] || ' → '
                || v_rot[array_position(enum_range(null::etapa_oportunidade), new.etapa)]
                || case when new.etapa = 'perdido' then ' (' || new.motivo_perda || ')' else '' end,
      auth.uid());
  end if;
  return null;
end $$;
drop trigger if exists ao_mudar_etapa on oportunidades;
create trigger ao_mudar_etapa after update on oportunidades
  for each row execute function oportunidade_depois_gravar();

-- Cadastro feito pelo próprio integrador no site vira oportunidade para o gestor distribuir.
create or replace function empresa_nova_oportunidade() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.vendedora_id is null then
    insert into oportunidades (titulo, empresa_id, cidade, uf, cnpj, contato_telefone, etapa, origem)
    values ('Novo cadastro: ' || coalesce(new.nome_fantasia, new.razao_social), new.id,
            new.cidade, new.uf, new.cnpj, new.telefone, 'novo', 'portal');
  end if;
  return null;
end $$;
drop trigger if exists ao_cadastrar_empresa on empresas;
create trigger ao_cadastrar_empresa after insert on empresas
  for each row execute function empresa_nova_oportunidade();

-- Troca de vendedora da empresa leva junto as oportunidades abertas e as tarefas pendentes.
create or replace function empresa_trocar_vendedora() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.vendedora_id is distinct from old.vendedora_id then
    if auth.uid() is not null and not eh_gestor() then
      raise exception 'Só o gestor pode transferir a carteira';
    end if;
    update oportunidades set vendedora_id = new.vendedora_id
     where empresa_id = new.id and etapa not in ('ganho','perdido');
    update atividades set responsavel_id = new.vendedora_id
     where empresa_id = new.id and tipo = 'tarefa' and not concluida
       and (responsavel_id is null or responsavel_id = old.vendedora_id);
    insert into atividades (empresa_id, tipo, descricao, autor_id)
    values (new.id, 'sistema', 'Carteira: responsável alterado para ' ||
            coalesce((select nome from perfis where id = new.vendedora_id), 'ninguém'), auth.uid());
  end if;
  if new.status is distinct from old.status then
    insert into atividades (empresa_id, tipo, descricao, autor_id)
    values (new.id, 'sistema', 'Cadastro: ' || old.status || ' → ' || new.status, auth.uid());
  end if;
  return null;
end $$;
drop trigger if exists ao_trocar_vendedora on empresas;
create trigger ao_trocar_vendedora after update on empresas
  for each row execute function empresa_trocar_vendedora();

-- Pedido novo aparece na linha do tempo da empresa.
create or replace function pedido_na_linha_do_tempo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into atividades (empresa_id, tipo, descricao, autor_id)
  values (new.empresa_id, 'sistema', 'Pedido #' || new.numero || ' fechado no portal', new.usuario_id);
  return null;
end $$;
drop trigger if exists ao_criar_pedido on pedidos;
create trigger ao_criar_pedido after insert on pedidos
  for each row execute function pedido_na_linha_do_tempo();

-- ============ Vendedora cadastra o integrador e já vincula à carteira ============
-- Fluxo: o servidor cria a conta no Auth (convite por e-mail) e chama esta função como a vendedora.
-- p_usuario: id da conta do integrador (perfil 'integrador' ainda sem empresa).
-- Se o CNPJ já existir na carteira de quem chama, vincula o usuário à empresa existente.
create or replace function equipe_cadastrar_integrador(
  p_usuario uuid, p_cnpj text, p_razao text, p_fantasia text, p_cidade text, p_uf text,
  p_telefone text, p_segmento text, p_cd text default 'cascavel', p_vendedora uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_cnpj text := regexp_replace(coalesce(p_cnpj,''),'\D','','g');
  v_vend uuid;
  v_emp uuid;
  v_dono uuid;
begin
  if not eh_equipe() then raise exception 'Sem permissão'; end if;
  v_vend := case when eh_gestor() then coalesce(p_vendedora, auth.uid()) else auth.uid() end;
  if not exists (select 1 from perfis where id = v_vend and ativo and papel in ('vendedora','gestor','admin')) then
    raise exception 'Vendedora responsável inválida';
  end if;
  if not exists (select 1 from perfis where id = p_usuario and papel = 'integrador' and empresa_id is null) then
    raise exception 'Este e-mail já pertence a outra empresa ou a um membro da equipe';
  end if;
  if length(v_cnpj) <> 14 then raise exception 'CNPJ inválido'; end if;

  select id, vendedora_id into v_emp, v_dono from empresas where cnpj = v_cnpj;
  if v_emp is not null then
    if not (eh_gestor() or v_dono = auth.uid()) then
      raise exception 'Este CNPJ já está cadastrado na carteira de outra vendedora. Fale com o gestor.';
    end if;
  else
    if length(coalesce(p_razao,'')) not between 3 and 200 then raise exception 'Razão social inválida'; end if;
    insert into empresas (cnpj, razao_social, nome_fantasia, cidade, uf, telefone, segmento, status, vendedora_id, cd_padrao)
    values (v_cnpj, p_razao, left(p_fantasia,120), left(p_cidade,120), upper(left(p_uf,2)), left(p_telefone,20),
            p_segmento, 'aprovada', v_vend, coalesce(p_cd,'cascavel'))
    returning id into v_emp;
    insert into atividades (empresa_id, tipo, descricao, autor_id)
    values (v_emp, 'sistema', 'Cadastro criado pela equipe e aprovado', auth.uid());
  end if;

  update perfis set empresa_id = v_emp where id = p_usuario;
  insert into atividades (empresa_id, tipo, descricao, autor_id)
  values (v_emp, 'sistema', 'Acesso ao portal criado para ' || (select email from perfis where id = p_usuario), auth.uid());
  return v_emp;
end $$;
revoke all on function equipe_cadastrar_integrador(uuid, text, text, text, text, text, text, text, text, uuid) from public, anon;
grant execute on function equipe_cadastrar_integrador(uuid, text, text, text, text, text, text, text, text, uuid) to authenticated;

-- ============ Desempenho da equipe (metas x realizado) ============
-- Realizado = soma dos pedidos não cancelados das empresas da carteira, no mês.
create or replace function desempenho_equipe(p_mes date)
returns table (vendedora_id uuid, nome text, meta numeric, realizado numeric, pedidos bigint,
               oportunidades_abertas bigint, valor_em_aberto numeric, ganhos bigint)
language sql stable security definer set search_path = public as $$
  with m as (select date_trunc('month', p_mes)::date as ini,
                    (date_trunc('month', p_mes) + interval '1 month')::date as fim)
  select v.id, v.nome,
    coalesce((select valor from metas where metas.vendedora_id = v.id and mes = (select ini from m)), 0),
    coalesce((select sum(p.total) from pedidos p join empresas e on e.id = p.empresa_id
              where e.vendedora_id = v.id and p.status <> 'cancelado'
                and p.criado_em >= (select ini from m) and p.criado_em < (select fim from m)), 0),
    (select count(*) from pedidos p join empresas e on e.id = p.empresa_id
      where e.vendedora_id = v.id and p.status <> 'cancelado'
        and p.criado_em >= (select ini from m) and p.criado_em < (select fim from m)),
    (select count(*) from oportunidades o where o.vendedora_id = v.id and o.etapa not in ('ganho','perdido')),
    coalesce((select sum(o.valor_estimado) from oportunidades o where o.vendedora_id = v.id and o.etapa not in ('ganho','perdido')), 0),
    (select count(*) from oportunidades o where o.vendedora_id = v.id and o.etapa = 'ganho'
       and o.fechado_em >= (select ini from m) and o.fechado_em < (select fim from m))
  from perfis v
  where v.ativo and v.papel in ('vendedora','gestor','admin')
    and (eh_gestor() or v.id = auth.uid())
  order by v.nome
$$;
revoke all on function desempenho_equipe(date) from public, anon;
grant execute on function desempenho_equipe(date) to authenticated;


-- ===================== supabase/migrations/0006_ajustes_crm.sql =====================

-- Titan Hub — ajustes do CRM. Rodar depois da 0005 (pode rodar de novo sem problema).

-- Metas: gestor/admin só aparecem no desempenho se tiverem meta, vendas ou oportunidades abertas
-- (evita que o administrador apareça como "vendedor" com 0% e distorça o total da equipe).
create or replace function desempenho_equipe(p_mes date)
returns table (vendedora_id uuid, nome text, meta numeric, realizado numeric, pedidos bigint,
               oportunidades_abertas bigint, valor_em_aberto numeric, ganhos bigint)
language sql stable security definer set search_path = public as $$
  with m as (select date_trunc('month', p_mes)::date as ini,
                    (date_trunc('month', p_mes) + interval '1 month')::date as fim),
  base as (
    select v.id, v.nome, v.papel,
      coalesce((select valor from metas where metas.vendedora_id = v.id and mes = (select ini from m)), 0) as meta,
      coalesce((select sum(p.total) from pedidos p join empresas e on e.id = p.empresa_id
                where e.vendedora_id = v.id and p.status <> 'cancelado'
                  and p.criado_em >= (select ini from m) and p.criado_em < (select fim from m)), 0) as realizado,
      (select count(*) from pedidos p join empresas e on e.id = p.empresa_id
        where e.vendedora_id = v.id and p.status <> 'cancelado'
          and p.criado_em >= (select ini from m) and p.criado_em < (select fim from m)) as pedidos,
      (select count(*) from oportunidades o where o.vendedora_id = v.id and o.etapa not in ('ganho','perdido')) as abertas,
      coalesce((select sum(o.valor_estimado) from oportunidades o
                where o.vendedora_id = v.id and o.etapa not in ('ganho','perdido')), 0) as em_aberto,
      (select count(*) from oportunidades o where o.vendedora_id = v.id and o.etapa = 'ganho'
         and o.fechado_em >= (select ini from m) and o.fechado_em < (select fim from m)) as ganhos
    from perfis v
    where v.ativo and v.papel in ('vendedora','gestor','admin')
      and (eh_gestor() or v.id = auth.uid())
  )
  select id, nome, meta, realizado, pedidos, abertas, em_aberto, ganhos
  from base
  where papel = 'vendedora' or meta > 0 or realizado > 0 or abertas > 0 or id = auth.uid() and not eh_gestor()
  order by nome
$$;
revoke all on function desempenho_equipe(date) from public, anon;
grant execute on function desempenho_equipe(date) to authenticated;
