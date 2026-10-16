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
