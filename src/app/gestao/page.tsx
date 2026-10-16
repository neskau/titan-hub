import Link from "next/link";
import { CabecalhoPagina } from "@/components/Shell";
import { Indicador } from "@/components/gestao/Indicador";
import { STATUS_PEDIDO, data, nomeEmpresa } from "@/components/gestao/rotulos";
import {
  dataValida,
  inicioDoDia,
  inicioDoDiaSeguinte,
  listarCdsGestao,
  periodoPadrao,
  sessaoGestao,
} from "@/components/gestao/servidor";
import { brl, num } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import type { StatusPedido } from "@/lib/tipos";
import { BarraMeta } from "@/components/gestao/crm/BarraMeta";
import { BotaoConcluir } from "@/components/gestao/crm/BotaoConcluir";
import { ETAPAS_ABERTAS, hojeSP, horaSP, diaSP, pct, situacaoRitmo } from "@/components/gestao/crm/constantes";
import { atingido, carregarDesempenho } from "@/components/gestao/crm/desempenho";
import { ehGestor } from "@/components/gestao/crm/servidor";

export const metadata = { title: "Dashboard · Gestão · Titan" };

interface TarefaResumo {
  id: string;
  descricao: string;
  vencimento: string;
  concluida: boolean;
  oportunidades: { id: string; titulo: string } | null;
  empresas: { id: string; razao_social: string; nome_fantasia: string | null } | null;
}

interface PedidoResumo {
  id: string;
  numero: number;
  status: StatusPedido;
  total: number;
  cd_id: string;
  criado_em: string;
  empresas: { razao_social: string; nome_fantasia: string | null } | null;
}

