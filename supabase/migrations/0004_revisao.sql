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
