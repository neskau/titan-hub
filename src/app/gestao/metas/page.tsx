import Link from "next/link";
import { CabecalhoPagina } from "@/components/Shell";
import { sessaoGestao } from "@/components/gestao/servidor";
import { BarraMeta } from "@/components/gestao/crm/BarraMeta";
import { hojeSP, nomeMes, pct, situacaoRitmo } from "@/components/gestao/crm/constantes";
import { atingido, carregarDesempenho, mesValido, type Desempenho } from "@/components/gestao/crm/desempenho";
import { EditorMeta } from "@/components/gestao/crm/EditorMeta";
import { ehGestor } from "@/components/gestao/crm/servidor";
import { brl, num } from "@/lib/formato";

export const metadata = { title: "Metas · Gestão · Titan" };

const deslocarMes = (mes: string, n: number) => {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

export default async function Metas({ searchParams }: { searchParams: { mes?: string } }) {
  const s = await sessaoGestao();
  const gestor = ehGestor(s);
  const mes = mesValido(searchParams.mes);
  const atual = hojeSP().slice(0, 7);
  const { linhas, ritmo, diasUteis, decorridos, erro } = await carregarDesempenho(mes);

  const equipe: Desempenho = linhas.reduce(
    (t, l) => ({
      ...t,
      meta: t.meta + l.meta,
      realizado: t.realizado + l.realizado,
      pedidos: t.pedidos + l.pedidos,
      oportunidades_abertas: t.oportunidades_abertas + l.oportunidades_abertas,
      valor_em_aberto: t.valor_em_aberto + l.valor_em_aberto,
      ganhos: t.ganhos + l.ganhos,
    }),
    { vendedora_id: "equipe", nome: "Equipe", meta: 0, realizado: 0, pedidos: 0, oportunidades_abertas: 0, valor_em_aberto: 0, ganhos: 0 }
  );

  return (
    <>
      <CabecalhoPagina
        titulo="Metas do mês"
        sub={`${nomeMes(mes)} · ${decorridos} de ${diasUteis} dias úteis · ritmo esperado ${pct(ritmo)}`}
        acoes={
          <nav className="flex flex-wrap items-center gap-2" aria-label="Escolher mês">
            <Link href={`/gestao/metas?mes=${deslocarMes(mes, -1)}`} className="btn px-3" aria-label="Mês anterior">
              ←
            </Link>
            <form method="get" className="flex gap-2">
              <label htmlFor="mes" className="sr-only">
                Mês
              </label>
              <input id="mes" name="mes" type="month" defaultValue={mes} className="campo w-auto py-1.5" />
              <button className="btn">Ver</button>
            </form>
            <Link href={`/gestao/metas?mes=${deslocarMes(mes, 1)}`} className="btn px-3" aria-label="Próximo mês">
              →
            </Link>
            {mes !== atual && (
              <Link href="/gestao/metas" className="btn">
                Mês atual
              </Link>
            )}
          </nav>
        }
      />

      <p className="text-sm text-suave">
        Realizado = pedidos não cancelados das empresas da carteira no mês. O traço na barra marca o ritmo esperado (dias úteis decorridos ÷ dias úteis do
        mês, seg–sex, sem feriados).
      </p>

      {erro && (
        <p role="alert" className="cartao border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Não foi possível carregar o desempenho agora. Tente recarregar a página.
        </p>
      )}

      {gestor && linhas.length > 0 && <CartaoDesempenho d={equipe} ritmo={ritmo} destaque />}

      {linhas.length === 0 && !erro ? (
        <p className="cartao p-6 text-center text-suave">Nenhuma vendedora ativa encontrada.</p>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3" aria-label="Desempenho por vendedora">
          {linhas.map((l) => (
            <CartaoDesempenho
              key={l.vendedora_id}
              d={l}
              ritmo={ritmo}
              editor={gestor ? <EditorMeta key={`${l.vendedora_id}-${mes}-${l.meta}`} vendedoraId={l.vendedora_id} nome={l.nome} mes={mes} valor={l.meta} /> : undefined}
            />
          ))}
        </section>
      )}
    </>
  );
}

function CartaoDesempenho({ d, ritmo, editor, destaque }: { d: Desempenho; ritmo: number; editor?: React.ReactNode; destaque?: boolean }) {
  const a = atingido(d.realizado, d.meta);
  const sit = situacaoRitmo(a, ritmo, d.meta);
  return (
    <article className={`cartao flex flex-col gap-3 p-4 ${destaque ? "border-titan/40" : ""}`} aria-label={`Desempenho de ${d.nome}`}>
      <header className="flex flex-wrap items-center gap-2">
        <h2 className={`font-semibold ${destaque ? "text-lg" : ""}`}>{destaque ? "Total da equipe" : d.nome}</h2>
        <span className="flex-1" />
        <span className={sit.chip}>{sit.rotulo}</span>
      </header>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-[26px] font-light leading-none">{brl(d.realizado)}</span>
        <span className="text-sm text-suave">de {d.meta > 0 ? brl(d.meta) : "meta não definida"}</span>
        {d.meta > 0 && <span className="ml-auto text-lg font-semibold">{pct(a)}</span>}
      </div>
      <BarraMeta atingido={a} ritmo={ritmo} rotulo={`Meta atingida por ${d.nome}`} />
      {d.meta > 0 && d.realizado < d.meta && <p className="text-xs text-suave">Faltam {brl(d.meta - d.realizado)} para a meta.</p>}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-suave">Pedidos</dt>
          <dd className="font-semibold">{num(d.pedidos)}</dd>
        </div>
        <div>
          <dt className="text-xs text-suave">Ganhos no mês</dt>
          <dd className="font-semibold">{num(d.ganhos)}</dd>
        </div>
        <div>
          <dt className="text-xs text-suave">Oport. abertas</dt>
          <dd className="font-semibold">{num(d.oportunidades_abertas)}</dd>
        </div>
        <div>
          <dt className="text-xs text-suave">Valor em aberto</dt>
          <dd className="font-semibold">{brl(d.valor_em_aberto)}</dd>
        </div>
      </dl>
      {editor}
    </article>
  );
}
