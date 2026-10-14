import { CabecalhoPagina } from "@/components/Shell";
import { FiltrosCatalogo } from "@/components/portal/FiltrosCatalogo";
import { ListaProdutos } from "@/components/portal/ListaProdutos";
import { buscarCatalogo, categoriaValida, cdAtual, sessaoPortal, urlDatasheet } from "@/components/portal/servidor";

export const metadata = { title: "Catálogo · Portal do Integrador · Titan" };

export default async function CatalogoPortal({ searchParams }: { searchParams: { q?: string; categoria?: string } }) {
  const s = await sessaoPortal();
  const { cd } = await cdAtual(s.empresa?.cd_padrao);
  const aprovado = s.empresa?.status === "aprovada";
  const q = (searchParams.q ?? "").trim();
  const categoria = categoriaValida(searchParams.categoria);

  if (!cd) {
    return <div className="cartao p-6 text-suave">Nenhum centro de distribuição ativo no momento.</div>;
  }

  const itens = await buscarCatalogo({ cd: cd.id, q, categoria });
  const datasheets: Record<string, string> = {};
  for (const i of itens) {
    const u = urlDatasheet(i.datasheet_path);
    if (u) datasheets[i.id] = u;
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Catálogo"
        sub={aprovado ? `Preços e estoque de ${cd.nome} (${cd.uf}) · entrega em ${cd.prazo_entrega}` : `Produtos disponíveis em ${cd.nome} (${cd.uf})`}
      />
      <FiltrosCatalogo base="/portal" q={q} categoria={categoria} total={itens.length} />
      <ListaProdutos itens={itens} datasheets={datasheets} modo={{ tipo: "portal", aprovado, cd: cd.id }} />
    </>
  );
}
