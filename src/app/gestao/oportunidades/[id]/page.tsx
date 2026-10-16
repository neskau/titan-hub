import Link from "next/link";
import { notFound } from "next/navigation";
import { CabecalhoPagina } from "@/components/Shell";
import { Linha } from "@/components/gestao/Linha";
import { data, dataHora, nomeEmpresa } from "@/components/gestao/rotulos";
import { ehUuid, sessaoGestao } from "@/components/gestao/servidor";
import { empresasDaCarteira } from "@/components/gestao/crm/carteira";
import { etapaInfo, rotuloOrigem } from "@/components/gestao/crm/constantes";
import { CAMPOS_OPORTUNIDADE, cidadeOportunidade, nomeOportunidade, telefoneOportunidade } from "@/components/gestao/crm/consultas";
import { FormAtividade } from "@/components/gestao/crm/FormAtividade";
import { FormOportunidade } from "@/components/gestao/crm/FormOportunidade";
import { Icone } from "@/components/gestao/crm/Icone";
import { LinhaDoTempoCrm } from "@/components/gestao/crm/LinhaDoTempoCrm";
import { SeletorEtapa } from "@/components/gestao/crm/SeletorEtapa";
import { ehGestor, listarEquipe } from "@/components/gestao/crm/servidor";
import type { Atividade, Oportunidade } from "@/components/gestao/crm/tipos";
import { brl, formatarCnpj, linkWhatsapp, num } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";

export const metadata = { title: "Oportunidade · Gestão · Titan" };

const numTexto = (v: number | null) => (v == null ? "" : String(Number(v)).replace(".", ","));

