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
