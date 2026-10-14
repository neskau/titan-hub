import { CabecalhoPagina } from "@/components/Shell";
import { Carrinho } from "@/components/portal/Carrinho";
import { buscarCatalogo, cdAtual, sessaoPortal } from "@/components/portal/servidor";

export const metadata = { title: "Carrinho · Portal do Integrador · Titan" };

export default async function PaginaCarrinho() {
  const s = await sessaoPortal();
  const empresa = s.empresa!;
  const { cd } = await cdAtual(empresa.cd_padrao);
  if (!cd) return <div className="cartao p-6 text-suave">Nenhum centro de distribuição ativo no momento.</div>;

  // Preço e saldo atuais do CD, para conferir o que está guardado no navegador.
  const itens = await buscarCatalogo({ cd: cd.id });
  const atual: Record<string, { preco: number | null; estoque: number | null }> = {};
  for (const i of itens) atual[i.id] = { preco: i.preco, estoque: i.estoque };

  return (
    <>
      <CabecalhoPagina titulo="Carrinho" sub={`Pedido retirado de ${cd.nome} (${cd.uf}) · entrega em ${cd.prazo_entrega} após o faturamento`} />
      <Carrinho
        key={cd.id}
        cd={cd.id}
        nomeCd={cd.nome}
        aprovado={empresa.status === "aprovada"}
        podeBoleto={empresa.pode_boleto}
        empresa={empresa.nome_fantasia || empresa.razao_social}
        vendedora={s.vendedora?.telefone ? { nome: s.vendedora.nome, telefone: s.vendedora.telefone } : null}
        atual={atual}
      />
    </>
  );
}
