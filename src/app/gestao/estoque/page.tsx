import Link from "next/link";
import { CabecalhoPagina } from "@/components/Shell";
import { CelulaEstoque } from "@/components/gestao/CelulaEstoque";
import { FormTransferencia } from "@/components/gestao/FormTransferencia";
import { CATEGORIAS, situacaoEstoque } from "@/components/gestao/rotulos";
import { limparTermo, listarCdsGestao, sessaoGestao } from "@/components/gestao/servidor";
import { supabaseServidor } from "@/lib/supabase/server";
import type { Categoria } from "@/lib/tipos";

export const metadata = { title: "Estoque por CD · Gestão · Titan" };

interface ProdutoEstoque {
  id: string;
  sku: string;
  nome: string;
  marca: string;
  categoria: Categoria;
  unidade: string;
  estoque: { cd_id: string; quantidade: number; minimo: number }[];
}

export default async function Estoque({
  searchParams,
}: {
  searchParams: { alertas?: string; cd?: string; categoria?: string; q?: string };
}) {
  await sessaoGestao();
  const todosCds = await listarCdsGestao();
  const cdsAtivos = todosCds.filter((c) => c.ativo);
  const cdFiltro = cdsAtivos.find((c) => c.id === searchParams.cd);
  const cds = cdFiltro ? [cdFiltro] : cdsAtivos;
  const soAlertas = searchParams.alertas === "1";
  const categoria = CATEGORIAS.find((c) => c === searchParams.categoria);
  const termo = limparTermo(searchParams.q);

  let consulta = supabaseServidor()
    .from("produtos")
    .select("id, sku, nome, marca, categoria, unidade, estoque(cd_id, quantidade, minimo)")
    .eq("ativo", true)
    .order("categoria")
    .order("nome")
    .limit(2000);
  if (categoria) consulta = consulta.eq("categoria", categoria);
  if (termo) {
    const t = `%${termo}%`;
    consulta = consulta.or(`nome.ilike.${t},marca.ilike.${t},sku.ilike.${t}`);
  }
  const { data } = await consulta;
  const produtos = (data as ProdutoEstoque[] | null) ?? [];

  const celula = (p: ProdutoEstoque, cd: string) => p.estoque.find((e) => e.cd_id === cd) ?? { cd_id: cd, quantidade: 0, minimo: 0 };
  const emAlerta = (p: ProdutoEstoque) => cds.some((c) => {
    const e = celula(p, c.id);
    return situacaoEstoque(e.quantidade, e.minimo).alerta;
  });
  const linhas = soAlertas ? produtos.filter(emAlerta) : produtos;
  const totalAlertas = produtos.reduce(
    (acc, p) => acc + cds.filter((c) => situacaoEstoque(celula(p, c.id).quantidade, celula(p, c.id).minimo).alerta).length,
    0
  );

  const saldos: Record<string, number> = {};
  for (const p of produtos) for (const e of p.estoque) saldos[`${p.id}|${e.cd_id}`] = e.quantidade;

  const qs = (extra: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    const base = { cd: cdFiltro?.id, categoria, q: searchParams.q, alertas: soAlertas ? "1" : undefined, ...extra };
    for (const [k, v] of Object.entries(base)) if (v) u.set(k, v);
    const s = u.toString();
    return s ? `?${s}` : "";
  };

  return (
    <>
      <CabecalhoPagina
        titulo="Estoque por CD"
        sub={`${totalAlertas} posição(ões) zerada(s) ou abaixo do mínimo`}
        acoes={
          <Link href={`/gestao/estoque${qs({ alertas: soAlertas ? undefined : "1" })}`} className={soAlertas ? "btn-primario" : "btn"} aria-pressed={soAlertas}>
            {soAlertas ? "✓ Só alertas" : "Só alertas"}
          </Link>
        }
      />

      <form method="get" className="cartao grid gap-3 p-4 sm:grid-cols-[1fr_180px_180px_auto] sm:items-end" aria-label="Filtros de estoque">
        <div>
          <label className="rotulo" htmlFor="q">
            Buscar
          </label>
          <input id="q" name="q" type="search" defaultValue={searchParams.q ?? ""} placeholder="Nome, marca ou SKU" className="campo" />
        </div>
        <div>
          <label className="rotulo" htmlFor="categoria">
            Categoria
          </label>
          <select id="categoria" name="categoria" defaultValue={categoria ?? ""} className="campo">
            <option value="">Todas</option>
            {CATEGORIAS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="rotulo" htmlFor="cd">
            CD
          </label>
          <select id="cd" name="cd" defaultValue={cdFiltro?.id ?? ""} className="campo">
            <option value="">Todos os CDs</option>
            {cdsAtivos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="alertas" value="1" defaultChecked={soAlertas} className="h-4 w-4 accent-titan" />
            Só alertas
          </label>
          <button className="btn-primario">Filtrar</button>
          <Link href="/gestao/estoque" className="btn">
            Limpar
          </Link>
        </div>
      </form>

      {linhas.length === 0 ? (
        <p className="cartao p-6 text-center text-suave">{soAlertas ? "Nenhum item em alerta. Tudo certo!" : "Nenhum produto ativo com esses filtros."}</p>
      ) : (
        <div className="cartao overflow-x-auto">
          <table className="tabela w-full text-sm" style={{ minWidth: 280 + cds.length * 230 }}>
            <thead>
              <tr>
                <th>Produto</th>
                {cds.map((c) => (
                  <th key={c.id}>
                    {c.nome} – {c.uf}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/gestao/produtos/${p.id}`} className="font-semibold hover:text-titan hover:underline">
                      {p.nome}
                    </Link>
                    <p className="text-xs text-suave">
                      {p.categoria} · {p.marca} · SKU {p.sku} · {p.unidade}
                    </p>
                  </td>
                  {cds.map((c) => {
                    const e = celula(p, c.id);
                    return (
                      <td key={c.id}>
                        <CelulaEstoque
                          key={`${e.quantidade}|${e.minimo}`}
                          produtoId={p.id}
                          produtoNome={p.nome}
                          cdId={c.id}
                          cdNome={c.nome}
                          quantidade={e.quantidade}
                          minimo={e.minimo}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-suave">
        Cada ajuste manual de saldo fica registrado no histórico de movimentos (motivo &quot;ajuste&quot;) com a diferença e quem fez.
      </p>

      <section className="cartao flex flex-col gap-3 p-4" aria-labelledby="transferir">
        <h2 id="transferir" className="font-semibold">
          Transferir entre CDs
        </h2>
        <FormTransferencia
          produtos={produtos.map((p) => ({ id: p.id, nome: p.nome, sku: p.sku }))}
          cds={cdsAtivos.map((c) => ({ id: c.id, nome: c.nome }))}
          saldos={saldos}
        />
      </section>
    </>
  );
}
