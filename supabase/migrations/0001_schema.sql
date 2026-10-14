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
