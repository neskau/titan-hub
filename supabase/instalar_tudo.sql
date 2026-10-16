-- Titan Hub: instalação completa do banco (0001 a 0004 + dados iniciais).
-- Rodar UMA vez num projeto Supabase novo: SQL Editor > colar tudo > Run.


-- ===================== supabase/migrations/0001_schema.sql =====================

-- Titan Hub — esquema inicial (Fase 1)
-- Rodar no Supabase: SQL Editor > colar este arquivo > Run.

create extension if not exists "pgcrypto";

-- ---------- Tipos ----------
create type papel as enum ('integrador', 'vendedora', 'gestor', 'admin');
create type status_empresa as enum ('pendente', 'aprovada', 'recusada', 'bloqueada');
create type status_pedido as enum ('recebido', 'faturado', 'separacao', 'em_transporte', 'entregue', 'cancelado');
create type forma_pagamento as enum ('pix', 'boleto_faturado', 'cartao');

-- ---------- Centros de distribuição ----------
create table cds (
  id text primary key,                 -- 'cascavel', 'piracicaba'
  nome text not null,
  uf text not null,
  matriz boolean not null default false,
  prazo_entrega text not null default '1 dia útil',
  fator_preco numeric(6,4) not null default 1.0000,  -- multiplica o preço base
  ativo boolean not null default true
);

-- ---------- Empresas integradoras ----------
create table empresas (
  id uuid primary key default gen_random_uuid(),
  cnpj text not null unique,
  razao_social text not null,
  nome_fantasia text,
  cidade text,
  uf text,
  telefone text,
  segmento text check (segmento in ('Residencial','Agro','Comercial e industrial')),
  status status_empresa not null default 'pendente',
  vendedora_id uuid,                   -- perfis.id da vendedora responsável
  cd_padrao text references cds(id) default 'cascavel',
  tabela_preco text not null default 'padrao',
  pode_boleto boolean not null default false,
  bling_contato_id bigint,
  criado_em timestamptz not null default now()
);

-- ---------- Perfis de usuário (1:1 com auth.users) ----------
create table perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null,
  telefone text,
  papel papel not null default 'integrador',
  empresa_id uuid references empresas(id),   -- só para integradores
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
alter table empresas add constraint empresas_vendedora_fk foreign key (vendedora_id) references perfis(id);

-- ---------- Produtos ----------
create table produtos (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  nome text not null,
  marca text not null,
  categoria text not null check (categoria in ('Módulos','Inversores','Microinversores','Estruturas','Elétrica','Baterias')),
  especificacao text,
  potencia_w integer,            -- módulos
  potencia_kw numeric(8,2),      -- inversores
  fase text check (fase in ('mono','tri')),
  modulos_por_estrutura integer, -- estruturas
  tipo_telhado text check (tipo_telhado in ('ceramica','metalica','fibrocimento','solo','laje')),
  unidade text not null default 'un',
  datasheet_path text,           -- caminho no Storage (bucket 'datasheets')
  imagem_path text,
  ativo boolean not null default true,
  bling_produto_id bigint,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ---------- Preços (tabela separada: visitante não lê preço) ----------
create table precos (
  produto_id uuid primary key references produtos(id) on delete cascade,
  preco_base numeric(12,2) not null check (preco_base >= 0),
  atualizado_em timestamptz not null default now()
);

-- ---------- Estoque por CD ----------
create table estoque (
  produto_id uuid references produtos(id) on delete cascade,
  cd_id text references cds(id),
  quantidade integer not null default 0 check (quantidade >= 0),
  minimo integer not null default 0 check (minimo >= 0),
  atualizado_em timestamptz not null default now(),
  primary key (produto_id, cd_id)
);

create table movimentos_estoque (
  id bigserial primary key,
  produto_id uuid not null references produtos(id),
  cd_id text not null references cds(id),
  delta integer not null,
  motivo text not null check (motivo in ('ajuste','transferencia','pedido','cancelamento','entrada','sync_bling')),
  referencia text,
  usuario_id uuid references perfis(id),
  criado_em timestamptz not null default now()
);

-- ---------- Pedidos ----------
create table pedidos (
  id uuid primary key default gen_random_uuid(),
  numero bigserial unique,
  empresa_id uuid not null references empresas(id),
  usuario_id uuid not null references perfis(id),
  cd_id text not null references cds(id),
  status status_pedido not null default 'recebido',
  pagamento forma_pagamento not null,
  subtotal numeric(12,2) not null,
  frete numeric(12,2) not null default 0,
  total numeric(12,2) not null,
  cep_entrega text,
  observacao text,
  rastreio text,
  nota_fiscal text,
  bling_pedido_id bigint,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table pedido_itens (
  pedido_id uuid references pedidos(id) on delete cascade,
  produto_id uuid references produtos(id),
  quantidade integer not null check (quantidade > 0),
  preco_unitario numeric(12,2) not null,
  primary key (pedido_id, produto_id)
);

-- ---------- Funções auxiliares ----------
create or replace function meu_papel() returns papel
language sql stable security definer set search_path = public as $$
  select papel from perfis where id = auth.uid()
$$;

create or replace function minha_empresa() returns uuid
language sql stable security definer set search_path = public as $$
  select empresa_id from perfis where id = auth.uid()
$$;

create or replace function eh_equipe() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select papel in ('vendedora','gestor','admin') from perfis where id = auth.uid()), false)
$$;

