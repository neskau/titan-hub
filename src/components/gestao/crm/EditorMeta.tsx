"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { salvarMeta } from "@/app/gestao/metas/acoes";

/** Campo de meta do mês editável pelo gestor. */
export function EditorMeta({ vendedoraId, nome, mes, valor }: { vendedoraId: string; nome: string; mes: string; valor: number }) {
  const router = useRouter();
  const inicial = valor ? String(valor).replace(".", ",") : "";
  const [texto, setTexto] = useState(inicial);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const id = `meta-${vendedoraId}`;
  return (
    <form
      className="flex flex-col gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        iniciar(async () => {
          const r = await salvarMeta({ vendedora_id: vendedoraId, mes, valor: texto || "0" });
          setMsg(r.ok ? { ok: true, texto: r.msg ?? "Meta salva." } : { ok: false, texto: r.erro });
          if (r.ok) router.refresh();
        });
      }}
    >
      <label className="rotulo" htmlFor={id}>
        Meta do mês (R$)
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          inputMode="decimal"
          maxLength={18}
          className="campo min-w-0 flex-1 py-1.5"
          placeholder="0,00"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          aria-describedby={msg ? `${id}-msg` : undefined}
        />
        <button className="btn py-1.5 text-sm" disabled={pendente || texto === inicial} aria-label={`Salvar meta de ${nome}`}>
          {pendente ? "…" : "Salvar"}
        </button>
      </div>
      {msg && (
        <span id={`${id}-msg`} role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>
          {msg.texto}
        </span>
      )}
    </form>
  );
}
