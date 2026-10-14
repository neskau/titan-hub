import Link from "next/link";
import { CabecalhoPagina } from "@/components/Shell";
import { FormProduto, PRODUTO_VAZIO } from "@/components/gestao/FormProduto";
import { sessaoGestao } from "@/components/gestao/servidor";

export const metadata = { title: "Novo produto · Gestão · Titan" };

export default async function NovoProduto() {
  await sessaoGestao();
  return (
    <>
      <Link href="/gestao/produtos" className="text-sm font-semibold text-titan hover:underline">
        ← Produtos
      </Link>
      <CabecalhoPagina titulo="Novo produto" sub="Depois de cadastrar você poderá enviar o datasheet em PDF" />
      <div className="max-w-3xl">
        <FormProduto inicial={PRODUTO_VAZIO} />
      </div>
    </>
  );
}