create or replace function empresa_aprovada() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select e.status = 'aprovada' from perfis p join empresas e on e.id = p.empresa_id where p.id = auth.uid()), false)
$$;

-- Preço que o usuário logado vê para um produto num CD
create or replace function preco_no_cd(p_produto uuid, p_cd text) returns numeric
language sql stable security definer set search_path = public as $$
  select round(pr.preco_base * c.fator_preco, 2)
  from precos pr, cds c where pr.produto_id = p_produto and c.id = p_cd
$$;

-- Cria o pedido de forma atômica: confere estoque, baixa saldo e grava itens.
-- p_itens: [{"produto_id": "...", "quantidade": 3}, ...]
create or replace function criar_pedido(p_cd text, p_pagamento forma_pagamento, p_itens jsonb, p_cep text, p_obs text, p_frete numeric)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_empresa uuid := minha_empresa();
  v_pedido uuid;
  v_sub numeric := 0;
  v_item jsonb;
  v_qtd int;
  v_preco numeric;
  v_saldo int;
begin
  if v_empresa is null or not empresa_aprovada() then
    raise exception 'Cadastro ainda não aprovado';
  end if;
  if p_pagamento = 'boleto_faturado' and not (select pode_boleto from empresas where id = v_empresa) then
    raise exception 'Boleto faturado não liberado para esta empresa';
  end if;
  if jsonb_array_length(p_itens) = 0 then raise exception 'Carrinho vazio'; end if;

  insert into pedidos (empresa_id, usuario_id, cd_id, pagamento, subtotal, frete, total, cep_entrega, observacao)
  values (v_empresa, auth.uid(), p_cd, p_pagamento, 0, coalesce(p_frete,0), 0, p_cep, p_obs)
  returning id into v_pedido;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_qtd := (v_item->>'quantidade')::int;
    if v_qtd is null or v_qtd <= 0 then raise exception 'Quantidade inválida'; end if;

    select quantidade into v_saldo from estoque
      where produto_id = (v_item->>'produto_id')::uuid and cd_id = p_cd for update;
    if coalesce(v_saldo,0) < v_qtd then
      raise exception 'Estoque insuficiente para %: disponível % un.',
        (select nome from produtos where id = (v_item->>'produto_id')::uuid), coalesce(v_saldo,0);
    end if;

    v_preco := preco_no_cd((v_item->>'produto_id')::uuid, p_cd);
    if v_preco is null then
      raise exception 'Produto sem preço cadastrado: %', (select nome from produtos where id = (v_item->>'produto_id')::uuid);
    end if;
    insert into pedido_itens values (v_pedido, (v_item->>'produto_id')::uuid, v_qtd, v_preco);
    update estoque set quantidade = quantidade - v_qtd, atualizado_em = now()
      where produto_id = (v_item->>'produto_id')::uuid and cd_id = p_cd;
    insert into movimentos_estoque (produto_id, cd_id, delta, motivo, referencia, usuario_id)
      values ((v_item->>'produto_id')::uuid, p_cd, -v_qtd, 'pedido', v_pedido::text, auth.uid());
    v_sub := v_sub + v_preco * v_qtd;
  end loop;

  update pedidos set subtotal = v_sub, total = v_sub + coalesce(p_frete,0) where id = v_pedido;
  return v_pedido;
end $$;

-- Transferência entre CDs (só equipe)
create or replace function transferir_estoque(p_produto uuid, p_de text, p_para text, p_qtd int)
returns void
language plpgsql security definer set search_path = public as $$
declare v_saldo int;
begin
  if not eh_equipe() then raise exception 'Sem permissão'; end if;
  if p_qtd <= 0 or p_de = p_para then raise exception 'Transferência inválida'; end if;
  select quantidade into v_saldo from estoque where produto_id = p_produto and cd_id = p_de for update;
  if coalesce(v_saldo,0) < p_qtd then raise exception 'Saldo insuficiente na origem (% un.)', coalesce(v_saldo,0); end if;
  update estoque set quantidade = quantidade - p_qtd, atualizado_em = now() where produto_id = p_produto and cd_id = p_de;
  insert into estoque (produto_id, cd_id, quantidade) values (p_produto, p_para, p_qtd)
    on conflict (produto_id, cd_id) do update set quantidade = estoque.quantidade + p_qtd, atualizado_em = now();
  insert into movimentos_estoque (produto_id, cd_id, delta, motivo, usuario_id) values
    (p_produto, p_de, -p_qtd, 'transferencia', auth.uid()),
    (p_produto, p_para, p_qtd, 'transferencia', auth.uid());
end $$;

-- Novo usuário do Auth vira perfil de integrador automaticamente
create or replace function novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfis (id, nome, email, papel)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email,'@',1)), new.email, 'integrador');
  return new;
end $$;
create trigger ao_criar_usuario after insert on auth.users for each row execute function novo_usuario();

-- ---------- Segurança por linha (RLS) ----------
alter table cds enable row level security;
alter table empresas enable row level security;
alter table perfis enable row level security;
alter table produtos enable row level security;
alter table estoque enable row level security;
alter table precos enable row level security;
alter table movimentos_estoque enable row level security;
alter table pedidos enable row level security;
alter table pedido_itens enable row level security;

