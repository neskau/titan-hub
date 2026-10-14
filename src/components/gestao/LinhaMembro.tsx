"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { salvarMembro } from "@/app/gestao/equipe/acoes";
import { PAPEIS } from "./rotulos";
import type { Papel } from "@/lib/tipos";

/** Linha da tabela de equipe com papel e acesso editáveis. */
export function LinhaMembro({
  id,
  nome,
  email,
  desde,
  papel,
  ativo,
  eu,
  souAdmin,
}: {
  id: string;
  nome: string;
  email: string;
  desde: string;
  papel: Papel;
  ativo: boolean;
  eu: boolean;
  souAdmin: boolean;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [f, setF] = useState({ papel, ativo });
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const bloqueado = eu || (!souAdmin && papel === "admin");
  const mudou = f.papel !== papel || f.ativo !== ativo;
  const opcoes: Papel[] = souAdmin ? ["integrador", "vendedora", "gestor", "admin"] : ["integrador", "vendedora", "gestor"];

  return (
    <tr className={ativo ? "" : "bg-fundo text-suave"}>
      <td>
        <p className="font-semibold text-grafite">
          {nome}
          {eu && <span className="chip-info ml-2">Você</span>}
        </p>
        <p className="text-xs text-suave [overflow-wrap:anywhere]">{email}</p>
      </td>
      <td>{desde}</td>
      <td>
        {bloqueado ? (
          <span className="font-semibold">{PAPEIS[papel]}</span>
        ) : (
          <select
            aria-label={`Papel de ${nome}`}
            className="campo w-auto py-1.5"
            value={f.papel}
            onChange={(e) => setF((v) => ({ ...v, papel: e.target.value as Papel }))}
          >
            {opcoes.map((p) => (
              <option key={p} value={p}>
                {PAPEIS[p]}
              </option>
            ))}
          </select>
        )}
      </td>
      <td>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-titan"
            disabled={bloqueado}
            checked={f.ativo}
            onChange={(e) => setF((v) => ({ ...v, ativo: e.target.checked }))}
          />
          {f.ativo ? "Ativo" : "Inativo"}
        </label>
      </td>
      <td className="text-right">
        {mudou && (
          <button
            className="btn-primario px-3 py-1 text-sm"
            disabled={pendente}
            onClick={() => {
              if (f.papel === "integrador" && !window.confirm(`${nome} perderá o acesso à área de gestão. Continuar?`)) return;
              setMsg(null);
              iniciar(async () => {
                const r = await salvarMembro({ id, ...f });
                if (r.ok) {
                  setMsg({ tipo: "ok", texto: "Salvo" });
                  router.refresh();
                } else setMsg({ tipo: "erro", texto: r.erro });
              });
            }}
          >
            Salvar
          </button>
        )}
        {msg && (
          <p role={msg.tipo === "erro" ? "alert" : "status"} className={`mt-1 text-xs ${msg.tipo === "erro" ? "text-red-700" : "text-emerald-700"}`}>
            {msg.texto}
          </p>
        )}
      </td>
    </tr>
  );
}
