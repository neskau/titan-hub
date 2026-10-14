"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ajustarEstoque } from "@/app/gestao/estoque/acoes";
import { situacaoEstoque } from "./rotulos";

/** Saldo e mínimo editáveis de um produto num CD; o botão Salvar aparece quando algo muda. */
export function CelulaEstoque({
  produtoId,
  produtoNome,
  cdId,
  cdNome,
  quantidade,
  minimo,
}: {
  produtoId: string;
  produtoNome: string;
  cdId: string;
  cdNome: string;
  quantidade: number;
  minimo: number;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [qtd, setQtd] = useState(String(quantidade));
  const [min, setMin] = useState(String(minimo));
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const mudou = qtd !== String(quantidade) || min !== String(minimo);
  const sit = situacaoEstoque(Number(qtd) || 0, Number(min) || 0);
  const somenteDigitos = (s: string) => s.replace(/\D/g, "").slice(0, 8);

  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        setErro(null);
        setSalvo(false);
        iniciar(async () => {
          const r = await ajustarEstoque({ produto_id: produtoId, cd_id: cdId, quantidade: qtd, minimo: min });
          if (r.ok) {
            setSalvo(true);
            router.refresh();
          } else setErro(r.erro);
        });
      }}
    >
      <div className="flex items-end gap-2">
        <label className="flex flex-col">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-suave">Saldo</span>
          <input
            inputMode="numeric"
            aria-label={`Saldo de ${produtoNome} em ${cdNome}`}
            className="campo w-20 px-2 py-1 text-right"
            value={qtd}
            onChange={(e) => {
              setQtd(somenteDigitos(e.target.value));
              setSalvo(false);
            }}
          />
        </label>
        <label className="flex flex-col">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-suave">Mín.</span>
          <input
            inputMode="numeric"
            aria-label={`Estoque mínimo de ${produtoNome} em ${cdNome}`}
            className="campo w-16 px-2 py-1 text-right"
            value={min}
            onChange={(e) => {
              setMin(somenteDigitos(e.target.value));
              setSalvo(false);
            }}
          />
        </label>
        {mudou && (
          <button className="btn-primario px-2.5 py-1 text-xs" disabled={pendente || qtd === "" || min === ""}>
            {pendente ? "…" : "Salvar"}
          </button>
        )}
      </div>
      <span className="flex items-center gap-2">
        <span className={sit.chip}>{sit.rotulo}</span>
        {salvo && !mudou && <span className="text-xs text-emerald-700">Salvo</span>}
      </span>
      {erro && (
        <span role="alert" className="text-xs text-red-700">
          {erro}
        </span>
      )}
    </form>
  );
}