export default async function Dashboard({ searchParams }: { searchParams: { de?: string; ate?: string; cd?: string } }) {
  const s = await sessaoGestao();
  const gestor = ehGestor(s);
  const sb = supabaseServidor();
  const cds = await listarCdsGestao();
  const padrao = periodoPadrao();
  let de = dataValida(searchParams.de) ?? padrao.de;
  let ate = dataValida(searchParams.ate) ?? padrao.ate;
  if (de > ate) [de, ate] = [ate, de];
  const cd = cds.find((c) => c.id === searchParams.cd)?.id;

  // Pedidos do período (exceto cancelados) para contagem e valor total
  let qPeriodo = sb
    .from("pedidos")
    .select("total")
    .neq("status", "cancelado")
    .gte("criado_em", inicioDoDia(de))
    .lt("criado_em", inicioDoDiaSeguinte(ate))
    .limit(10000);
  let qFaturar = sb.from("pedidos").select("id", { count: "exact", head: true }).eq("status", "recebido");
  let qEstoque = sb.from("estoque").select("quantidade, minimo, produtos!inner(ativo)").eq("produtos.ativo", true).limit(10000);
  let qUltimos = sb
    .from("pedidos")
    .select("id, numero, status, total, cd_id, criado_em, empresas(razao_social, nome_fantasia)")
    .order("criado_em", { ascending: false })
    .limit(10);
  if (cd) {
    qPeriodo = qPeriodo.eq("cd_id", cd);
    qFaturar = qFaturar.eq("cd_id", cd);
    qEstoque = qEstoque.eq("cd_id", cd);
    qUltimos = qUltimos.eq("cd_id", cd);
  }
  const qPendentes = sb.from("empresas").select("id", { count: "exact", head: true }).eq("status", "pendente");

  const [periodo, faturar, pendentes, estoque, ultimos] = await Promise.all([qPeriodo, qFaturar, qPendentes, qEstoque, qUltimos]);

  // CRM: tarefas de hoje (atrasadas + hoje), meta do mês e leads sem vendedora.
  const hoje = hojeSP();
  const [tarefasHoje, desempenho, aguardando] = await Promise.all([
    sb
      .from("atividades")
      .select("id, descricao, vencimento, concluida, oportunidades(id, titulo), empresas(id, razao_social, nome_fantasia)", { count: "exact" })
      .eq("tipo", "tarefa")
      .eq("concluida", false)
      .eq("responsavel_id", s.userId)
      .lt("vencimento", inicioDoDiaSeguinte(hoje))
      .order("vencimento")
      .limit(6),
    carregarDesempenho(hoje.slice(0, 7)),
    gestor
      ? sb.from("oportunidades").select("id", { count: "exact", head: true }).is("vendedora_id", null).in("etapa", ETAPAS_ABERTAS)
      : Promise.resolve({ count: 0 }),
  ]);
  const listaTarefas = (tarefasHoje.data as unknown as TarefaResumo[] | null) ?? [];
  const minhaMeta = gestor
    ? desempenho.linhas.reduce((t, l) => ({ meta: t.meta + l.meta, realizado: t.realizado + l.realizado }), { meta: 0, realizado: 0 })
    : (desempenho.linhas.find((l) => l.vendedora_id === s.userId) ?? { meta: 0, realizado: 0 });
  const metaAtingida = atingido(minhaMeta.realizado, minhaMeta.meta);
  const ritmoMeta = situacaoRitmo(metaAtingida, desempenho.ritmo, minhaMeta.meta);
  const agora = Date.now();

  const pedidosPeriodo = (periodo.data as { total: number }[] | null) ?? [];
  const valorPeriodo = pedidosPeriodo.reduce((s, p) => s + Number(p.total), 0);
  const linhasEstoque = (estoque.data as { quantidade: number; minimo: number }[] | null) ?? [];
  const alertas = linhasEstoque.filter((e) => e.quantidade <= 0 || e.quantidade < e.minimo).length;
  const lista = (ultimos.data as unknown as PedidoResumo[] | null) ?? [];
  const nomeCd = (id: string) => cds.find((c) => c.id === id)?.nome ?? id;
  const sufixoCd = cd ? `?cd=${cd}` : "";

  return (
    <>
      <CabecalhoPagina titulo="Dashboard" sub="Visão geral de pedidos, cadastros e estoque" />

      <form method="get" className="cartao flex flex-wrap items-end gap-3 p-4" aria-label="Filtros do dashboard">
        <div>
          <label className="rotulo" htmlFor="de">
            De
          </label>
          <input id="de" name="de" type="date" defaultValue={de} className="campo" />
        </div>
        <div>
          <label className="rotulo" htmlFor="ate">
            Até
          </label>
          <input id="ate" name="ate" type="date" defaultValue={ate} className="campo" />
        </div>
        <div>
          <label className="rotulo" htmlFor="cd">
            CD
          </label>
          <select id="cd" name="cd" defaultValue={cd ?? ""} className="campo">
            <option value="">Todos os CDs</option>
            {cds.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome} – {c.uf}
              </option>
            ))}
          </select>
        </div>
        <button className="btn-primario">Aplicar</button>
        <Link href="/gestao" className="btn">
          Mês atual
        </Link>
      </form>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores">
        <Indicador
          icone="pedidos"
          numero={num(pedidosPeriodo.length)}
          rotulo="Pedidos no período"
          detalhe={`${brl(valorPeriodo)} em vendas`}
          href={`/gestao/pedidos${sufixoCd}`}
          destaque
        />
        <Indicador
          icone="faturar"
          numero={num(faturar.count ?? 0)}
          rotulo="Aguardando faturamento"
          detalhe="Pedidos recebidos"
          href={`/gestao/pedidos?status=recebido${cd ? `&cd=${cd}` : ""}`}
        />
        <Indicador
          icone="cadastro"
          numero={num(pendentes.count ?? 0)}
          rotulo="Cadastros pendentes"
          detalhe="Integradores a aprovar"
          href="/gestao/integradores?status=pendente"
        />
        <Indicador
          icone="estoque"
          numero={num(alertas)}
          rotulo="Itens em alerta de estoque"
          detalhe="Zerados ou abaixo do mínimo"
          href={`/gestao/estoque?alertas=1${cd ? `&cd=${cd}` : ""}`}
        />
      </section>

      <section className={`grid gap-4 ${gestor ? "lg:grid-cols-3" : "lg:grid-cols-2"}`} aria-label="Vendas">
        <div className="cartao flex flex-col gap-3 p-4">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">Minhas tarefas de hoje</h2>
            {(tarefasHoje.count ?? 0) > 0 && <span className="chip-alerta">{num(tarefasHoje.count ?? 0)}</span>}
            <span className="flex-1" />
            <Link href="/gestao/tarefas" className="text-sm font-semibold text-titan hover:underline">
              Ver todas
            </Link>
          </div>
          {listaTarefas.length === 0 ? (
            <p className="text-sm text-suave">Nenhuma tarefa atrasada ou para hoje.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-linha">
              {listaTarefas.map((t) => {
                const atrasada = Date.parse(t.vencimento) < agora;
                const link = t.oportunidades
                  ? { href: `/gestao/oportunidades/${t.oportunidades.id}`, texto: t.oportunidades.titulo }
                  : t.empresas
                    ? { href: `/gestao/integradores/${t.empresas.id}`, texto: nomeEmpresa(t.empresas) }
                    : null;
                return (
                  <li key={t.id} className="flex items-start gap-3 py-2 text-sm">
                    <BotaoConcluir id={t.id} concluida={t.concluida} descricao={t.descricao} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold [overflow-wrap:anywhere]">{t.descricao}</p>
                      <p className="text-xs text-suave">
                        <span className={atrasada ? "font-semibold text-red-700" : ""}>
                          {atrasada ? (diaSP(t.vencimento) === hoje ? `Atrasada (${horaSP(t.vencimento)})` : `Atrasada desde ${data(t.vencimento)}`) : `Hoje, ${horaSP(t.vencimento)}`}
                        </span>
                        {link && (
                          <>
                            {" · "}
                            <Link href={link.href} className="text-titan hover:underline">
                              {link.texto}
                            </Link>
                          </>
                        )}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <Link href="/gestao/metas" className="cartao flex flex-col gap-3 p-4 hover:border-suave">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">{gestor ? "Meta do mês · equipe" : "Minha meta do mês"}</h2>
            <span className="flex-1" />
            <span className={ritmoMeta.chip}>{ritmoMeta.rotulo}</span>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[30px] font-light leading-none">{brl(minhaMeta.realizado)}</span>
            <span className="text-sm text-suave">de {minhaMeta.meta > 0 ? brl(minhaMeta.meta) : "meta não definida"}</span>
          </div>
          <BarraMeta atingido={metaAtingida} ritmo={desempenho.ritmo} rotulo="Meta do mês atingida" />
          <p className="text-sm text-suave">
            {minhaMeta.meta > 0 ? `${pct(metaAtingida)} atingido · ritmo esperado ${pct(desempenho.ritmo)}` : "Peça ao gestor para definir a meta do mês."}
          </p>
        </Link>

        {gestor && (
          <Link href="/gestao/funil" className="cartao flex flex-col gap-2 p-4 hover:border-suave">
            <h2 className="font-semibold">Leads aguardando distribuição</h2>
            <span className="text-[30px] font-light leading-none">{num(aguardando.count ?? 0)}</span>
            <span className="text-sm text-suave">
              {(aguardando.count ?? 0) > 0 ? "Cadastros novos sem vendedora. Distribua pelo funil." : "Nenhum lead esperando. Tudo distribuído."}
            </span>
            <span className="mt-auto text-sm font-semibold text-titan">Abrir funil →</span>
          </Link>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="ultimos">
        <div className="flex items-center gap-3">
          <h2 id="ultimos" className="text-lg font-semibold">
            Últimos pedidos
          </h2>
          <span className="flex-1" />
          <Link href={`/gestao/pedidos${sufixoCd}`} className="text-sm font-semibold text-titan hover:underline">
            Ver todos
          </Link>
        </div>
        {lista.length === 0 ? (
          <p className="cartao p-6 text-center text-suave">Nenhum pedido ainda.</p>
        ) : (
          <div className="cartao overflow-x-auto">
            <table className="tabela w-full min-w-[560px] text-sm">
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Empresa</th>
                  <th>Data</th>
                  <th>CD</th>
                  <th>Situação</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((p) => (
                  <tr key={p.id} className="hover:bg-fundo">
                    <td>
                      <Link href={`/gestao/pedidos/${p.id}`} className="font-semibold text-titan hover:underline">
                        nº {p.numero}
                      </Link>
                    </td>
                    <td>{nomeEmpresa(p.empresas)}</td>
                    <td>{data(p.criado_em)}</td>
                    <td>{nomeCd(p.cd_id)}</td>
                    <td>
                      <span className={STATUS_PEDIDO[p.status].chip}>{STATUS_PEDIDO[p.status].rotulo}</span>
                    </td>
                    <td className="text-right font-semibold">{brl(Number(p.total))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
