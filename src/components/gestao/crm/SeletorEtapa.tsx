"use client";
import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moverEtapa } from "@/app/gestao/funil/acoes";
import { Aviso } from "@/components/gestao/Aviso";
import { ETAPAS, type Etapa } from "./constantes";
import { ModalMotivo } from "./ModalMotivo";

/** Etapas em botões (passo a passo) para a página da oportunidade; "Perdido" abre o diálogo de motivo. */
export function SeletorEtapa({ id, titulo, etapa }: { id: string; titulo: string; etapa: Etapa }) {
  const router = useRouter();
  const [pedirMotivo, setPedirMotivo] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [erroMotivo, setErroMotivo] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const aplicar = (nova: Etapa, motivo?: string) => {
    setMsg(null);
    iniciar(async () => {
      const r = await moverEtapa(id, nova, motivo);
      if (r.ok) {
        setPedirMotivo(false);
        setMsg({ tipo: "ok", texto: r.msg ?? "Etapa atualizada." });
        router.refresh();
      } else if (nova === "perdido") setErroMotivo(r.erro);
      else setMsg({ tipo: "erro", texto: r.erro });
    });
  };
  const cancelar = useCallback(() => setPedirMotivo(false), []);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Etapa da oportunidade">
        {ETAPAS.map((e) => {
          const atual = e.id === etapa;
          const cor =
            e.id === "ganho" ? "border-emerald-600 bg-emerald-600 text-white" : e.id === "perdido" ? "border-red-700 bg-red-700 text-white" : "border-titan bg-titan text-white";
          return (
            <button
              key={e.id}
              type="button"
              aria-pressed={atual}
              disabled={pendente || atual}
              onClick={() => {
                if (e.id === "perdido") {
                  setErroMotivo(null);
                  setPedirMotivo(true);
                } else aplicar(e.id);
              }}
              className={`btn px-3 py-1.5 text-sm disabled:opacity-100 ${atual ? cor : ""} ${pendente && !atual ? "opacity-50" : ""}`}
            >
              {e.rotulo}
            </button>
          );
        })}
      </div>
      {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}
      <ModalMotivo aberto={pedirMotivo} titulo={titulo} pendente={pendente} erro={erroMotivo} onCancelar={cancelar} onConfirmar={(m) => aplicar("perdido", m)} />
    </div>
  );
}
