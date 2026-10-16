import Link from "next/link";
import { dataHora } from "@/components/gestao/rotulos";
import { TIPOS_ATIVIDADE, diaSP, hojeSP, horaSP } from "./constantes";
import { BotaoConcluir } from "./BotaoConcluir";
import { Icone } from "./Icone";
import type { Atividade, Membro } from "./tipos";

const COR: Record<Atividade["tipo"], string> = {
  nota: "bg-fundo text-grafite",
  ligacao: "bg-sky-50 text-sky-700",
  whatsapp: "bg-emerald-50 text-emerald-700",
  email: "bg-indigo-50 text-indigo-700",
  visita: "bg-titan-tinta text-titan",
  tarefa: "bg-amber-50 text-amber-700",
  sistema: "bg-fundo text-suave",
};

/** Situação do prazo de uma tarefa pendente. */
export function prazoTarefa(vencimento: string | null, agora = Date.now()) {
  if (!vencimento) return { rotulo: "Sem prazo", chip: "chip bg-fundo text-suave", atrasada: false };
  if (Date.parse(vencimento) < agora) return { rotulo: `Atrasada · ${dataHora(vencimento)}`, chip: "chip-erro", atrasada: true };
  if (diaSP(vencimento) === hojeSP()) return { rotulo: `Hoje · ${horaSP(vencimento)}`, chip: "chip-alerta", atrasada: false };
  return { rotulo: `Vence ${dataHora(vencimento)}`, chip: "chip-info", atrasada: false };
}

/** Linha do tempo do CRM (mais recentes primeiro). `oportunidades` mostra de qual negociação veio cada registro. */
export function LinhaDoTempoCrm({
  atividades,
  equipe,
  oportunidades,
  agora,
}: {
  atividades: Atividade[];
  equipe: Membro[];
  oportunidades?: Record<string, string>;
  agora: number;
}) {
  const nome = (id: string | null) => (id ? (equipe.find((m) => m.id === id)?.nome ?? "Integrador") : "Sistema");
  if (atividades.length === 0) return <p className="cartao p-4 text-sm text-suave">Nenhum registro ainda. Use o formulário para anotar o primeiro contato.</p>;
  return (
    <ol className="cartao flex flex-col divide-y divide-linha">
      {atividades.map((a) => {
        const tarefa = a.tipo === "tarefa";
        const prazo = tarefa && !a.concluida ? prazoTarefa(a.vencimento, agora) : null;
        return (
          <li key={a.id} className="flex gap-3 p-3 text-sm">
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${COR[a.tipo]}`} aria-hidden="true">
              <Icone tipo={a.tipo} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-semibold">{TIPOS_ATIVIDADE[a.tipo]}</span>
                {prazo && <span className={prazo.chip}>{prazo.rotulo}</span>}
                {tarefa && a.concluida && <span className="chip-ok">Concluída{a.concluida_em ? ` em ${dataHora(a.concluida_em)}` : ""}</span>}
                {oportunidades && a.oportunidade_id && oportunidades[a.oportunidade_id] && (
                  <Link href={`/gestao/oportunidades/${a.oportunidade_id}`} className="chip bg-fundo text-titan hover:underline">
                    {oportunidades[a.oportunidade_id]}
                  </Link>
                )}
              </div>
              <p className={`whitespace-pre-line [overflow-wrap:anywhere] ${a.tipo === "sistema" ? "text-suave" : ""} ${a.concluida ? "line-through decoration-suave/60" : ""}`}>
                {a.descricao}
              </p>
              <p className="text-xs text-suave">
                {nome(a.autor_id)} · {dataHora(a.criado_em)}
                {tarefa && a.responsavel_id && a.responsavel_id !== a.autor_id ? ` · responsável: ${nome(a.responsavel_id)}` : ""}
              </p>
            </div>
            {tarefa && <BotaoConcluir id={a.id} concluida={a.concluida} descricao={a.descricao} />}
          </li>
        );
      })}
    </ol>
  );
}
