"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { avancarStatus, cancelarPedido, salvarDadosPedido, type Resultado } from "@/app/gestao/pedidos/acoes";
import { ACAO_AVANCAR } from "./rotulos";
import { Aviso } from "./Aviso";
import type { StatusPedido } from "@/lib/tipos";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const lerValor = (s: string) => {
  const t = s.trim();
  const n = Number((t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t) || "0");
  return Number.isFinite(n) ? n : NaN;
};

/** Botões de avançar/cancelar e formulário de rastreio, nota fiscal e frete. */
export function AcoesPedido({
  id,
  status,
  subtotal,
  frete,
  rastreio,
  notaFiscal,
}: {
  id: string;
  status: StatusPedido;
  subtotal: number;
  frete: number;
  rastreio: string | null;
  notaFiscal: string | null;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [f, setF] = useState({
    frete: frete.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    rastreio: rastreio ?? "",
    nota_fiscal: notaFiscal ?? "",
  });
  const encerrado = status === "cancelado" || status === "entregue";
  const freteNum = lerValor(f.frete);

  const executar = (acao: () => Promise<Resultado>, sucesso?: string) => {
    setMsg(null);
    iniciar(async () => {
      const r = await acao();
      if (r.ok) {
        setMsg({ tipo: "ok", texto: r.msg ?? sucesso ?? "Pedido atualizado." });
        router.refresh();
      } else setMsg({ tipo: "erro", texto: r.erro });
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}

      {!encerrado && (
        <section className="cartao flex flex-col gap-3 p-4" aria-label="Situação do pedido">
          <h2 className="font-semibold">Situação</h2>
          {ACAO_AVANCAR[status] && (
            <button className="btn-primario" disabled={pendente} onClick={() => executar(() => avancarStatus(id, status))}>
              {ACAO_AVANCAR[status]}
            </button>
          )}
          <button
            className="btn border-red-200 text-red-700 hover:border-red-400"
            disabled={pendente}
            onClick={() => {
              if (window.confirm("Cancelar este pedido? Os itens voltam para o estoque do CD. Esta ação não pode ser desfeita.")) {
                executar(() => cancelarPedido(id));
              }
            }}
          >
            Cancelar pedido
          </button>
        </section>
      )}

      <form
        className="cartao flex flex-col gap-3 p-4"
        aria-label="Dados de faturamento e entrega"
        onSubmit={(e) => {
          e.preventDefault();
          executar(() => salvarDadosPedido({ id, ...f }));
        }}
      >
        <h2 className="font-semibold">Faturamento e entrega</h2>
        <div>
          <label className="rotulo" htmlFor="nota_fiscal">
            Nota fiscal
          </label>
          <input
            id="nota_fiscal"
            className="campo"
            value={f.nota_fiscal}
            disabled={status === "cancelado"}
            onChange={(e) => setF((v) => ({ ...v, nota_fiscal: e.target.value }))}
          />
        </div>
        <div>
          <label className="rotulo" htmlFor="rastreio">
            Código de rastreio
          </label>
          <input
            id="rastreio"
            className="campo"
            value={f.rastreio}
            disabled={status === "cancelado"}
            onChange={(e) => setF((v) => ({ ...v, rastreio: e.target.value }))}
          />
        </div>
        <div>
          <label className="rotulo" htmlFor="frete">
            Frete (R$)
          </label>
          <input
            id="frete"
            inputMode="decimal"
            className="campo"
            value={f.frete}
            disabled={status === "cancelado"}
            onChange={(e) => setF((v) => ({ ...v, frete: e.target.value.replace(/[^\d.,]/g, "") }))}
          />
          <p className="mt-1 text-xs text-suave">
            Novo total: {Number.isNaN(freteNum) ? "—" : <strong className="text-grafite">{brl(subtotal + freteNum)}</strong>} (subtotal{" "}
            {brl(subtotal)} + frete)
          </p>
        </div>
        <button className="btn-primario" disabled={pendente || status === "cancelado"}>
          Salvar
        </button>
      </form>
    </div>
  );
}
