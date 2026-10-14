import Link from "next/link";
import { CabecalhoPagina } from "@/components/Shell";
import { brl } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import type { Pedido } from "@/lib/tipos";
import { PAGAMENTOS, STATUS_PEDIDO } from "@/components/portal/categorias";
import { listarCds, sessaoPortal } from "@/components/portal/servidor";

export const metadata = { title: "Meus pedidos · Portal do Integrador · Titan" };

const data = (s: string) => new Date(s).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

export default async function MeusPedidos() {
  const s = await sessaoPortal();
  const [{ data: pedidos }, cds] = await Promise.all([
    supabaseServidor()
      .from("pedidos")
      .select("id, numero, empresa_id, cd_id, status, pagamento, subtotal, frete, total, rastreio, nota_fiscal, criado_em")
      .eq("empresa_id", s.empresa!.id)
      .order("criado_em", { ascending: false })
      .limit(200),
    listarCds(),
  ]);
  const lista = (pedidos as Pedido[] | null) ?? [];
  const nomeCd = (id: string) => cds.find((c) => c.id === id)?.nome ?? id;

  return (
    <>
      <CabecalhoPagina titulo="Meus pedidos" sub="Acompanhe o faturamento, a separação e a entrega" />
      {lista.length === 0 ? (
        <div className="cartao flex flex-col items-center gap-3 p-10 text-center">
          <p className="text-lg">Nenhum pedido ainda.</p>
          <Link href="/portal/kit" className="btn-primario">
            Montar o primeiro kit
          </Link>
        </div>
      ) : (
        <>
          {/* Celular: cartões */}
          <ul className="flex flex-col gap-3 md:hidden">
            {lista.map((p) => (
              <li key={p.id}>
                <Link href={`/portal/pedidos/${p.id}`} className="cartao flex flex-col gap-1 p-4 hover:border-suave">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold">Pedido nº {p.numero}</span>
                    <span className={STATUS_PEDIDO[p.status].chip}>{STATUS_PEDIDO[p.status].rotulo}</span>
                  </span>
                  <span className="text-sm text-suave">
                    {data(p.criado_em)} · {nomeCd(p.cd_id)} · {PAGAMENTOS[p.pagamento]}
                  </span>
                  <span className="font-semibold text-titan">{brl(p.total)}</span>
                </Link>
              </li>
            ))}
          </ul>
          {/* Telas maiores: tabela */}
          <div className="cartao hidden overflow-x-auto md:block">
            <table className="tabela w-full text-sm">
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Data</th>
                  <th>CD</th>
                  <th>Pagamento</th>
                  <th>Situação</th>
                  <th className="text-right">Total</th>
                  <th>
                    <span className="sr-only">Abrir</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lista.map((p) => (
                  <tr key={p.id} className="hover:bg-fundo">
                    <td className="font-semibold">nº {p.numero}</td>
                    <td>{data(p.criado_em)}</td>
                    <td>{nomeCd(p.cd_id)}</td>
                    <td>{PAGAMENTOS[p.pagamento]}</td>
                    <td>
                      <span className={STATUS_PEDIDO[p.status].chip}>{STATUS_PEDIDO[p.status].rotulo}</span>
                    </td>
                    <td className="text-right font-semibold">{brl(p.total)}</td>
                    <td className="text-right">
                      <Link href={`/portal/pedidos/${p.id}`} className="font-semibold text-titan hover:underline">
                        Detalhes
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
