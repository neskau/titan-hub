import Link from "next/link";
import { notFound } from "next/navigation";
import { CabecalhoPagina } from "@/components/Shell";
import { brl, num } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import { ETAPAS_PEDIDO, type Pedido } from "@/lib/tipos";
import { PAGAMENTOS, STATUS_PEDIDO } from "@/components/portal/categorias";
import { LinhaDoTempo } from "@/components/portal/LinhaDoTempo";
import { listarCds, sessaoPortal } from "@/components/portal/servidor";

export const metadata = { title: "Pedido · Portal do Integrador · Titan" };

interface PedidoDetalhe extends Pedido {
  cep_entrega: string | null;
  observacao: string | null;
  atualizado_em: string;
  pedido_itens: {
    quantidade: number;
    preco_unitario: number;
    produtos: { nome: string; sku: string; marca: string; unidade: string } | null;
  }[];
}

const dataHora = (s: string) =>
  new Date(s).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

export default async function DetalhePedido({ params, searchParams }: { params: { id: string }; searchParams: { novo?: string } }) {
  await sessaoPortal();
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();

  const [{ data }, cds] = await Promise.all([
    supabaseServidor()
      .from("pedidos")
      .select("*, pedido_itens(quantidade, preco_unitario, produtos(nome, sku, marca, unidade))")
      .eq("id", params.id)
      .maybeSingle(),
    listarCds(),
  ]);
  const p = data as PedidoDetalhe | null;
  if (!p) notFound();
  const cd = cds.find((c) => c.id === p.cd_id);
  const cep = p.cep_entrega && p.cep_entrega.length === 8 ? `${p.cep_entrega.slice(0, 5)}-${p.cep_entrega.slice(5)}` : p.cep_entrega;

  return (
    <>
      <Link href="/portal/pedidos" className="text-sm font-semibold text-titan hover:underline">
        ← Meus pedidos
      </Link>
      <CabecalhoPagina
        titulo={`Pedido nº ${p.numero}`}
        sub={`Feito em ${dataHora(p.criado_em)} · ${cd?.nome ?? p.cd_id}`}
        acoes={<span className={STATUS_PEDIDO[p.status].chip}>{STATUS_PEDIDO[p.status].rotulo}</span>}
      />

      {searchParams.novo && (
        <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
          <p className="font-semibold">Pedido recebido!</p>
          <p className="text-sm">A equipe Titan vai confirmar o frete e o faturamento. Você acompanha cada etapa por aqui.</p>
        </div>
      )}

      <section className="cartao p-4" aria-label="Etapas do pedido">
        <LinhaDoTempo status={p.status} etapas={ETAPAS_PEDIDO} />
      </section>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <section className="cartao min-w-0 overflow-x-auto" aria-label="Itens do pedido">
          <table className="tabela w-full min-w-[480px] text-sm">
            <thead>
              <tr>
                <th>Produto</th>
                <th className="text-right">Qtd.</th>
                <th className="text-right">Unitário</th>
                <th className="text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {p.pedido_itens.map((i, n) => (
                <tr key={i.produtos?.sku ?? n}>
                  <td>
                    <p className="font-semibold">{i.produtos?.nome ?? "Produto removido"}</p>
                    {i.produtos && (
                      <p className="text-xs text-suave">
                        {i.produtos.marca} · SKU {i.produtos.sku}
                      </p>
                    )}
                  </td>
                  <td className="text-right">
                    {num(i.quantidade)} {i.produtos?.unidade ?? "un"}
                  </td>
                  <td className="text-right">{brl(Number(i.preco_unitario))}</td>
                  <td className="text-right font-semibold">{brl(Number(i.preco_unitario) * i.quantidade)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <aside className="flex flex-col gap-4">
          <dl className="cartao flex flex-col gap-1 p-4 text-sm">
            <Linha rotulo="Subtotal" valor={brl(Number(p.subtotal))} />
            <Linha rotulo="Frete" valor={Number(p.frete) > 0 ? brl(Number(p.frete)) : p.status === "recebido" ? "a calcular pela equipe" : "—"} />
            <div className="mt-1 flex justify-between border-t border-linha pt-2 text-base">
              <dt>Total</dt>
              <dd className="font-semibold text-titan">{brl(Number(p.total))}</dd>
            </div>
          </dl>
          <dl className="cartao flex flex-col gap-1 p-4 text-sm">
            <Linha rotulo="Pagamento" valor={PAGAMENTOS[p.pagamento]} />
            {cep && <Linha rotulo="CEP de entrega" valor={cep} />}
            {cd && <Linha rotulo="Prazo de entrega" valor={cd.prazo_entrega} />}
            {p.nota_fiscal && <Linha rotulo="Nota fiscal" valor={p.nota_fiscal} />}
            {p.rastreio && <Linha rotulo="Rastreio" valor={p.rastreio} />}
            {p.observacao && (
              <div className="mt-2 border-t border-linha pt-2">
                <dt className="text-suave">Observação</dt>
                <dd className="whitespace-pre-line">{p.observacao}</dd>
              </div>
            )}
          </dl>
        </aside>
      </div>
    </>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-suave">{rotulo}</dt>
      <dd className="text-right font-semibold [overflow-wrap:anywhere]">{valor}</dd>
    </div>
  );
}
