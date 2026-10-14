import Link from "next/link";
import { notFound } from "next/navigation";
import { CabecalhoPagina } from "@/components/Shell";
import { EnvioDatasheet } from "@/components/gestao/EnvioDatasheet";
import { FormProduto, type DadosProduto } from "@/components/gestao/FormProduto";
import { Aviso } from "@/components/gestao/Aviso";
import { situacaoEstoque, dataHora } from "@/components/gestao/rotulos";
import { ehUuid, listarCdsGestao, sessaoGestao, urlDatasheet } from "@/components/gestao/servidor";
import { num } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import type { Categoria, Fase, TipoTelhado } from "@/lib/tipos";

export const metadata = { title: "Produto · Gestão · Titan" };

interface ProdutoCompleto {
  id: string;
  sku: string;
  nome: string;
  marca: string;
  categoria: Categoria;
  especificacao: string | null;
  potencia_w: number | null;
  potencia_kw: number | null;
  fase: Fase | null;
  modulos_por_estrutura: number | null;
  tipo_telhado: TipoTelhado | null;
  unidade: string;
  datasheet_path: string | null;
  imagem_path: string | null;
  ativo: boolean;
  bling_produto_id: number | null;
  atualizado_em: string;
  precos: { preco_base: number } | null;
  estoque: { cd_id: string; quantidade: number; minimo: number }[];
}

const texto = (n: number | null) => (n == null ? "" : String(n).replace(".", ","));

export default async function EditarProduto({ params, searchParams }: { params: { id: string }; searchParams: { novo?: string } }) {
  await sessaoGestao();
  if (!ehUuid(params.id)) notFound();
  const [{ data }, cds] = await Promise.all([
    supabaseServidor()
      .from("produtos")
      .select("*, precos(preco_base), estoque(cd_id, quantidade, minimo)")
      .eq("id", params.id)
      .maybeSingle(),
    listarCdsGestao(),
  ]);
  const p = data as unknown as ProdutoCompleto | null;
  if (!p) notFound();

  const inicial: DadosProduto = {
    id: p.id,
    sku: p.sku,
    nome: p.nome,
    marca: p.marca,
    categoria: p.categoria,
    especificacao: p.especificacao ?? "",
    unidade: p.unidade,
    imagem_path: p.imagem_path ?? "",
    potencia_w: texto(p.potencia_w),
    potencia_kw: texto(p.potencia_kw),
    fase: p.fase ?? "",
    modulos_por_estrutura: texto(p.modulos_por_estrutura),
    tipo_telhado: p.tipo_telhado ?? "",
    preco: p.precos ? Number(p.precos.preco_base).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "",
    ativo: p.ativo,
  };

  return (
    <>
      <Link href="/gestao/produtos" className="text-sm font-semibold text-titan hover:underline">
        ← Produtos
      </Link>
      <CabecalhoPagina
        titulo={p.nome}
        sub={`${p.categoria} · ${p.marca} · SKU ${p.sku} · atualizado em ${dataHora(p.atualizado_em)}`}
        acoes={p.ativo ? <span className="chip-ok">Ativo</span> : <span className="chip-erro">Inativo</span>}
      />
      {searchParams.novo && <Aviso tipo="ok">Produto cadastrado. Agora envie o datasheet e ajuste o estoque nos CDs.</Aviso>}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <FormProduto inicial={inicial} />
        </div>
        <aside className="flex flex-col gap-4">
          <EnvioDatasheet produtoId={p.id} atual={p.datasheet_path} urlAtual={urlDatasheet(p.datasheet_path)} />
          <section className="cartao flex flex-col gap-2 p-4 text-sm" aria-label="Estoque nos CDs">
            <h2 className="font-semibold">Estoque nos CDs</h2>
            {cds
              .filter((c) => c.ativo || p.estoque.some((e) => e.cd_id === c.id))
              .map((c) => {
                const e = p.estoque.find((x) => x.cd_id === c.id) ?? { quantidade: 0, minimo: 0 };
                const sit = situacaoEstoque(e.quantidade, e.minimo);
                return (
                  <div key={c.id} className="flex items-center justify-between gap-2">
                    <span>
                      {c.nome}
                      <span className="block text-xs text-suave">
                        {num(e.quantidade)} {p.unidade} · mín. {num(e.minimo)}
                      </span>
                    </span>
                    <span className={sit.chip}>{sit.rotulo}</span>
                  </div>
                );
              })}
            <Link href={`/gestao/estoque?q=${encodeURIComponent(p.sku)}`} className="mt-1 font-semibold text-titan hover:underline">
              Ajustar estoque
            </Link>
          </section>
          {p.bling_produto_id && (
            <p className="text-xs text-suave">Vinculado ao produto {p.bling_produto_id} no Bling.</p>
          )}
        </aside>
      </div>
    </>
  );
}
