import Link from "next/link";
import { notFound } from "next/navigation";
import { CabecalhoPagina } from "@/components/Shell";
import { LinhaDoTempo } from "@/components/portal/LinhaDoTempo";
import { AcoesPedido } from "@/components/gestao/AcoesPedido";
import { Linha } from "@/components/gestao/Linha";
import { PAGAMENTOS, STATUS_PEDIDO, dataHora, nomeEmpresa } from "@/components/gestao/rotulos";
import { ehUuid, listarCdsGestao, sessaoGestao } from "@/components/gestao/servidor";
import { brl, formatarCnpj, num } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import { ETAPAS_PEDIDO, type Pedido } from "@/lib/tipos";

export const metadata = { title: "Pedido · Gestão · Titan" };

interface PedidoDetalhe extends Pedido {
  cep_entrega: string | null;
  observacao: string | null;
  atualizado_em: string;
  bling_pedido_id: number | null;
  empresas: { id: string; razao_social: string; nome_fantasia: string | null; cnpj: string; cidade: string | null; uf: string | null; telefone: string | null } | null;
  perfis: { nome: string; email: string; telefone: string | null } | null;
  pedido_itens: {
    quantidade: number;
    preco_unitario: number;
    produtos: { id: string; nome: string; sku: string; marca: string; unidade: string } | null;
  }[];
}

export default async function DetalhePedidoGestao({ params }: { params: { id: string } }) {
  await sessaoGestao();
  if (!ehUuid(params.id)) notFound();
  const [{ data }, cds] = await Promise.all([
    supabaseServidor()
      .from("pedidos")
      .select(
        "*, empresas(id, razao_social, nome_fantasia, cnpj, cidade, uf, telefone), perfis(nome, email, telefone), pedido_itens(quantidade, preco_unitario, produtos(id, nome, sku, marca, unidade))"
      )
      .eq("id", params.id)
      .maybeSingle(),
    listarCdsGestao(),
  ]);
  const p = data as unknown as PedidoDetalhe | null;
  if (!p) notFound();
  const cd = cds.find((c) => c.id === p.cd_id);
  const cep = p.cep_entrega && p.cep_entrega.length === 8 ? `${p.cep_entrega.slice(0, 5)}-${p.cep_entrega.slice(5)}` : p.cep_entrega;

  return (
    <>
      <Link href="/gestao/pedidos" className="text-sm font-semibold text-titan hover:underline">
        ← Pedidos
      </Link>
      <CabecalhoPagina
        titulo={`Pedido nº ${p.numero}`}
        sub={`${nomeEmpresa(p.empresas)} · ${dataHora(p.criado_em)} · ${cd?.nome ?? p.cd_id}`}
        acoes={<span className={STATUS_PEDIDO[p.status].chip}>{STATUS_PEDIDO[p.status].rotulo}</span>}
      />

      <section className="cartao p-4" aria-label="Etapas do pedido">
        {p.status === "cancelado" ? (
          <p className="font-semibold text-red-700">Pedido cancelado. O estoque dos itens foi devolvido ao CD {cd?.nome ?? p.cd_id}.</p>
        ) : (
          <LinhaDoTempo status={p.status} etapas={ETAPAS_PEDIDO} />
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <section className="cartao min-w-0 overflow-x-auto" aria-label="Itens do pedido">
            <table className="tabela w-full min-w-[520px] text-sm">
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
                  <tr key={i.produtos?.id ?? n}>
                    <td>
                      {i.produtos ? (
                        <Link href={`/gestao/produtos/${i.produtos.id}`} className="font-semibold hover:text-titan hover:underline">
                          {i.produtos.nome}
                        </Link>
                      ) : (
                        <p className="font-semibold">Produto removido</p>
                      )}
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
              <tfoot className="text-sm">
                <tr>
                  <td colSpan={3} className="text-right text-suave">
                    Subtotal
                  </td>
                  <td className="text-right font-semibold">{brl(Number(p.subtotal))}</td>
                </tr>
                <tr>
                  <td colSpan={3} className="text-right text-suave">
                    Frete
                  </td>
                  <td className="text-right font-semibold">{brl(Number(p.frete))}</td>
                </tr>
                <tr>
                  <td colSpan={3} className="text-right">
                    Total
                  </td>
                  <td className="text-right text-base font-semibold text-titan">{brl(Number(p.total))}</td>
                </tr>
              </tfoot>
            </table>
          </section>

          <div className="grid gap-5 md:grid-cols-2">
            <dl className="cartao flex flex-col gap-1 p-4 text-sm">
              <h2 className="mb-1 font-semibold">Cliente</h2>
              {p.empresas && (
                <>
                  <Linha
                    rotulo="Empresa"
                    valor={
                      <Link href={`/gestao/integradores/${p.empresas.id}`} className="text-titan hover:underline">
                        {nomeEmpresa(p.empresas)}
                      </Link>
                    }
                  />
                  <Linha rotulo="CNPJ" valor={formatarCnpj(p.empresas.cnpj)} />
                  {p.empresas.cidade && <Linha rotulo="Cidade" valor={`${p.empresas.cidade}/${p.empresas.uf ?? ""}`} />}
                </>
              )}
              {p.perfis && <Linha rotulo="Comprador" valor={p.perfis.nome} />}
              {p.perfis && <Linha rotulo="E-mail" valor={p.perfis.email} />}
              {(p.perfis?.telefone || p.empresas?.telefone) && <Linha rotulo="Telefone" valor={p.perfis?.telefone || p.empresas?.telefone || ""} />}
            </dl>
            <dl className="cartao flex flex-col gap-1 p-4 text-sm">
              <h2 className="mb-1 font-semibold">Pedido</h2>
              <Linha rotulo="Pagamento" valor={PAGAMENTOS[p.pagamento]} />
              <Linha rotulo="CD" valor={cd ? `${cd.nome} – ${cd.uf}` : p.cd_id} />
              {cep && <Linha rotulo="CEP de entrega" valor={cep} />}
              <Linha rotulo="Atualizado em" valor={dataHora(p.atualizado_em)} />
              {p.bling_pedido_id && <Linha rotulo="Pedido no Bling" valor={String(p.bling_pedido_id)} />}
              {p.observacao && (
                <div className="mt-2 border-t border-linha pt-2">
                  <dt className="text-suave">Observação do cliente</dt>
                  <dd className="whitespace-pre-line">{p.observacao}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        <aside>
          <AcoesPedido
            id={p.id}
            status={p.status}
            subtotal={Number(p.subtotal)}
            frete={Number(p.frete)}
            rastreio={p.rastreio}
            notaFiscal={p.nota_fiscal}
          />
        </aside>
      </div>
    </>
  );
}
