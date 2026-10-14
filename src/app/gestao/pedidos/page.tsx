import Link from "next/link";
import { CabecalhoPagina } from "@/components/Shell";
import { PAGAMENTOS, STATUS_PEDIDO, TODOS_STATUS_PEDIDO, data, nomeEmpresa } from "@/components/gestao/rotulos";
import { limparTermo, listarCdsGestao, sessaoGestao } from "@/components/gestao/servidor";
import { brl } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import type { FormaPagamento, StatusPedido } from "@/lib/tipos";

export const metadata = { title: "Pedidos · Gestão · Titan" };

interface LinhaPedido {
  id: string;
  numero: number;
  status: StatusPedido;
  pagamento: FormaPagamento;
  total: number;
  cd_id: string;
  criado_em: string;
  empresas: { razao_social: string; nome_fantasia: string | null; cidade: string | null; uf: string | null } | null;
}

export default async function Pedidos({ searchParams }: { searchParams: { status?: string; cd?: string; q?: string } }) {
  await sessaoGestao();
  const sb = supabaseServidor();
  const cds = await listarCdsGestao();
  const status = TODOS_STATUS_PEDIDO.find((s) => s === searchParams.status);
  const cd = cds.find((c) => c.id === searchParams.cd)?.id;
  const termo = limparTermo(searchParams.q);

  let consulta = sb
    .from("pedidos")
    .select("id, numero, status, pagamento, total, cd_id, criado_em, empresas!inner(razao_social, nome_fantasia, cidade, uf)")
    .order("criado_em", { ascending: false })
    .limit(300);
  if (status) consulta = consulta.eq("status", status);
  if (cd) consulta = consulta.eq("cd_id", cd);
  if (termo) {
    // Só dígitos e curto = número do pedido; o resto (inclusive CNPJ) busca na empresa.
    if (/^\d{1,9}$/.test(termo)) {
      consulta = consulta.eq("numero", Number(termo));
    } else {
      const t = `%${termo}%`;
      const digitos = termo.replace(/\D/g, "");
      const filtros = [`razao_social.ilike.${t}`, `nome_fantasia.ilike.${t}`];
      if (digitos.length >= 4) filtros.push(`cnpj.ilike.%${digitos}%`);
      consulta = consulta.or(filtros.join(","), { referencedTable: "empresas" });
    }
  }
  const { data: dados } = await consulta;
  const lista = (dados as unknown as LinhaPedido[] | null) ?? [];
  const nomeCd = (id: string) => cds.find((c) => c.id === id)?.nome ?? id;

  return (
    <>
      <CabecalhoPagina titulo="Pedidos" sub="Faturamento, separação, transporte e entrega" />

      <form method="get" className="cartao grid gap-3 p-4 sm:grid-cols-[1fr_180px_200px_auto] sm:items-end" aria-label="Filtros de pedidos">
        <div>
          <label className="rotulo" htmlFor="q">
            Buscar
          </label>
          <input id="q" name="q" type="search" defaultValue={searchParams.q ?? ""} placeholder="Empresa, CNPJ ou nº do pedido" className="campo" />
        </div>
        <div>
          <label className="rotulo" htmlFor="status">
            Situação
          </label>
          <select id="status" name="status" defaultValue={status ?? ""} className="campo">
            <option value="">Todas</option>
            {TODOS_STATUS_PEDIDO.map((s) => (
              <option key={s} value={s}>
                {STATUS_PEDIDO[s].rotulo}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="rotulo" htmlFor="cd">
            CD
          </label>
          <select id="cd" name="cd" defaultValue={cd ?? ""} className="campo">
            <option value="">Todos os CDs</option>
            {cds.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <button className="btn-primario">Filtrar</button>
          <Link href="/gestao/pedidos" className="btn">
            Limpar
          </Link>
        </div>
      </form>

      <p className="text-sm text-suave">
        {lista.length === 300 ? "Mostrando os 300 pedidos mais recentes." : `${lista.length} pedido(s) encontrado(s).`}
      </p>

      {lista.length === 0 ? (
        <p className="cartao p-6 text-center text-suave">Nenhum pedido com esses filtros.</p>
      ) : (
        <div className="cartao overflow-x-auto">
          <table className="tabela w-full min-w-[720px] text-sm">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Empresa</th>
                <th>Data</th>
                <th>CD</th>
                <th>Pagamento</th>
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
                  <td>
                    <p className="font-semibold">{nomeEmpresa(p.empresas)}</p>
                    {p.empresas?.cidade && (
                      <p className="text-xs text-suave">
                        {p.empresas.cidade}/{p.empresas.uf}
                      </p>
                    )}
                  </td>
                  <td>{data(p.criado_em)}</td>
                  <td>{nomeCd(p.cd_id)}</td>
                  <td>{PAGAMENTOS[p.pagamento]}</td>
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
    </>
  );
}
