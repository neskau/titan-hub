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