-- CDs e produtos: catálogo público (sem preço — o preço sai da view abaixo)
create policy cds_leitura on cds for select using (true);
create policy cds_equipe on cds for all using (meu_papel() in ('gestor','admin')) with check (meu_papel() in ('gestor','admin'));

create policy produtos_leitura on produtos for select using (ativo or eh_equipe());
create policy produtos_equipe on produtos for all using (eh_equipe()) with check (eh_equipe());

create policy estoque_leitura on estoque for select using (empresa_aprovada() or eh_equipe());
create policy estoque_equipe on estoque for all using (eh_equipe()) with check (eh_equipe());

create policy precos_leitura on precos for select using (empresa_aprovada() or eh_equipe());
create policy precos_equipe on precos for all using (eh_equipe()) with check (eh_equipe());

create policy mov_equipe on movimentos_estoque for select using (eh_equipe());

-- Perfis: cada um vê o seu; equipe vê todos; só gestor/admin muda papel
create policy perfis_proprio on perfis for select using (id = auth.uid() or eh_equipe());
create policy perfis_editar_proprio on perfis for update using (id = auth.uid())
  with check (id = auth.uid() and papel = (select papel from perfis where id = auth.uid()) and empresa_id is not distinct from (select empresa_id from perfis where id = auth.uid()));
create policy perfis_gestao on perfis for all using (meu_papel() in ('gestor','admin')) with check (meu_papel() in ('gestor','admin'));

-- Empresas: integrador vê a própria; equipe vê todas
create policy empresas_propria on empresas for select using (id = minha_empresa() or eh_equipe());
create policy empresas_equipe on empresas for update using (eh_equipe()) with check (eh_equipe());

-- Pedidos: integrador vê os da empresa; equipe vê todos e atualiza status
create policy pedidos_leitura on pedidos for select using (empresa_id = minha_empresa() or eh_equipe());
create policy pedidos_equipe on pedidos for update using (eh_equipe()) with check (eh_equipe());
create policy itens_leitura on pedido_itens for select using (
  exists (select 1 from pedidos p where p.id = pedido_id and (p.empresa_id = minha_empresa() or eh_equipe())));

-- Cadastro de empresa pelo próprio integrador (entra como pendente)
create or replace function cadastrar_empresa(p_cnpj text, p_razao text, p_fantasia text, p_cidade text, p_uf text, p_telefone text, p_segmento text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Faça login primeiro'; end if;
  if minha_empresa() is not null then raise exception 'Usuário já vinculado a uma empresa'; end if;
  insert into empresas (cnpj, razao_social, nome_fantasia, cidade, uf, telefone, segmento)
  values (regexp_replace(p_cnpj,'\D','','g'), p_razao, p_fantasia, p_cidade, p_uf, p_telefone, p_segmento)
  returning id into v_id;
  update perfis set empresa_id = v_id where id = auth.uid();
  return v_id;
end $$;

-- ---------- Catálogo com preço e saldo (respeita quem está logado) ----------
create or replace view catalogo with (security_invoker = true) as
select
  p.id, p.sku, p.nome, p.marca, p.categoria, p.especificacao, p.potencia_w, p.potencia_kw, p.fase,
  p.modulos_por_estrutura, p.tipo_telhado, p.datasheet_path, p.imagem_path, p.unidade,
  c.id as cd_id,
  round(pr.preco_base * c.fator_preco, 2) as preco,           -- nulo para quem não pode ver (RLS em precos)
  case when empresa_aprovada() or eh_equipe() then coalesce(e.quantidade,0) end as estoque
from produtos p
cross join cds c
left join precos pr on pr.produto_id = p.id
left join estoque e on e.produto_id = p.id and e.cd_id = c.id
where p.ativo and c.ativo;

-- ---------- Storage ----------
insert into storage.buckets (id, name, public) values ('datasheets','datasheets', true) on conflict do nothing;
create policy datasheets_upload on storage.objects for insert with check (bucket_id = 'datasheets' and eh_equipe());
create policy datasheets_update on storage.objects for update using (bucket_id = 'datasheets' and eh_equipe());
create policy datasheets_delete on storage.objects for delete using (bucket_id = 'datasheets' and eh_equipe());


-- ===================== supabase/migrations/0002_gestao.sql =====================

-- Titan Hub — área de gestão (equipe interna)
-- Rodar depois da 0001. Pode ser executada mais de uma vez (create or replace / drop if exists).

-- ---------- Equipe ativa ----------
-- Membro da equipe desativado em /gestao/equipe perde o acesso aos dados internos (RLS),
-- mesmo que ainda tenha sessão aberta. Mesma assinatura da 0001: só acrescenta "ativo".
create or replace function eh_equipe() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select papel in ('vendedora','gestor','admin') and ativo from perfis where id = auth.uid()), false)
$$;

-- ---------- Proteção de papéis ----------
-- Só admin concede ou retira o papel 'admin', e ninguém muda o próprio papel/ativo pela API.
-- Chamadas sem usuário (chave de serviço, SQL Editor) passam livremente.
create or replace function proteger_papeis() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.papel is distinct from old.papel or new.ativo is distinct from old.ativo then
    if new.id = auth.uid() then
      raise exception 'Você não pode alterar o seu próprio papel ou acesso';
    end if;
    if (new.papel = 'admin' or old.papel = 'admin') and meu_papel() is distinct from 'admin' then
      raise exception 'Somente um administrador pode alterar perfis de administrador';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists ao_alterar_papel on perfis;
