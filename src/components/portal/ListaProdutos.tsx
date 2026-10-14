import Link from "next/link";
import { brl } from "@/lib/formato";
import type { ItemCatalogo } from "@/lib/tipos";
import { ChipEstoque } from "./ChipEstoque";
import { AdicionarCarrinho } from "./AdicionarCarrinho";

type Modo =
  | { tipo: "publico"; logado: boolean }
  | { tipo: "portal"; aprovado: boolean; cd: string };

/** Grade de produtos do catálogo (público ou portal). */
export function ListaProdutos({
  itens,
  datasheets,
  modo,
}: {
  itens: ItemCatalogo[];
  datasheets: Record<string, string>;
  modo: Modo;
}) {
  if (itens.length === 0) {
    return (
      <div className="cartao p-8 text-center text-suave">
        Nenhum produto encontrado. Tente outra busca ou outra categoria.
      </div>
    );
  }

  return (
    <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]">
      {itens.map((p) => {
        const datasheet = datasheets[p.id];
        return (
          <li key={p.id} className="cartao flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="chip bg-titan-tinta text-titan">{p.categoria}</span>
              <ChipEstoque estoque={p.estoque} unidade={p.unidade} />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold leading-snug">{p.nome}</h2>
              <p className="text-sm text-suave">
                {p.marca} · SKU {p.sku}
              </p>
              {p.especificacao && <p className="mt-1 text-sm">{p.especificacao}</p>}
              {datasheet && (
                <a href={datasheet} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-sm font-semibold text-titan underline-offset-2 hover:underline">
                  Ver datasheet (PDF)
                </a>
              )}
            </div>
            <Preco item={p} modo={modo} />
            {modo.tipo === "portal" && modo.aprovado && p.preco != null && (
              <AdicionarCarrinho
                cd={modo.cd}
                estoque={p.estoque}
                produto={{ produto_id: p.id, sku: p.sku, nome: p.nome, marca: p.marca, unidade: p.unidade, preco: p.preco }}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Preco({ item, modo }: { item: ItemCatalogo; modo: Modo }) {
  if (item.preco != null) {
    return (
      <p className="text-xl font-semibold text-titan">
        {brl(item.preco)} <span className="text-sm font-normal text-suave">/ {item.unidade}</span>
      </p>
    );
  }
  if (modo.tipo === "publico") {
    return modo.logado ? (
      <p className="text-sm text-suave">Preço liberado após a aprovação do cadastro</p>
    ) : (
      <Link href="/entrar?voltar=/portal" className="btn w-full border-titan text-titan">
        Entre para ver o preço
      </Link>
    );
  }
  return (
    <p className="text-sm text-suave">{modo.aprovado ? "Preço sob consulta com sua vendedora" : "Preço liberado após a aprovação do cadastro"}</p>
  );
}
