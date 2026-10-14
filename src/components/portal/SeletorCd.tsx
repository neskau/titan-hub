"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { definirCd } from "./acoes";

/** Escolha do centro de distribuição; o valor fica no cookie 'cd'. */
export function SeletorCd({ atual, cds }: { atual: string; cds: { id: string; nome: string; uf: string }[] }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  if (cds.length <= 1) return null;
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="hidden text-suave lg:inline">Comprar de</span>
      <select
        aria-label="Centro de distribuição"
        className="campo w-auto py-1.5 pr-8 text-sm font-semibold"
        value={atual}
        disabled={pendente}
        onChange={(e) => {
          const cd = e.target.value;
          iniciar(async () => {
            await definirCd(cd);
            router.refresh();
          });
        }}
      >
        {cds.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome} – {c.uf}
          </option>
        ))}
      </select>
    </label>
  );
}