create trigger ao_alterar_papel before update on perfis for each row execute function proteger_papeis();

-- ---------- Bloqueio de empresas ----------
-- Toda a equipe aprova/recusa cadastros, mas só gestor/admin bloqueia ou desbloqueia.
create or replace function proteger_bloqueio() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.status is distinct from old.status and (new.status = 'bloqueada' or old.status = 'bloqueada')
     and meu_papel() not in ('gestor','admin') then
    raise exception 'Só gestor ou administrador pode bloquear ou desbloquear uma empresa';
  end if;
  return new;
end $$;

drop trigger if exists ao_bloquear_empresa on empresas;
create trigger ao_bloquear_empresa before update on empresas for each row execute function proteger_bloqueio();

-- ---------- Ajuste manual de estoque ----------
-- Define o saldo (e opcionalmente o mínimo) de um produto num CD e registra o delta
-- em movimentos_estoque com motivo 'ajuste'. Cria a linha de estoque se ainda não existir.
create or replace function ajustar_estoque(p_produto uuid, p_cd text, p_nova_qtd int, p_minimo int default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_atual int;
  v_delta int;
begin
  if not eh_equipe() then raise exception 'Sem permissão'; end if;
  if p_nova_qtd is null or p_nova_qtd < 0 then raise exception 'Saldo inválido: informe 0 ou mais'; end if;
  if p_minimo is not null and p_minimo < 0 then raise exception 'Mínimo inválido: informe 0 ou mais'; end if;
  if not exists (select 1 from produtos where id = p_produto) then raise exception 'Produto não encontrado'; end if;
  if not exists (select 1 from cds where id = p_cd) then raise exception 'CD não encontrado'; end if;

  insert into estoque (produto_id, cd_id) values (p_produto, p_cd) on conflict (produto_id, cd_id) do nothing;
  select quantidade into v_atual from estoque where produto_id = p_produto and cd_id = p_cd for update;
  v_delta := p_nova_qtd - coalesce(v_atual, 0);

  update estoque
     set quantidade = p_nova_qtd,
         minimo = coalesce(p_minimo, minimo),
         atualizado_em = now()
   where produto_id = p_produto and cd_id = p_cd;

  if v_delta <> 0 then
    insert into movimentos_estoque (produto_id, cd_id, delta, motivo, referencia, usuario_id)
    values (p_produto, p_cd, v_delta, 'ajuste', 'ajuste manual', auth.uid());
  end if;
end $$;

-- ---------- Cancelamento de pedido ----------
-- Atômico: trava o pedido, devolve cada item ao estoque do CD do pedido,
-- registra movimentos 'cancelamento' (referência = id do pedido) e marca como cancelado.
create or replace function cancelar_pedido(p_pedido uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status status_pedido;
  v_cd text;
  v_item record;
begin
  if not eh_equipe() then raise exception 'Sem permissão'; end if;

  select status, cd_id into v_status, v_cd from pedidos where id = p_pedido for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if v_status = 'cancelado' then raise exception 'Este pedido já está cancelado'; end if;
  if v_status = 'entregue' then raise exception 'Pedido já entregue não pode ser cancelado'; end if;

  for v_item in select produto_id, quantidade from pedido_itens where pedido_id = p_pedido loop
    insert into estoque (produto_id, cd_id, quantidade) values (v_item.produto_id, v_cd, v_item.quantidade)
      on conflict (produto_id, cd_id) do update
      set quantidade = estoque.quantidade + excluded.quantidade, atualizado_em = now();
    insert into movimentos_estoque (produto_id, cd_id, delta, motivo, referencia, usuario_id)
    values (v_item.produto_id, v_cd, v_item.quantidade, 'cancelamento', p_pedido::text, auth.uid());
  end loop;

  update pedidos set status = 'cancelado', atualizado_em = now() where id = p_pedido;
end $$;

-- ---------- Permissões de execução ----------
-- Visitantes (anon) não chamam as funções de gestão; a checagem eh_equipe() continua valendo.
revoke all on function ajustar_estoque(uuid, text, int, int) from public, anon;
grant execute on function ajustar_estoque(uuid, text, int, int) to authenticated;
revoke all on function cancelar_pedido(uuid) from public, anon;
grant execute on function cancelar_pedido(uuid) to authenticated;
revoke all on function transferir_estoque(uuid, text, text, int) from public, anon;
grant execute on function transferir_estoque(uuid, text, text, int) to authenticated;

-- ---------- Índices de apoio às telas de gestão ----------
create index if not exists pedidos_criado_em_idx on pedidos (criado_em desc);
create index if not exists pedidos_status_idx on pedidos (status);
create index if not exists pedidos_empresa_idx on pedidos (empresa_id);
create index if not exists empresas_status_idx on empresas (status);
create index if not exists perfis_empresa_idx on perfis (empresa_id);
create index if not exists movimentos_produto_idx on movimentos_estoque (produto_id, criado_em desc);

-- ---------- Storage: leitura dos datasheets pela equipe ----------
-- O upload com substituição (upsert) do mesmo arquivo exige política de SELECT em storage.objects.
drop policy if exists datasheets_leitura_equipe on storage.objects;
create policy datasheets_leitura_equipe on storage.objects for select using (bucket_id = 'datasheets' and eh_equipe());


-- ===================== supabase/migrations/0003_bling.sql =====================

-- Titan Hub — integração com o ERP Bling (API v3)
-- Rodar no Supabase depois da 0001: SQL Editor > colar este arquivo > Run.

-- ---------- Tokens OAuth (linha única) ----------
-- Só a chave de serviço (servidor) lê/escreve: RLS ligado e NENHUMA política.
-- Tokens JWT do Bling têm ~1.500–3.000 caracteres: por isso "text".
create table if not exists integracao_bling (
  id smallint primary key default 1 check (id = 1),
  access_token text not null,
  refresh_token text not null,
  expira_em timestamptz not null,          -- validade do access_token
  conectado_por uuid references perfis(id),
  atualizado_em timestamptz not null default now()
);
alter table integracao_bling enable row level security;
revoke all on integracao_bling from anon, authenticated;

-- ---------- Depósito do Bling -> CD do Titan ----------
-- Vários depósitos podem apontar para o mesmo CD (os saldos são somados).
create table if not exists bling_depositos (
  deposito_id bigint primary key,          -- id do depósito no Bling
  cd_id text not null references cds(id),
  descricao text,                          -- nome do depósito no Bling (só para conferência)
  criado_em timestamptz not null default now()
);
alter table bling_depositos enable row level security;
create policy bling_depositos_leitura on bling_depositos for select using (eh_equipe());
create policy bling_depositos_gestao on bling_depositos for all
  using (meu_papel() in ('gestor','admin')) with check (meu_papel() in ('gestor','admin'));

-- ---------- Log das sincronizações ----------
create table if not exists bling_sincronizacoes (
  id bigserial primary key,
  tipo text not null check (tipo in ('produtos','estoque','pedido')),
  inicio timestamptz not null default now(),
  fim timestamptz,
  ok boolean,
  mensagem text,
  contadores jsonb not null default '{}'::jsonb
);
create index if not exists bling_sincronizacoes_inicio_idx on bling_sincronizacoes (inicio desc);
alter table bling_sincronizacoes enable row level security;
create policy bling_sync_leitura on bling_sincronizacoes for select using (eh_equipe());

-- ---------- Status da conexão para a equipe (sem expor tokens) ----------
create or replace function bling_status()
returns table (conectado boolean, expira_em timestamptz, atualizado_em timestamptz)
language sql stable security definer set search_path = public as $$
  select true, i.expira_em, i.atualizado_em from integracao_bling i where eh_equipe()
  union all
  select false, null, null where eh_equipe() and not exists (select 1 from integracao_bling)
$$;
revoke all on function bling_status() from public, anon;
grant execute on function bling_status() to authenticated;


-- ===================== supabase/migrations/0004_revisao.sql =====================

-- Titan Hub — correções da revisão de segurança e lógica
-- Rodar depois da 0003. Pode ser executada mais de uma vez (create or replace / drop if exists).

-- ---------- 1. Preço não vaza por função ----------
-- preco_no_cd é SECURITY DEFINER e não confere quem chama: com o EXECUTE padrão, visitante
-- (anon) ou integrador pendente lia o preço de qualquer produto. Só criar_pedido (dono) a usa.
revoke all on function preco_no_cd(uuid, text) from public, anon, authenticated;

-- ---------- 2. Papel só vale para membro ativo ----------
-- meu_papel() alimenta as políticas de perfis, cds e bling_depositos: um gestor desativado
-- continuava promovendo/desativando usuários e mexendo em CDs.
create or replace function meu_papel() returns papel
language sql stable security definer set search_path = public as $$
  select papel from perfis where id = auth.uid() and ativo
$$;

-- Empresa aprovada só conta para usuário ativo (integrador desativado não vê preço nem compra).
create or replace function empresa_aprovada() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select e.status = 'aprovada' and p.ativo from perfis p join empresas e on e.id = p.empresa_id where p.id = auth.uid()), false)
$$;

