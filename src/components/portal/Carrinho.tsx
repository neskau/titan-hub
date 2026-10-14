"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { brl, linkWhatsapp, num, soDigitos } from "@/lib/formato";
import type { FormaPagamento } from "@/lib/tipos";
import { fecharPedido } from "@/app/portal/carrinho/acoes";
import { PAGAMENTOS } from "./categorias";
import { useCarrinho } from "./useCarrinho";

function formatarCep(s: string) {
  const d = soDigitos(s).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export function Carrinho({
  cd,
  nomeCd,
  aprovado,
  podeBoleto,
  empresa,
  vendedora,
  atual,
}: {
  cd: string;
  nomeCd: string;
  aprovado: boolean;
  podeBoleto: boolean;
  empresa: string;
  vendedora: { nome: string; telefone: string } | null;
  atual: Record<string, { preco: number | null; estoque: number | null }>;
}) {
  const router = useRouter();
  const { itens, pronto, definirQuantidade, remover, limpar, atualizarPrecos } = useCarrinho(cd);
  const [pagamento, setPagamento] = useState<FormaPagamento>("pix");
  const [cep, setCep] = useState("");
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  // Mantém o preço guardado no navegador igual ao preço atual do CD.
  useEffect(() => {
    if (!pronto) return;
    const mudou: Record<string, number | null> = {};
    for (const i of itens) {
      const a = atual[i.produto_id];
      if (a && a.preco !== i.preco) mudou[i.produto_id] = a.preco;
    }
    if (Object.keys(mudou).length) atualizarPrecos(mudou);
  }, [pronto, itens, atual, atualizarPrecos]);

  const pagamentos: FormaPagamento[] = podeBoleto ? ["pix", "cartao", "boleto_faturado"] : ["pix", "cartao"];

  const linhas = itens.map((i) => {
    const a = atual[i.produto_id];
    const preco = a ? a.preco : null;
    const disponivel = Boolean(a);
    const estoque = a?.estoque ?? null;
    const falta = estoque != null && i.quantidade > estoque;
    return { ...i, preco, disponivel, estoque, falta };
  });
  const subtotal = Math.round(linhas.reduce((s, l) => s + (l.preco ?? 0) * l.quantidade, 0) * 100) / 100;
  const problemas = linhas.filter((l) => !l.disponivel || l.preco == null || l.falta);
  const cepOk = soDigitos(cep).length === 8;

  if (!pronto) return <div className="cartao p-8 text-center text-suave">Carregando carrinho…</div>;

  if (linhas.length === 0) {
    return (
      <div className="cartao flex flex-col items-center gap-3 p-10 text-center">
        <p className="text-lg">Seu carrinho de {nomeCd} está vazio.</p>
        <p className="text-sm text-suave">Adicione produtos pelo catálogo ou monte um kit completo a partir do consumo do cliente.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href="/portal" className="btn">
            Ir ao catálogo
          </Link>
          <Link href="/portal/kit" className="btn-primario">
            Monte seu kit
          </Link>
        </div>
      </div>
    );
  }

  const mensagemWhats = [
    `Olá, ${vendedora?.nome.split(" ")[0] ?? ""}! Aqui é da ${empresa}. Quero negociar este carrinho (${nomeCd}):`,
    ...linhas.map((l) => `• ${num(l.quantidade)} ${l.unidade} × ${l.nome} (SKU ${l.sku})${l.preco != null ? ` – ${brl(l.preco)}` : ""}`),
    `Subtotal no portal: ${brl(subtotal)}`,
    cepOk ? `CEP de entrega: ${formatarCep(cep)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <section className="flex min-w-0 flex-col gap-3" aria-label="Itens do carrinho">
        <ul className="cartao divide-y divide-linha">
          {linhas.map((l) => (
            <li key={l.produto_id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-[180px] flex-1">
                <p className="font-semibold leading-snug">{l.nome}</p>
                <p className="text-xs text-suave">
                  {l.marca} · SKU {l.sku} · {brl(l.preco)} / {l.unidade}
                </p>
                {!l.disponivel && <p className="mt-1 text-xs font-semibold text-red-700">Produto indisponível neste CD. Remova para continuar.</p>}
                {l.disponivel && l.preco == null && <p className="mt-1 text-xs font-semibold text-red-700">Produto sem preço. Fale com sua vendedora.</p>}
                {l.falta && (
                  <p className="mt-1 text-xs font-semibold text-red-700">
                    Só há {num(l.estoque ?? 0)} {l.unidade} em estoque neste CD.
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button className="btn h-9 w-9 p-0" aria-label={`Diminuir ${l.nome}`} onClick={() => definirQuantidade(l.produto_id, l.quantidade - 1)}>
                  −
                </button>
                <input
                  aria-label={`Quantidade de ${l.nome}`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={l.quantidade}
                  onChange={(e) => {
                    const v = Math.floor(Number(e.target.value));
                    if (v >= 1) definirQuantidade(l.produto_id, v);
                  }}
                  className="campo h-9 w-20 text-center"
                />
                <button className="btn h-9 w-9 p-0" aria-label={`Aumentar ${l.nome}`} onClick={() => definirQuantidade(l.produto_id, l.quantidade + 1)}>
                  +
                </button>
              </div>
              <p className="w-28 text-right font-semibold">{l.preco != null ? brl(l.preco * l.quantidade) : "—"}</p>
              <button className="text-sm text-suave underline-offset-2 hover:text-titan hover:underline" onClick={() => remover(l.produto_id)}>
                Remover
              </button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/portal" className="font-semibold text-titan hover:underline">
            Continuar comprando
          </Link>
          <button
            className="text-suave hover:text-titan hover:underline"
            onClick={() => {
              if (window.confirm("Esvaziar o carrinho?")) limpar();
            }}
          >
            Esvaziar carrinho
          </button>
        </div>
      </section>

      <aside className="cartao flex h-fit flex-col gap-4 p-4 lg:sticky lg:top-20" aria-label="Fechamento do pedido">
        <h2 className="font-semibold">Resumo</h2>
        <dl className="flex flex-col gap-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-suave">Subtotal</dt>
            <dd className="font-semibold">{brl(subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-suave">Frete</dt>
            <dd>a calcular pela equipe</dd>
          </div>
          <div className="mt-1 flex justify-between border-t border-linha pt-2 text-base">
            <dt>Total dos produtos</dt>
            <dd className="font-semibold text-titan">{brl(subtotal)}</dd>
          </div>
        </dl>

        {aprovado ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              setErro(null);
              iniciar(async () => {
                const r = await fecharPedido({
                  cd,
                  pagamento,
                  cep,
                  obs,
                  itens: linhas.map((l) => ({ produto_id: l.produto_id, quantidade: l.quantidade })),
                });
                if (r.ok) {
                  limpar();
                  router.push(`/portal/pedidos/${r.id}?novo=1`);
                  router.refresh();
                } else {
                  setErro(r.erro);
                }
              });
            }}
          >
            <fieldset>
              <legend className="rotulo">Forma de pagamento</legend>
              <div className="flex flex-col gap-1.5">
                {pagamentos.map((p) => (
                  <label key={p} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${pagamento === p ? "border-titan bg-titan-tinta" : "border-linha"}`}>
                    <input type="radio" name="pagamento" value={p} checked={pagamento === p} onChange={() => setPagamento(p)} className="accent-titan" />
                    {PAGAMENTOS[p]}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label className="rotulo" htmlFor="cep">
                CEP de entrega
              </label>
              <input id="cep" className="campo" inputMode="numeric" autoComplete="postal-code" placeholder="00000-000" value={cep} onChange={(e) => setCep(formatarCep(e.target.value))} required />
            </div>
            <div>
              <label className="rotulo" htmlFor="obs">
                Observação (opcional)
              </label>
              <textarea id="obs" className="campo min-h-[72px]" maxLength={1000} placeholder="Ex.: nome do cliente final, horário de recebimento" value={obs} onChange={(e) => setObs(e.target.value)} />
            </div>
            {erro && (
              <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {erro}
              </p>
            )}
            {problemas.length > 0 && <p className="text-xs text-red-700">Resolva os itens marcados antes de fechar o pedido.</p>}
            <button className="btn-primario" disabled={enviando || problemas.length > 0 || !cepOk}>
              {enviando ? "Enviando pedido…" : "Fechar pedido"}
            </button>
            <p className="text-xs text-suave">O frete e a data de saída são confirmados pela equipe Titan depois do pedido.</p>
          </form>
        ) : (
          <p className="text-sm text-suave">Os pedidos são liberados após a aprovação do cadastro da sua empresa.</p>
        )}

        {vendedora && (
          <a href={linkWhatsapp(vendedora.telefone, mensagemWhats)} target="_blank" rel="noopener noreferrer" className="btn-whats text-center text-sm">
            Negociar com minha vendedora no WhatsApp
          </a>
        )}
      </aside>
    </div>
  );
}
