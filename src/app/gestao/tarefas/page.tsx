import Link from "next/link";
import { CabecalhoPagina } from "@/components/Shell";
import { dataHora, nomeEmpresa } from "@/components/gestao/rotulos";
import { inicioDoDia, sessaoGestao } from "@/components/gestao/servidor";
import { BotaoConcluir } from "@/components/gestao/crm/BotaoConcluir";
import { diaSP, hojeSP, horaSP, somarDias } from "@/components/gestao/crm/constantes";
import { ehGestor, listarEquipe } from "@/components/gestao/crm/servidor";
import type { Atividade } from "@/components/gestao/crm/tipos";
import { supabaseServidor } from "@/lib/supabase/server";

export const metadata = { title: "Tarefas · Gestão · Titan" };

type Tarefa = Atividade & {
  oportunidades: { id: string; titulo: string } | null;
  empresas: { id: string; razao_social: string; nome_fantasia: string | null } | null;
};

const CAMPOS = "*, oportunidades(id, titulo), empresas(id, razao_social, nome_fantasia)";

export default async function Tarefas({ searchParams }: { searchParams: { ver?: string; vendedora?: string } }) {
  const s = await sessaoGestao();
  const gestor = ehGestor(s);
  const equipe = await listarEquipe();
  const verEquipe = gestor && searchParams.ver === "equipe";
  const vendedora = verEquipe ? equipe.find((m) => m.id === searchParams.vendedora)?.id : undefined;
  const responsavel = verEquipe ? vendedora : s.userId;
  const sb = supabaseServidor();
  const hoje = hojeSP();

  let qAbertas = sb
    .from("atividades")
    .select(CAMPOS)
    .eq("tipo", "tarefa")
    .eq("concluida", false)
    .order("vencimento", { ascending: true, nullsFirst: false })
    .limit(500);
  let qFeitas = sb
    .from("atividades")
    .select(CAMPOS)
    .eq("tipo", "tarefa")
    .eq("concluida", true)
    .gte("concluida_em", inicioDoDia(somarDias(hoje, -7)))
    .order("concluida_em", { ascending: false })
    .limit(30);
  if (responsavel) {
    qAbertas = qAbertas.eq("responsavel_id", responsavel);
    qFeitas = qFeitas.eq("responsavel_id", responsavel);
  }
  const [abertas, feitas] = await Promise.all([qAbertas, qFeitas]);
  const lista = (abertas.data as unknown as Tarefa[] | null) ?? [];
  const concluidas = (feitas.data as unknown as Tarefa[] | null) ?? [];

  const agora = Date.now();
  const limite7 = somarDias(hoje, 7);
  const grupos: { id: string; titulo: string; tom: string; itens: Tarefa[]; vazio?: string }[] = [
    { id: "atrasadas", titulo: "Atrasadas", tom: "text-red-700", itens: [] },
    { id: "hoje", titulo: "Hoje", tom: "text-titan", itens: [], vazio: "Nada para hoje." },
    { id: "semana", titulo: "Próximos 7 dias", tom: "", itens: [] },
    { id: "depois", titulo: "Mais adiante", tom: "", itens: [] },
    { id: "sem-data", titulo: "Sem data", tom: "", itens: [] },
  ];
  for (const t of lista) {
    const g = !t.vencimento
      ? 4
      : Date.parse(t.vencimento) < agora
        ? 0
        : diaSP(t.vencimento) === hoje
          ? 1
          : diaSP(t.vencimento) <= limite7
            ? 2
            : 3;
    grupos[g].itens.push(t);
  }
  const nome = (id: string | null) => equipe.find((m) => m.id === id)?.nome ?? "—";
  const erro = abertas.error || feitas.error;

  return (
    <>
      <CabecalhoPagina
        titulo={verEquipe ? "Tarefas da equipe" : "Minhas tarefas"}
        sub={`${lista.length} em aberto${grupos[0].itens.length ? ` · ${grupos[0].itens.length} atrasada(s)` : ""}`}
        acoes={
          <Link href="/gestao/funil" className="btn">
            Ir para o funil
          </Link>
        }
      />

      {gestor && (
        <form method="get" className="cartao flex flex-wrap items-end gap-3 p-4" aria-label="Filtros de tarefas">
          <div>
            <label className="rotulo" htmlFor="ver">
              Mostrar
            </label>
            <select id="ver" name="ver" defaultValue={verEquipe ? "equipe" : "minhas"} className="campo">
              <option value="minhas">Minhas tarefas</option>
              <option value="equipe">Equipe</option>
            </select>
          </div>
          <div>
            <label className="rotulo" htmlFor="vendedora">
              Responsável (equipe)
            </label>
            <select id="vendedora" name="vendedora" defaultValue={vendedora ?? ""} className="campo">
              <option value="">Todos</option>
              {equipe.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                  {m.ativo ? "" : " (inativa)"}
                </option>
              ))}
            </select>
          </div>
          <button className="btn-primario">Aplicar</button>
        </form>
      )}

      {erro && (
        <p role="alert" className="cartao border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Não foi possível carregar as tarefas agora. Tente recarregar a página.
        </p>
      )}

      {lista.length === 0 && !erro && (
        <p className="cartao p-6 text-center text-suave">Nenhuma tarefa em aberto. Crie tarefas na página de cada oportunidade ou integrador.</p>
      )}

      {grupos
        .filter((g) => g.itens.length > 0 || (g.id === "hoje" && lista.length > 0))
        .map((g) => (
          <section key={g.id} className="flex flex-col gap-2" aria-labelledby={`g-${g.id}`}>
            <h2 id={`g-${g.id}`} className={`text-lg font-semibold ${g.tom}`}>
              {g.titulo} <span className="text-sm font-normal text-suave">({g.itens.length})</span>
            </h2>
            {g.itens.length === 0 ? (
              <p className="cartao p-4 text-sm text-suave">{g.vazio}</p>
            ) : (
              <ul className={`cartao flex flex-col divide-y divide-linha ${g.id === "atrasadas" ? "border-red-200" : ""}`}>
                {g.itens.map((t) => (
                  <ItemTarefa key={t.id} t={t} atrasada={g.id === "atrasadas"} hoje={g.id === "hoje"} responsavel={verEquipe ? nome(t.responsavel_id) : null} />
                ))}
              </ul>
            )}
          </section>
        ))}

      {concluidas.length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="g-feitas">
          <h2 id="g-feitas" className="text-lg font-semibold text-suave">
            Concluídas nos últimos 7 dias <span className="text-sm font-normal">({concluidas.length})</span>
          </h2>
          <ul className="cartao flex flex-col divide-y divide-linha opacity-80">
            {concluidas.map((t) => (
              <ItemTarefa key={t.id} t={t} responsavel={verEquipe ? nome(t.responsavel_id) : null} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function ItemTarefa({ t, atrasada, hoje, responsavel }: { t: Tarefa; atrasada?: boolean; hoje?: boolean; responsavel: string | null }) {
  const vinculo = t.oportunidades
    ? { href: `/gestao/oportunidades/${t.oportunidades.id}`, texto: t.oportunidades.titulo }
    : t.empresas
      ? { href: `/gestao/integradores/${t.empresas.id}`, texto: nomeEmpresa(t.empresas) }
      : null;
  return (
    <li className={`flex items-start gap-3 p-3 text-sm ${atrasada ? "bg-red-50/50" : ""}`}>
      <BotaoConcluir id={t.id} concluida={t.concluida} descricao={t.descricao} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className={`whitespace-pre-line font-semibold [overflow-wrap:anywhere] ${t.concluida ? "font-normal line-through" : ""}`}>{t.descricao}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-suave">
          {t.concluida ? (
            <span>Concluída {t.concluida_em ? dataHora(t.concluida_em) : ""}</span>
          ) : t.vencimento ? (
            <span className={atrasada ? "chip-erro" : hoje ? "chip-alerta" : ""}>{hoje ? `Hoje, ${horaSP(t.vencimento)}` : dataHora(t.vencimento)}</span>
          ) : (
            <span>Sem data</span>
          )}
          {vinculo && (
            <Link href={vinculo.href} className="font-semibold text-titan hover:underline [overflow-wrap:anywhere]">
              {vinculo.texto}
            </Link>
          )}
          {responsavel && <span>Responsável: {responsavel}</span>}
        </div>
      </div>
    </li>
  );
}
