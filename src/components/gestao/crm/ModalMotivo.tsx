"use client";
import { useEffect, useId, useRef, useState } from "react";

const SUGESTOES = ["Preço", "Fechou com concorrente", "Cliente desistiu do projeto", "Sem retorno do cliente", "Prazo de entrega", "Crédito / financiamento"];

/** Diálogo para informar o motivo da perda (sem window.prompt). */
export function ModalMotivo({
  titulo,
  aberto,
  pendente,
  erro,
  onCancelar,
  onConfirmar,
}: {
  titulo: string;
  aberto: boolean;
  pendente?: boolean;
  erro?: string | null;
  onCancelar: () => void;
  onConfirmar: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const idTitulo = useId();

  useEffect(() => {
    if (!aberto) return;
    setMotivo("");
    setAviso(null);
    const t = setTimeout(() => ref.current?.focus(), 0);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onCancelar();
    window.addEventListener("keydown", esc);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", esc);
    };
  }, [aberto, onCancelar]);

  if (!aberto) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onCancelar()}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        className="cartao flex w-full max-w-md flex-col gap-3 p-5 shadow-xl"
        onSubmit={(e) => {
          e.preventDefault();
          if (!motivo.trim()) {
            setAviso("Informe o motivo da perda.");
            ref.current?.focus();
            return;
          }
          onConfirmar(motivo.trim());
        }}
      >
        <h2 id={idTitulo} className="text-lg font-semibold">
          Marcar como perdida
        </h2>
        <p className="text-sm text-suave [overflow-wrap:anywhere]">{titulo}</p>
        <div>
          <label className="rotulo" htmlFor={`${idTitulo}-motivo`}>
            Motivo da perda
          </label>
          <textarea
            id={`${idTitulo}-motivo`}
            ref={ref}
            rows={3}
            maxLength={500}
            className="campo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            aria-invalid={!!aviso}
          />
        </div>
        <div className="flex flex-wrap gap-1.5" aria-label="Motivos comuns">
          {SUGESTOES.map((s) => (
            <button key={s} type="button" className="chip bg-fundo text-grafite hover:bg-titan-tinta" onClick={() => setMotivo(s)}>
              {s}
            </button>
          ))}
        </div>
        {(aviso || erro) && (
          <p role="alert" className="text-sm font-semibold text-red-700">
            {aviso || erro}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onCancelar} disabled={pendente}>
            Cancelar
          </button>
          <button className="btn-primario" disabled={pendente}>
            {pendente ? "Salvando…" : "Confirmar perda"}
          </button>
        </div>
      </form>
    </div>
  );
}
