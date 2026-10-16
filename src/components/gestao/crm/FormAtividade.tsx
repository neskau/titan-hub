"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registrarAtividade } from "@/app/gestao/tarefas/acoes";
import { Aviso } from "@/components/gestao/Aviso";
import { TIPOS_ATIVIDADE, TIPOS_REGISTRO, hojeSP, somarDias } from "./constantes";
import { Icone } from "./Icone";

type Tipo = (typeof TIPOS_REGISTRO)[number] | "tarefa";
const TIPOS: Tipo[] = [...TIPOS_REGISTRO, "tarefa"];

/** Registrar nota/ligação/WhatsApp/e-mail/visita ou criar tarefa numa oportunidade ou empresa. */
export function FormAtividade({
  oportunidadeId,
  empresaId,
  eu,
  gestor,
  equipe,
}: {
  oportunidadeId?: string;
  empresaId?: string;
  eu: string;
  gestor: boolean;
  equipe: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [tipo, setTipo] = useState<Tipo>("nota");
  const [descricao, setDescricao] = useState("");
  const [dia, setDia] = useState(() => somarDias(hojeSP(), 1));
  const [hora, setHora] = useState("09:00");
  const [responsavel, setResponsavel] = useState(eu);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const tarefa = tipo === "tarefa";

  return (
    <form
      className="cartao flex flex-col gap-3 p-4"
      aria-label="Registrar atividade"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        iniciar(async () => {
          const r = await registrarAtividade({
            oportunidade_id: oportunidadeId ?? "",
            empresa_id: empresaId ?? "",
            tipo,
            descricao,
            dia: tarefa ? dia : "",
            hora: tarefa && dia ? hora : "",
            responsavel_id: tarefa ? responsavel : "",
          });
          if (r.ok) {
            setMsg({ tipo: "ok", texto: r.msg ?? "Registrado." });
            setDescricao("");
            router.refresh();
          } else setMsg({ tipo: "erro", texto: r.erro });
        });
      }}
    >
      <h2 className="font-semibold">Registrar</h2>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tipo de registro">
        {TIPOS.map((t) => (
          <label
            key={t}
            className={`chip cursor-pointer gap-1 border py-1 ${tipo === t ? "border-titan bg-titan-tinta text-titan" : "border-linha bg-white text-grafite hover:border-suave"}`}
          >
            <input type="radio" name="tipo" value={t} checked={tipo === t} onChange={() => setTipo(t)} className="sr-only" />
            <Icone tipo={t} tamanho={14} />
            {t === "tarefa" ? "Nova tarefa" : TIPOS_ATIVIDADE[t]}
          </label>
        ))}
      </div>
      <div>
        <label className="rotulo" htmlFor="desc-atividade">
          {tarefa ? "O que precisa ser feito" : "Descrição"}
        </label>
        <textarea
          id="desc-atividade"
          required
          rows={3}
          maxLength={2000}
          className="campo"
          placeholder={tarefa ? "Ex.: Ligar para confirmar o orçamento" : "Ex.: Cliente pediu orçamento com inversor híbrido"}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
        />
      </div>
      {tarefa && (
        <div className="grid gap-3 sm:grid-cols-[1fr_110px]">
          <div>
            <label className="rotulo" htmlFor="venc-dia">
              Vencimento
            </label>
            <input id="venc-dia" type="date" className="campo" value={dia} onChange={(e) => setDia(e.target.value)} />
          </div>
          <div>
            <label className="rotulo" htmlFor="venc-hora">
              Hora
            </label>
            <input id="venc-hora" type="time" className="campo" value={hora} onChange={(e) => setHora(e.target.value)} disabled={!dia} />
          </div>
          {gestor && (
            <div className="sm:col-span-2">
              <label className="rotulo" htmlFor="responsavel">
                Responsável
              </label>
              <select id="responsavel" className="campo" value={responsavel} onChange={(e) => setResponsavel(e.target.value)}>
                {equipe.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id === eu ? `${m.nome} (eu)` : m.nome}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
      {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}
      <button className="btn-primario self-start" disabled={pendente}>
        {pendente ? "Salvando…" : tarefa ? "Criar tarefa" : "Adicionar à linha do tempo"}
      </button>
    </form>
  );
}
