import Link from "next/link";
import { CabecalhoPagina } from "@/components/Shell";
import { obterSessao } from "@/lib/sessao";
import { CascaPublica } from "@/components/portal/CascaPublica";
import { FiltrosCatalogo } from "@/components/portal/FiltrosCatalogo";
import { ListaProdutos } from "@/components/portal/ListaProdutos";
import { buscarCatalogo, categoriaValida, cdAtual, urlDatasheet } from "@/components/portal/servidor";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Catálogo · Titan Distribuidora Solar",
  description: "Módulos, inversores, estruturas e materiais elétricos para integradores solares. Matriz em Cascavel – PR e filial em Piracicaba – SP.",
};

export default async function CatalogoPublico({ searchParams }: { searchParams: { q?: string; categoria?: string } }) {
  const sessao = await obterSessao();
  const { cd } = await cdAtual(sessao?.empresa?.cd_padrao);
  const q = (searchParams.q ?? "").trim();
  const categoria = categoriaValida(searchParams.categoria);
  const itens = cd ? await buscarCatalogo({ cd: cd.id, q, categoria }) : [];
  const datasheets: Record<string, string> = {};
  for (const i of itens) {
    const u = urlDatasheet(i.datasheet_path);
    if (u) datasheets[i.id] = u;
  }
  const destino = sessao ? (sessao.perfil.papel === "integrador" ? "/portal" : "/gestao") : null;

  return (
    <CascaPublica
      acoes={
        destino ? (
          <Link href={destino} className="btn-primario py-1.5 text-sm">
            {destino === "/portal" ? "Ir ao portal" : "Ir à gestão"}
          </Link>
        ) : (
          <>
            <Link href="/entrar" className="text-sm font-semibold text-white/80 hover:text-white">
              Entrar
            </Link>
            <Link href="/cadastro" className="btn-primario py-1.5 text-sm">
              Quero ser cliente
            </Link>
          </>
        )
      }
    >
      <CabecalhoPagina
        titulo="Catálogo de produtos"
        sub="Equipamentos fotovoltaicos para integradores, com saída da matriz em Cascavel – PR e da filial em Piracicaba – SP"
      />
      {!sessao && (
        <div className="cartao flex flex-wrap items-center gap-3 border-titan/30 bg-titan-tinta px-4 py-3">
          <p className="flex-1 text-sm">
            <span className="font-semibold">É integrador solar?</span> Cadastre o CNPJ da sua empresa para ver preços, estoque em tempo real e comprar pelo portal.
          </p>
          <Link href="/cadastro" className="btn-primario text-sm">
            Cadastrar empresa
          </Link>
        </div>
      )}
      <FiltrosCatalogo base="/catalogo" q={q} categoria={categoria} total={itens.length} />
      <ListaProdutos itens={itens} datasheets={datasheets} modo={{ tipo: "publico", logado: Boolean(sessao) }} />
    </CascaPublica>
  );
}
