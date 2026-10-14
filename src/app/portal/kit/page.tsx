import { CabecalhoPagina } from "@/components/Shell";
import { MontadorKit } from "@/components/portal/MontadorKit";
import { buscarCatalogo, cdAtual, sessaoPortal } from "@/components/portal/servidor";

export const metadata = { title: "Monte seu kit · Portal do Integrador · Titan" };

export default async function PaginaKit() {
  const s = await sessaoPortal();
  const { cd } = await cdAtual(s.empresa?.cd_padrao);
  if (!cd) return <div className="cartao p-6 text-suave">Nenhum centro de distribuição ativo no momento.</div>;

  const itens = await buscarCatalogo({ cd: cd.id });
  const eletrica = itens.filter((i) => i.categoria === "Elétrica");
  const contem = (t: string) => eletrica.find((i) => i.nome.toLowerCase().includes(t.toLowerCase())) ?? null;

  return (
    <>
      <CabecalhoPagina titulo="Monte seu kit" sub={`Kit fotovoltaico on-grid com os produtos de ${cd.nome} (${cd.uf})`} />
      <MontadorKit
        key={cd.id}
        cd={cd.id}
        aprovado={s.empresa?.status === "aprovada"}
        modulos={itens.filter((i) => i.categoria === "Módulos" && (i.potencia_w ?? 0) > 0)}
        inversores={itens.filter((i) => i.categoria === "Inversores")}
        estruturas={itens.filter((i) => i.categoria === "Estruturas")}
        cabo={contem("Cabo")}
        conector={contem("MC4")}
        stringBox={contem("String Box")}
      />
    </>
  );
}