export default async function PaginaOportunidade({ params }: { params: { id: string } }) {
  const s = await sessaoGestao();
  if (!ehUuid(params.id)) notFound();
  const gestor = ehGestor(s);
  const sb = supabaseServidor();
  const [{ data: op }, { data: ativ }, equipe, empresas] = await Promise.all([
    sb.from("oportunidades").select(CAMPOS_OPORTUNIDADE).eq("id", params.id).maybeSingle(),
    sb.from("atividades").select("*").eq("oportunidade_id", params.id).order("criado_em", { ascending: false }).limit(300),
    listarEquipe(),
    empresasDaCarteira(),
  ]);
  // A RLS esconde oportunidades fora da carteira: para a vendedora, é como se não existisse.
  const o = op as unknown as Oportunidade | null;
  if (!o) notFound();
  const atividades = (ativ as Atividade[] | null) ?? [];
  const etapa = etapaInfo(o.etapa);
  const telefone = telefoneOportunidade(o);
  const cidade = cidadeOportunidade(o);
  const vendedora = equipe.find((m) => m.id === o.vendedora_id);
  const equipeAtiva = equipe.filter((m) => m.ativo || m.id === o.vendedora_id).map(({ id, nome, papel }) => ({ id, nome, papel }));
  const tarefasAbertas = atividades.filter((a) => a.tipo === "tarefa" && !a.concluida).length;

  // Prospect sem empresa: leva para o cadastro do integrador já preenchido.
  const cadastro = new URLSearchParams({ oportunidade: o.id });
  for (const [k, v] of [
    ["cnpj", o.cnpj],
    ["nome", o.contato_nome],
    ["telefone", o.contato_telefone],
    ["cidade", o.cidade],
    ["uf", o.uf],
  ] as const)
    if (v) cadastro.set(k, v);

  // Empresa vinculada que não está mais na lista (ex.: recusada) continua aparecendo no formulário.
  const opcoesEmpresa =
    o.empresas && !empresas.some((e) => e.id === o.empresa_id)
      ? [{ id: o.empresas.id, nome: nomeEmpresa(o.empresas), cidade: o.empresas.cidade, vendedora_id: o.empresas.vendedora_id ?? null }, ...empresas]
      : empresas;

  return (
    <>
      <Link href="/gestao/funil" className="text-sm font-semibold text-titan hover:underline">
        ← Funil de vendas
      </Link>
      <CabecalhoPagina
        titulo={o.titulo}
        sub={[nomeOportunidade(o), cidade, rotuloOrigem(o.origem)].filter(Boolean).join(" · ")}
        acoes={
          <div className="flex flex-wrap items-center gap-2">
            <span className={etapa.chip}>{etapa.rotulo}</span>
            {!o.vendedora_id && <span className="chip-alerta">Aguardando distribuição</span>}
            {telefone && (
              <a href={linkWhatsapp(telefone, "Olá! Aqui é da Titan Distribuidora Solar.")} target="_blank" rel="noreferrer" className="btn-whats">
                <Icone tipo="whats" />
                WhatsApp
              </a>
            )}
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <section className="cartao flex flex-col gap-3 p-4" aria-labelledby="etapa">
            <h2 id="etapa" className="font-semibold">
              Etapa
            </h2>
            <SeletorEtapa id={o.id} titulo={o.titulo} etapa={o.etapa} />
            {o.etapa === "perdido" && o.motivo_perda && (
              <p className="text-sm">
                <span className="font-semibold">Motivo da perda:</span> {o.motivo_perda}
              </p>
            )}
            {o.fechado_em && <p className="text-sm text-suave">Fechada em {dataHora(o.fechado_em)}</p>}
          </section>

          <FormAtividade
            oportunidadeId={o.id}
            eu={s.userId}
            gestor={gestor}
            equipe={equipe.filter((m) => m.ativo).map(({ id, nome }) => ({ id, nome }))}
          />

          <section className="flex flex-col gap-2" aria-labelledby="linha">
            <div className="flex items-center gap-2">
              <h2 id="linha" className="text-lg font-semibold">
                Linha do tempo
              </h2>
              {tarefasAbertas > 0 && <span className="chip-alerta">{tarefasAbertas} tarefa(s) em aberto</span>}
            </div>
            <LinhaDoTempoCrm atividades={atividades} equipe={equipe} agora={Date.now()} />
          </section>

          <section className="cartao flex flex-col gap-3 p-4" aria-labelledby="dados">
            <h2 id="dados" className="font-semibold">
              Dados da oportunidade
            </h2>
            <FormOportunidade
              id={o.id}
              inicial={{
                titulo: o.titulo,
                empresa_id: o.empresa_id ?? "",
                contato_nome: o.contato_nome ?? "",
                contato_telefone: o.contato_telefone ?? "",
                cidade: o.cidade ?? "",
                uf: o.uf ?? "",
                cnpj: o.cnpj ?? "",
                valor_estimado: numTexto(o.valor_estimado),
                kwp: numTexto(o.kwp),
                origem: o.origem,
                previsao_fechamento: o.previsao_fechamento ?? "",
                vendedora_id: o.vendedora_id ?? "",
              }}
              empresas={opcoesEmpresa}
              equipe={equipeAtiva}
              gestor={gestor}
              vendedoraAtualNome={vendedora?.nome}
            />
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <dl className="cartao flex flex-col gap-1 p-4 text-sm">
            <h2 className="mb-1 font-semibold">Resumo</h2>
            <Linha rotulo="Valor estimado" valor={brl(o.valor_estimado != null ? Number(o.valor_estimado) : null)} />
            <Linha rotulo="Potência" valor={o.kwp != null ? `${num(Number(o.kwp), 2)} kWp` : "—"} />
            <Linha rotulo="Previsão" valor={o.previsao_fechamento ? data(`${o.previsao_fechamento}T12:00:00-03:00`) : "—"} />
            <Linha rotulo="Vendedora" valor={vendedora?.nome ?? "Sem vendedora"} />
            <Linha rotulo="Origem" valor={rotuloOrigem(o.origem)} />
            <Linha rotulo="Criada em" valor={dataHora(o.criado_em)} />
            {o.contato_nome && <Linha rotulo="Contato" valor={o.contato_nome} />}
            {o.cnpj && <Linha rotulo="CNPJ" valor={formatarCnpj(o.cnpj)} />}
          </dl>

          {o.empresas ? (
            <div className="cartao flex flex-col gap-2 p-4 text-sm">
              <h2 className="font-semibold">Integrador</h2>
              <p className="font-semibold">{nomeEmpresa(o.empresas)}</p>
              {o.empresas.cnpj && <p className="text-suave">CNPJ {formatarCnpj(o.empresas.cnpj)}</p>}
              <Link href={`/gestao/integradores/${o.empresas.id}`} className="btn self-start py-1.5 text-sm">
                Abrir ficha do integrador
              </Link>
            </div>
          ) : (
            <div className="cartao flex flex-col gap-2 p-4 text-sm">
              <h2 className="font-semibold">Prospect sem cadastro</h2>
              <p className="text-suave">Quando o cliente fechar ou pedir acesso ao portal, cadastre-o como integrador já vinculado a esta oportunidade.</p>
              <Link href={`/gestao/integradores/novo?${cadastro.toString()}`} className="btn-primario self-start py-1.5 text-sm">
                Cadastrar como integrador
              </Link>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
