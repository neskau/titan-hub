import Link from "next/link";
import { CabecalhoPagina } from "@/components/Shell";
import { CATEGORIAS } from "@/components/gestao/rotulos";
import { limparTermo, sessaoGestao, urlDatasheet } from "@/components/gestao/servidor";
import { brl } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import type { Categoria } from "@/lib/tipos";

export const metadata = { title: "Produtos e datasheets · Gestão · Titan" };

interface LinhaProduto {
  id: string;
  sku: string;
  nome: string;
  marca: string;
  categoria: Categoria;
  especificacao: string | null;
  datasheet_path: string | null;
  ativo: boolean;
  precos: { preco_base: number } | null;
}

export default async function Produtos({ searchParams }: { searchParams: { categoria?: string; ativo?: string; q?: string } }) {
  await sessaoGestao();
  const categoria = CATEGORIAS.find((c) => c === searchParams.categoria);
  const ativo = searchParams.ativo === "sim" ? true : searchParams.ativo === "nao" ? false : undefined;
  const termo = limparTermo(searchParams.q);

  let consulta = supabaseServidor()
    .from("produtos")
    .select("id, sku, nome, marca, categoria, especificacao, datasheet_path, ativo, precos(preco_base)")
    .order("categoria")
    .order("nome")
    .limit(2000);
  if (categoria) consulta = consulta.eq("categoria", categoria);
  if (ativo !== undefined) consulta = consulta.eq("ativo", ativo);
  if (termo) {
    const t = `%${termo}%`;
    consulta = consulta.or(`nome.ilike.${t},marca.ilike.${t},sku.ilike.${t}`);
  }
  const { data } = await consulta;
  const lista = (data as unknown as LinhaProduto[] | null) ?? [];
  const semDatasheet = lista.filter((p) => p.ativo && !p.datasheet_path).length;

  return (
    <>
      <CabecalhoPagina
        titulo="Produtos e datasheets"
        sub={`${lista.length} produto(s)${semDatasheet ? ` · ${semDatasheet} ativo(s) sem datasheet` : ""}`}
        acoes={
          <Link href="/gestao/produtos/novo" className="btn-primario">
            Novo produto
          </Link>
        }
      />

      <form method="get" className="cartao grid gap-3 p-4 sm:grid-cols-[1fr_180px_150px_auto] sm:items-end" aria-label="Filtros de produtos">
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
          <label className="rotulo" htmlFor="ativo">
            Situação
          </label>
          <select id="ativo" name="ativo" defaultValue={searchParams.ativo ?? ""} className="campo">
            <option value="">Todos</option>
            <option value="sim">Ativos</option>
            <option value="nao">Inativos</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button className="btn-primario">Filtrar</button>
          <Link href="/gestao/produtos" className="btn">
            Limpar
          </Link>
        </div>
      </form>

      {lista.length === 0 ? (
        <p className="cartao p-6 text-center text-suave">Nenhum produto com esses filtros.</p>
      ) : (
        <div className="cartao overflow-x-auto">
          <table className="tabela w-full min-w-[720px] text-sm">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Categoria</th>
                <th className="text-right">Preço base</th>
                <th>Datasheet</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => {
                const url = urlDatasheet(p.datasheet_path);
                return (
                  <tr key={p.id} className="hover:bg-fundo">
                    <td>
                      <Link href={`/gestao/produtos/${p.id}`} className="font-semibold text-titan hover:underline">
                        {p.nome}
                      </Link>
                      <p className="text-xs text-suave">
                        {p.marca} · SKU {p.sku}
                        {p.especificacao ? ` · ${p.especificacao}` : ""}
                      </p>
                    </td>
                    <td>{p.categoria}</td>
                    <td className="text-right font-semibold">
                      {p.precos ? brl(Number(p.precos.preco_base)) : <span className="chip-alerta">Sem preço</span>}
                    </td>
                    <td>
                      {url ? (
                        <a href={url} target="_blank" rel="noreferrer" className="font-semibold text-titan hover:underline">
                          PDF
                        </a>
                      ) : (
                        <span className="text-suave">—</span>
                      )}
                    </td>
                    <td>{p.ativo ? <span className="chip-ok">Ativo</span> : <span className="chip-erro">Inativo</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
