import Link from "next/link";
import { CabecalhoPagina } from "@/components/Shell";
import { data } from "@/components/gestao/rotulos";
import { inicioDoDia, sessaoGestao } from "@/components/gestao/servidor";
import { ETAPAS_ABERTAS, IDS_ORIGEM, ORIGENS, hojeSP, rotuloOrigem, type Origem } from "@/components/gestao/crm/constantes";
import { CAMPOS_OPORTUNIDADE, cidadeOportunidade, filtroBusca, nomeOportunidade, paraCard, ultimasAtividades } from "@/components/gestao/crm/consultas";
import { Distribuicao, type LeadSemDona } from "@/components/gestao/crm/Distribuicao";
import { Kanban } from "@/components/gestao/crm/Kanban";
import { ehGestor, listarEquipe } from "@/components/gestao/crm/servidor";
import type { Oportunidade } from "@/components/gestao/crm/tipos";
import { brl, num } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";

export const metadata = { title: "Funil de vendas · Gestão · Titan" };

export default async function Funil({ searchParams }: { searchParams: { q?: string; origem?: string; vendedora?: string } }) {
  const s = await sessaoGestao();
  const gestor = ehGestor(s);
  const sb = supabaseServidor();
  const equipe = await listarEquipe();
  const origem = (IDS_ORIGEM as string[]).includes(searchParams.origem ?? "") ? (searchParams.origem as Origem) : undefined;
  const vendedora = gestor ? equipe.find((m) => m.id === searchParams.vendedora)?.id : undefined;
  const busca = await filtroBusca(searchParams.q);
  const inicioMes = inicioDoDia(hojeSP().slice(0, 8) + "01");

  // A RLS já limita a vendedora à própria carteira; os filtros abaixo são só da tela.
  let qAbertas = sb.from("oportunidades").select(CAMPOS_OPORTUNIDADE).in("etapa", ETAPAS_ABERTAS).order("criado_em", { ascending: false }).limit(1000);
  let qFechadas = sb
    .from("oportunidades")
    .select(CAMPOS_OPORTUNIDADE)
    .in("etapa", ["ganho", "perdido"])
    .gte("fechado_em", inicioMes)
    .order("fechado_em", { ascending: false })
    .limit(500);
  if (origem) {
    qAbertas = qAbertas.eq("origem", origem);
    qFechadas = qFechadas.eq("origem", origem);
  }
  if (busca) {
    qAbertas = qAbertas.or(busca);
    qFechadas = qFechadas.or(busca);
  }
  if (vendedora) {
    qAbertas = qAbertas.eq("vendedora_id", vendedora);
    qFechadas = qFechadas.eq("vendedora_id", vendedora);
  }

  const [abertas, fechadas, ultimas] = await Promise.all([qAbertas, qFechadas, ultimasAtividades()]);
  const todas = [...((abertas.data as unknown as Oportunidade[] | null) ?? []), ...((fechadas.data as unknown as Oportunidade[] | null) ?? [])];

  // Sem vendedora = aguardando distribuição: vão para a faixa do gestor, não para as colunas.
  const semDona = todas.filter((o) => !o.vendedora_id && ETAPAS_ABERTAS.includes(o.etapa));
  const noFunil = todas.filter((o) => !semDona.includes(o));
  const cards = noFunil.map((o) => paraCard(o, equipe, ultimas));
  const emAberto = cards.filter((c) => ETAPAS_ABERTAS.includes(c.etapa));
  const somaAberta = emAberto.reduce((acc, c) => acc + (c.valor ?? 0), 0);

  const leads: LeadSemDona[] = semDona.map((o) => ({
    id: o.id,
    titulo: o.titulo,
    nome: nomeOportunidade(o),
    cidade: cidadeOportunidade(o),
    origem: rotuloOrigem(o.origem),
    valor: o.valor_estimado != null ? Number(o.valor_estimado) : null,
    recebido: `recebido em ${data(o.criado_em)}`,
  }));
  const equipeAtiva = equipe.filter((m) => m.ativo).map(({ id, nome, papel }) => ({ id, nome, papel }));
  const erro = abertas.error || fechadas.error;
  const filtrando = !!(busca || origem || vendedora);

  return (
    <>
      <CabecalhoPagina
        titulo="Funil de vendas"
        sub={`${num(emAberto.length)} oportunidades em aberto · ${brl(somaAberta)}${gestor ? "" : " · sua carteira"}`}
        acoes={
          <Link href="/gestao/funil/nova" className="btn-primario">
            + Nova oportunidade
          </Link>
        }
      />

      <form method="get" className="cartao flex flex-wrap items-end gap-3 p-4" aria-label="Filtros do funil">
        <div className="min-w-0 flex-1 basis-56">
          <label className="rotulo" htmlFor="q">
            Buscar
          </label>
          <input id="q" name="q" type="search" defaultValue={searchParams.q ?? ""} placeholder="Título, empresa, contato, cidade ou CNPJ" className="campo" />
        </div>
        <div className="basis-40">
          <label className="rotulo" htmlFor="origem">
            Origem
          </label>
          <select id="origem" name="origem" defaultValue={origem ?? ""} className="campo">
            <option value="">Todas</option>
            {ORIGENS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </div>
        {gestor && (
          <div className="basis-44">
            <label className="rotulo" htmlFor="vendedora">
              Vendedora
            </label>
            <select id="vendedora" name="vendedora" defaultValue={vendedora ?? ""} className="campo">
              <option value="">Toda a equipe</option>
              {equipe.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                  {m.ativo ? "" : " (inativa)"}
                </option>
              ))}
            </select>
          </div>
        )}
        <button className="btn-primario">Filtrar</button>
        {filtrando && (
          <Link href="/gestao/funil" className="btn">
            Limpar
          </Link>
        )}
      </form>

      {erro && (
        <p role="alert" className="cartao border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Não foi possível carregar o funil agora. Tente recarregar a página.
        </p>
      )}

      {gestor && !vendedora && <Distribuicao leads={leads} equipe={equipeAtiva} />}

      {cards.length === 0 && !erro ? (
        <div className="cartao flex flex-col items-center gap-3 p-8 text-center">
          <p className="font-semibold">{filtrando ? "Nenhuma oportunidade encontrada com esses filtros." : "Seu funil está vazio."}</p>
          <p className="text-sm text-suave">Cadastre a primeira oportunidade para começar a acompanhar suas negociações.</p>
          <Link href="/gestao/funil/nova" className="btn-primario">
            + Nova oportunidade
          </Link>
        </div>
      ) : (
        <Kanban cards={cards} gestor={gestor} />
      )}
    </>
  );
}
