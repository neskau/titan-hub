"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { concluirTarefa } from "@/app/gestao/tarefas/acoes";

/** Caixa de "concluir tarefa" com um clique (otimista; desfaz se o banco recusar). */
export function BotaoConcluir({ id, concluida, descricao }: { id: string; concluida: boolean; descricao: string }) {
  const router = useRouter();
  const [feita, setFeita] = useState(concluida);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        role="checkbox"
        aria-checked={feita}
        aria-label={`${feita ? "Reabrir" : "Concluir"} tarefa: ${descricao.slice(0, 80)}`}
        title={feita ? "Reabrir tarefa" : "Concluir tarefa"}
        disabled={pendente}
        onClick={() => {
          const novo = !feita;
          setFeita(novo);
          setErro(null);
          iniciar(async () => {
            const r = await concluirTarefa(id, novo);
            if (r.ok) router.refresh();
            else {
              setFeita(!novo);
              setErro(r.erro);
            }
          });
        }}
        className={`grid h-6 w-6 shrink-0 place-items-center rounded border-2 text-sm font-bold transition disabled:opacity-60 ${
          feita ? "border-emerald-600 bg-emerald-600 text-white" : "border-linha bg-white text-transparent hover:border-titan"
        }`}
      >
        ✓
      </button>
      {erro && (
        <span role="alert" className="mt-1 text-xs text-red-700">
          {erro}
        </span>
      )}
    </span>
  );
}