-- Com meu_papel() nulo, "not in" virava nulo e o bloqueio passava: compara com coalesce.
create or replace function proteger_bloqueio() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.status is distinct from old.status and (new.status = 'bloqueada' or old.status = 'bloqueada')
     and coalesce(meu_papel()::text, '') not in ('gestor','admin') then
    raise exception 'Só gestor ou administrador pode bloquear ou desbloquear uma empresa';
  end if;
  return new;
end $$;

-- Membro da equipe não pode ficar vinculado a empresa integradora (a tela já barrava; o banco não).
create or replace function proteger_papeis() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.papel is distinct from old.papel or new.ativo is distinct from old.ativo then
    if new.id = auth.uid() then
      raise exception 'Você não pode alterar o seu próprio papel ou acesso';
    end if;
    if (new.papel = 'admin' or old.papel = 'admin') and meu_papel() is distinct from 'admin' then
      raise exception 'Somente um administrador pode alterar perfis de administrador';
    end if;
  end if;
  if new.papel <> 'integrador' and new.empresa_id is not null then
    raise exception 'Membro da equipe não pode estar vinculado a uma empresa integradora';
  end if;
  return new;
end $$;

-- ---------- 3. Cadastro de empresa ----------
-- Só integrador sem empresa; CNPJ com 14 dígitos (a RPC é chamável direto, sem o zod da tela).
create or replace function cadastrar_empresa(p_cnpj text, p_razao text, p_fantasia text, p_cidade text, p_uf text, p_telefone text, p_segmento text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_cnpj text := regexp_replace(coalesce(p_cnpj,''),'\D','','g');
begin
  if auth.uid() is null then raise exception 'Faça login primeiro'; end if;
  if meu_papel() is distinct from 'integrador' then raise exception 'Somente integradores cadastram empresa'; end if;
  if minha_empresa() is not null then raise exception 'Usuário já vinculado a uma empresa'; end if;
  if length(v_cnpj) <> 14 then raise exception 'CNPJ inválido'; end if;
  if length(coalesce(p_razao,'')) not between 3 and 200 then raise exception 'Razão social inválida'; end if;
  insert into empresas (cnpj, razao_social, nome_fantasia, cidade, uf, telefone, segmento)
  values (v_cnpj, p_razao, left(p_fantasia,120), left(p_cidade,120), left(p_uf,2), left(p_telefone,20), p_segmento)
  returning id into v_id;
  update perfis set empresa_id = v_id where id = auth.uid();
  return v_id;
end $$;
revoke all on function cadastrar_empresa(text, text, text, text, text, text, text) from public, anon;
grant execute on function cadastrar_empresa(text, text, text, text, text, text, text) to authenticated;

-- ---------- 4. Criação de pedido ----------
-- Antes: frete vinha do cliente (frete negativo baixava o total), p_itens nulo gerava pedido vazio,
-- produto inativo e CD inativo eram aceitos, travas de estoque em ordem arbitrária (deadlock).
create or replace function criar_pedido(p_cd text, p_pagamento forma_pagamento, p_itens jsonb, p_cep text, p_obs text, p_frete numeric)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_empresa uuid := minha_empresa();
  v_pedido uuid;
  v_sub numeric := 0;
  v_item jsonb;
  v_prod uuid;
  v_qtd int;
  v_preco numeric;
  v_saldo int;
begin
  if v_empresa is null or not empresa_aprovada() then
    raise exception 'Cadastro ainda não aprovado';
  end if;
  if p_pagamento is null then raise exception 'Forma de pagamento inválida'; end if;
  if p_pagamento = 'boleto_faturado' and not coalesce((select pode_boleto from empresas where id = v_empresa), false) then
    raise exception 'Boleto faturado não liberado para esta empresa';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Carrinho vazio';
  end if;
  if jsonb_array_length(p_itens) > 200 then raise exception 'Quantidade inválida'; end if;
  if not exists (select 1 from cds where id = p_cd and ativo) then raise exception 'CD inválido'; end if;
  if length(coalesce(p_cep,'')) > 12 or length(coalesce(p_obs,'')) > 1000 then
    raise exception 'Dados de entrega inválidos';
  end if;

  -- O frete é definido pela equipe depois (tela do pedido); o valor enviado pelo cliente é ignorado.
  insert into pedidos (empresa_id, usuario_id, cd_id, pagamento, subtotal, frete, total, cep_entrega, observacao)
  values (v_empresa, auth.uid(), p_cd, p_pagamento, 0, 0, 0, p_cep, p_obs)
  returning id into v_pedido;
  perform set_config('titan.pedido_interno', v_pedido::text, true);

  for v_item in select e.value from jsonb_array_elements(p_itens) e order by e.value->>'produto_id' loop
    v_prod := (v_item->>'produto_id')::uuid;
    v_qtd := (v_item->>'quantidade')::int;
    if v_prod is null or v_qtd is null or v_qtd <= 0 then raise exception 'Quantidade inválida'; end if;
    if not exists (select 1 from produtos where id = v_prod and ativo) then
      raise exception 'Produto indisponível';
    end if;

    select quantidade into v_saldo from estoque where produto_id = v_prod and cd_id = p_cd for update;
    if coalesce(v_saldo,0) < v_qtd then
      raise exception 'Estoque insuficiente para %: disponível % un.',
        (select nome from produtos where id = v_prod), coalesce(v_saldo,0);
    end if;

    v_preco := preco_no_cd(v_prod, p_cd);
    if v_preco is null or v_preco <= 0 then
      raise exception 'Produto sem preço cadastrado: %', (select nome from produtos where id = v_prod);
    end if;
    insert into pedido_itens values (v_pedido, v_prod, v_qtd, v_preco);
    update estoque set quantidade = quantidade - v_qtd, atualizado_em = now()
      where produto_id = v_prod and cd_id = p_cd;
    insert into movimentos_estoque (produto_id, cd_id, delta, motivo, referencia, usuario_id)
      values (v_prod, p_cd, -v_qtd, 'pedido', v_pedido::text, auth.uid());
    v_sub := v_sub + v_preco * v_qtd;
  end loop;

  update pedidos set subtotal = v_sub, total = v_sub where id = v_pedido;
  perform set_config('titan.pedido_interno', '', true);
  return v_pedido;
end $$;
revoke all on function criar_pedido(text, forma_pagamento, jsonb, text, text, numeric) from public, anon;
grant execute on function criar_pedido(text, forma_pagamento, jsonb, text, text, numeric) to authenticated;

-- ---------- 5. Cancelamento marca o pedido como "operação interna" ----------
create or replace function cancelar_pedido(p_pedido uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status status_pedido;
  v_cd text;
  v_item record;
begin
  if not eh_equipe() then raise exception 'Sem permissão'; end if;

  select status, cd_id into v_status, v_cd from pedidos where id = p_pedido for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
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

-- ---------- 6. Pedido: a política pedidos_equipe deixava a equipe mudar QUALQUER coluna ----------
-- Pela API, uma vendedora podia marcar "cancelado" sem devolver estoque, reabrir pedido cancelado
-- (estoque já devolvido), pular etapas e alterar empresa, itens/subtotal ou total.
create or replace function proteger_pedido() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ordem text[] := array['recebido','faturado','separacao','em_transporte','entregue'];
begin
  if auth.uid() is null then return new; end if;                                       -- chave de serviço / SQL Editor
  if current_setting('titan.pedido_interno', true) = new.id::text then return new; end if; -- criar/cancelar_pedido
  if new.empresa_id is distinct from old.empresa_id or new.usuario_id is distinct from old.usuario_id
     or new.cd_id is distinct from old.cd_id or new.pagamento is distinct from old.pagamento
     or new.subtotal is distinct from old.subtotal or new.numero is distinct from old.numero
     or new.criado_em is distinct from old.criado_em or new.bling_pedido_id is distinct from old.bling_pedido_id
     or new.cep_entrega is distinct from old.cep_entrega or new.observacao is distinct from old.observacao then
    raise exception 'Estes dados do pedido não podem ser alterados';
  end if;
  if new.frete < 0 then raise exception 'O frete não pode ser negativo'; end if;
  if new.total is distinct from new.subtotal + new.frete then raise exception 'Total do pedido inconsistente'; end if;
  if new.status is distinct from old.status then
    if old.status = 'cancelado' then raise exception 'Pedido cancelado não pode ser reaberto'; end if;
    if new.status = 'cancelado' then raise exception 'Use a opção Cancelar pedido para devolver o estoque'; end if;
    if array_position(v_ordem, new.status::text) is distinct from array_position(v_ordem, old.status::text) + 1 then
      raise exception 'Mudança de status inválida';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists ao_alterar_pedido on pedidos;
create trigger ao_alterar_pedido before update on pedidos for each row execute function proteger_pedido();

-- ---------- 7. Vendedora responsável visível para o integrador ----------
-- A RLS de perfis só mostra o próprio perfil ao integrador: o contato da vendedora (WhatsApp)
-- sempre vinha vazio. Expõe só nome e telefone, sem abrir a tabela.
create or replace function minha_vendedora()
returns table (nome text, telefone text)
language sql stable security definer set search_path = public as $$
  select v.nome, v.telefone
  from perfis eu
  join empresas e on e.id = eu.empresa_id
  join perfis v on v.id = e.vendedora_id
  where eu.id = auth.uid() and v.ativo
$$;
revoke all on function minha_vendedora() from public, anon;
grant execute on function minha_vendedora() to authenticated;

-- ---------- 8. Estoque vindo do Bling, aplicado de forma atômica ----------
-- Antes: o servidor lia o saldo, calculava a diferença e gravava por cima (upsert). Um pedido fechado
-- no meio era apagado do saldo, e pedidos do Titan ainda não enviados ao Bling (que o saldo virtual
-- do Bling não conhece) "voltavam" para o estoque a cada sincronização, permitindo vender duas vezes.
-- Aqui: trava a linha, desconta pedidos não cancelados ainda sem bling_pedido_id e registra o delta real.
-- p_saldos: [{"produto_id": "...", "cd_id": "cascavel", "quantidade": 120}, ...]
create or replace function aplicar_estoque_bling(p_saldos jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v jsonb;
  v_prod uuid;
  v_cd text;
  v_bling int;
  v_pend int;
  v_nova int;
  v_atual int;
  v_alterados int := 0;
begin
  for v in select e.value from jsonb_array_elements(coalesce(p_saldos, '[]'::jsonb)) e
           order by e.value->>'produto_id', e.value->>'cd_id' loop
    v_prod := (v->>'produto_id')::uuid;
    v_cd := v->>'cd_id';
    v_bling := greatest(0, coalesce((v->>'quantidade')::int, 0));

    select quantidade into v_atual from estoque where produto_id = v_prod and cd_id = v_cd for update;
    if not found then
      if v_bling = 0 then continue; end if;
      insert into estoque (produto_id, cd_id, quantidade) values (v_prod, v_cd, 0) on conflict do nothing;
      select quantidade into v_atual from estoque where produto_id = v_prod and cd_id = v_cd for update;
    end if;

    select coalesce(sum(i.quantidade), 0) into v_pend
      from pedido_itens i join pedidos p on p.id = i.pedido_id
     where i.produto_id = v_prod and p.cd_id = v_cd and p.status <> 'cancelado' and p.bling_pedido_id is null;
    v_nova := greatest(0, v_bling - v_pend);

    if v_nova <> v_atual then
      update estoque set quantidade = v_nova, atualizado_em = now() where produto_id = v_prod and cd_id = v_cd;
      insert into movimentos_estoque (produto_id, cd_id, delta, motivo, referencia)
      values (v_prod, v_cd, v_nova - v_atual, 'sync_bling', 'bling');
      v_alterados := v_alterados + 1;
    end if;
  end loop;
  return v_alterados;
end $$;
revoke all on function aplicar_estoque_bling(jsonb) from public, anon, authenticated;
grant execute on function aplicar_estoque_bling(jsonb) to service_role;

-- ---------- 9. Storage: datasheets só PDF, só no caminho do produto ----------
-- Antes qualquer membro da equipe gravava qualquer arquivo/tipo/caminho num bucket PÚBLICO
-- (ex.: HTML servido pelo domínio do Storage).
drop policy if exists datasheets_upload on storage.objects;
create policy datasheets_upload on storage.objects for insert with check (
  bucket_id = 'datasheets' and eh_equipe() and name ~ '^produtos/[0-9a-f-]{36}/[A-Za-z0-9._-]+\.pdf$');
drop policy if exists datasheets_update on storage.objects;
create policy datasheets_update on storage.objects for update
  using (bucket_id = 'datasheets' and eh_equipe())
  with check (bucket_id = 'datasheets' and eh_equipe() and name ~ '^produtos/[0-9a-f-]{36}/[A-Za-z0-9._-]+\.pdf$');

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    execute $q$update storage.buckets set allowed_mime_types = array['application/pdf'], file_size_limit = 20971520
               where id = 'datasheets'$q$;
  end if;
end $$;

-- ---------- 10. Perfis: gestor não apaga nem cria perfis pela API ----------
-- perfis_gestao era "for all": um gestor podia DELETAR o perfil de um admin (o gatilho só cobre update).
drop policy if exists perfis_gestao on perfis;
drop policy if exists perfis_gestao_leitura on perfis;
drop policy if exists perfis_gestao_editar on perfis;
create policy perfis_gestao_editar on perfis for update
  using (meu_papel() in ('gestor','admin')) with check (meu_papel() in ('gestor','admin'));


-- ===================== supabase/seed.sql =====================

-- Dados iniciais: CDs reais da Titan + produtos de EXEMPLO (substituir pelos reais na migração)
insert into cds (id, nome, uf, matriz, prazo_entrega, fator_preco) values
  ('cascavel',   'Matriz Cascavel',   'PR', true,  '1 dia útil',   1.0000),
  ('piracicaba', 'Filial Piracicaba', 'SP', false, '1 dia útil',   1.0000)
on conflict (id) do nothing;

with p as (
  insert into produtos (sku, nome, marca, categoria, especificacao, potencia_w, potencia_kw, fase, modulos_por_estrutura, tipo_telhado) values
  ('EX-MOD-620', 'Módulo 620W N-Type TOPCon Bifacial', 'Exemplo', 'Módulos', '620 Wp · 23,0%', 620, null, null, null, null),
  ('EX-MOD-585', 'Módulo 585W Monocristalino Half-Cell', 'Exemplo', 'Módulos', '585 Wp · 22,6%', 585, null, null, null, null),
  ('EX-INV-5M',  'Inversor On-Grid 5kW Monofásico 220V', 'Exemplo', 'Inversores', '2 MPPT', null, 5, 'mono', null, null),
  ('EX-INV-8M',  'Inversor On-Grid 8kW Monofásico 220V', 'Exemplo', 'Inversores', '2 MPPT', null, 8, 'mono', null, null),
  ('EX-INV-10M', 'Inversor On-Grid 10kW Monofásico 220V', 'Exemplo', 'Inversores', '3 MPPT', null, 10, 'mono', null, null),
  ('EX-INV-15T', 'Inversor On-Grid 15kW Trifásico 380V', 'Exemplo', 'Inversores', '2 MPPT', null, 15, 'tri', null, null),
  ('EX-EST-CER', 'Estrutura Telha Cerâmica · 4 módulos', 'Exemplo', 'Estruturas', 'Alumínio', null, null, null, 4, 'ceramica'),
  ('EX-EST-MET', 'Estrutura Telha Metálica · 4 módulos', 'Exemplo', 'Estruturas', 'Minitrilho', null, null, null, 4, 'metalica'),
  ('EX-CAB-6',   'Cabo Solar 6 mm² 1,8 kV (metro)', 'Exemplo', 'Elétrica', 'Vendido por metro', null, null, null, null, null),
  ('EX-MC4',     'Par de conectores MC4', 'Exemplo', 'Elétrica', 'IP68', null, null, null, null, null),
  ('EX-SBOX',    'String Box CC 2E/1S', 'Exemplo', 'Elétrica', 'DPS + fusível', null, null, null, null, null)
  returning id, sku
)
insert into precos (produto_id, preco_base)
select id, case sku
  when 'EX-MOD-620' then 612 when 'EX-MOD-585' then 548 when 'EX-INV-5M' then 3980 when 'EX-INV-8M' then 5640
  when 'EX-INV-10M' then 6870 when 'EX-INV-15T' then 10450 when 'EX-EST-CER' then 398 when 'EX-EST-MET' then 276
  when 'EX-CAB-6' then 7.40 when 'EX-MC4' then 24 when 'EX-SBOX' then 690 end
from p;

insert into estoque (produto_id, cd_id, quantidade, minimo)
select p.id, c.id, case when c.id = 'cascavel' then 500 else 200 end, 20 from produtos p cross join cds c
on conflict do nothing;
