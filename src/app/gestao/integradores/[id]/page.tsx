import Link from "next/link";
import { notFound } from "next/navigation";
import { CabecalhoPagina } from "@/components/Shell";
import { AcoesIntegrador } from "@/components/gestao/AcoesIntegrador";
import { Linha } from "@/components/gestao/Linha";
import { PAPEIS, STATUS_EMPRESA, STATUS_PEDIDO, data, dataHora, nomeEmpresa } from "@/components/gestao/rotulos";
import { ehUuid, listarCdsGestao, sessaoGestao } from "@/components/gestao/servidor";
import { brl, formatarCnpj, linkWhatsapp } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import type { Empresa, Pedido, Perfil } from "@/lib/tipos";
import { etapaInfo, type Etapa } from "@/components/gestao/crm/constantes";
import { FormAtividade } from "@/components/gestao/crm/FormAtividade";
import { LinhaDoTempoCrm } from "@/components/gestao/crm/LinhaDoTempoCrm";
import { ehGestor, listarEquipe } from "@/components/gestao/crm/servidor";
import type { Atividade } from "@/components/gestao/crm/tipos";
import { AvisoCadastro } from "@/components/gestao/cadastro/AvisoCadastro";
import { AdicionarUsuario } from "@/components/gestao/cadastro/AdicionarUsuario";

interface OportunidadeEmpresa {
  id: string;
  titulo: string;
  etapa: Etapa;
  valor_estimado: number | null;
  kwp: number | null;
  vendedora_id: string | null;
  criado_em: string;
}

export const metadata = { title: "Integrador · Gestão · Titan" };

const telefone = (t: string) => {
  const d = t.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t;
};

export default async function DetalheIntegrador({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { convite?: string; vinculado?: string };
}) {
  const s = await sessaoGestao();
  if (!ehUuid(params.id)) notFound();
  const sb = supabaseServidor();
  const [{ data: emp }, { data: usuarios }, { data: pedidos }, { data: equipe }, cds] = await Promise.all([
    sb.from("empresas").select("*").eq("id", params.id).maybeSingle(),
    sb.from("perfis").select("*").eq("empresa_id", params.id).order("criado_em"),
    sb
      .from("pedidos")
      .select("id, numero, empresa_id, cd_id, status, pagamento, subtotal, frete, total, rastreio, nota_fiscal, criado_em")
      .eq("empresa_id", params.id)
      .order("criado_em", { ascending: false })
      .limit(100),
    sb.from("perfis").select("id, nome, papel, ativo").in("papel", ["vendedora", "gestor", "admin"]).order("nome"),
    listarCdsGestao(),
  ]);
  const e = emp as (Empresa & { tabela_preco: string; bling_contato_id: number | null }) | null;
  if (!e) notFound();
  const lista = (pedidos as Pedido[] | null) ?? [];
  const usuariosLista = (usuarios as Perfil[] | null) ?? [];
  // Inativos só aparecem se ainda forem os responsáveis atuais.
  const equipeLista = ((equipe as { id: string; nome: string; papel: string; ativo: boolean }[] | null) ?? []).filter(
    (v) => v.ativo || v.id === e.vendedora_id
  );
  // Vendedoras primeiro; gestores/admins também podem ser responsáveis.
  equipeLista.sort((a, b) => Number(a.papel !== "vendedora") - Number(b.papel !== "vendedora") || a.nome.localeCompare(b.nome, "pt-BR"));
  const vendedoraAtual = equipeLista.find((v) => v.id === e.vendedora_id);
  const totalComprado = lista.filter((p) => p.status !== "cancelado").reduce((acc, p) => acc + Number(p.total), 0);
  const nomeCd = (id: string) => cds.find((c) => c.id === id)?.nome ?? id;
  const podeBloquear = s.perfil.papel === "gestor" || s.perfil.papel === "admin";

  // CRM: oportunidades da empresa e linha do tempo (atividades da empresa + das oportunidades dela).
  const [{ data: ops }, equipeCrm] = await Promise.all([
    sb
      .from("oportunidades")
      .select("id, titulo, etapa, valor_estimado, kwp, vendedora_id, criado_em")
      .eq("empresa_id", e.id)
      .order("criado_em", { ascending: false })
      .limit(100),
    listarEquipe(),
  ]);
  const oportunidades = (ops as OportunidadeEmpresa[] | null) ?? [];
  const idsOport = oportunidades.map((o) => o.id);
  const { data: ativ } = await sb
    .from("atividades")
    .select("*")
    .or(`empresa_id.eq.${e.id}${idsOport.length ? `,oportunidade_id.in.(${idsOport.join(",")})` : ""}`)
    .order("criado_em", { ascending: false })
    .limit(300);
  const atividades = (ativ as Atividade[] | null) ?? [];
  const titulosOport = Object.fromEntries(oportunidades.map((o) => [o.id, o.titulo]));
  const nomeMembro = (id: string | null) => equipeCrm.find((m) => m.id === id)?.nome ?? "Sem vendedora";

  return (
    <>
      <Link href="/gestao/integradores" className="text-sm font-semibold text-titan hover:underline">
        ← Integradores
      </Link>
      <CabecalhoPagina
        titulo={nomeEmpresa(e)}
        sub={`CNPJ ${formatarCnpj(e.cnpj)} · cadastrada em ${data(e.criado_em)}`}
        acoes={<span className={STATUS_EMPRESA[e.status].chip}>{STATUS_EMPRESA[e.status].rotulo}</span>}
      />
      <AvisoCadastro params={searchParams} />

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <dl className="cartao grid gap-x-8 gap-y-1 p-4 text-sm md:grid-cols-2">
            <h2 className="mb-1 font-semibold md:col-span-2">Dados da empresa</h2>
            <Linha rotulo="Razão social" valor={e.razao_social} />
            <Linha rotulo="Nome fantasia" valor={e.nome_fantasia || "—"} />
            <Linha rotulo="CNPJ" valor={formatarCnpj(e.cnpj)} />
            <Linha rotulo="Cidade" valor={e.cidade ? `${e.cidade}/${e.uf ?? ""}` : "—"} />
            <Linha
              rotulo="Telefone"
              valor={
                e.telefone ? (
                  <a href={linkWhatsapp(e.telefone)} target="_blank" rel="noreferrer" className="text-titan hover:underline">
                    {telefone(e.telefone)}
                  </a>
                ) : (
                  "—"
                )
              }
            />
            <Linha rotulo="Segmento" valor={e.segmento ?? "—"} />
            <Linha rotulo="Vendedora" valor={vendedoraAtual?.nome ?? "Sem vendedora"} />
            <Linha rotulo="CD padrão" valor={nomeCd(e.cd_padrao)} />
            <Linha rotulo="Boleto faturado" valor={e.pode_boleto ? "Liberado" : "Não liberado"} />
            <Linha rotulo="Tabela de preço" valor={e.tabela_preco} />
            {e.bling_contato_id && <Linha rotulo="Contato no Bling" valor={String(e.bling_contato_id)} />}
            <Linha rotulo="Total comprado" valor={brl(totalComprado)} />
          </dl>

          <section className="flex flex-col gap-2" aria-labelledby="usuarios">
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="usuarios" className="text-lg font-semibold">
                Usuários vinculados
              </h2>
              <span className="flex-1" />
              <AdicionarUsuario empresaId={e.id} cnpj={e.cnpj} />
            </div>
            {usuariosLista.length === 0 ? (
              <p className="cartao p-4 text-sm text-suave">Nenhum usuário vinculado.</p>
            ) : (
              <div className="cartao overflow-x-auto">
                <table className="tabela w-full min-w-[520px] text-sm">
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>E-mail</th>
                      <th>Telefone</th>
                      <th>Acesso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usuariosLista.map((u) => (
                      <tr key={u.id}>
                        <td className="font-semibold">{u.nome}</td>
                        <td className="[overflow-wrap:anywhere]">
                          <a href={`mailto:${u.email}`} className="hover:text-titan hover:underline">
                            {u.email}
                          </a>
                        </td>
                        <td>{u.telefone ? telefone(u.telefone) : "—"}</td>
                        <td>
                          {u.ativo ? <span className="chip-ok">{PAPEIS[u.papel]}</span> : <span className="chip-erro">Inativo</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="flex flex-col gap-2" aria-labelledby="pedidos">
            <h2 id="pedidos" className="text-lg font-semibold">
              Pedidos
            </h2>
            {lista.length === 0 ? (
              <p className="cartao p-4 text-sm text-suave">Nenhum pedido desta empresa.</p>
            ) : (
              <div className="cartao overflow-x-auto">
                <table className="tabela w-full min-w-[520px] text-sm">
                  <thead>
                    <tr>
                      <th>Pedido</th>
                      <th>Data</th>
                      <th>CD</th>
                      <th>Situação</th>
                      <th className="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((p) => (
                      <tr key={p.id} className="hover:bg-fundo">
                        <td>
                          <Link href={`/gestao/pedidos/${p.id}`} className="font-semibold text-titan hover:underline">
                            nº {p.numero}
                          </Link>
                        </td>
                        <td>{dataHora(p.criado_em)}</td>
                        <td>{nomeCd(p.cd_id)}</td>
                        <td>
                          <span className={STATUS_PEDIDO[p.status].chip}>{STATUS_PEDIDO[p.status].rotulo}</span>
                        </td>
                        <td className="text-right font-semibold">{brl(Number(p.total))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="flex flex-col gap-2" aria-labelledby="oportunidades">
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="oportunidades" className="text-lg font-semibold">
                Oportunidades
              </h2>
              <span className="flex-1" />
              <Link href={`/gestao/funil/nova?empresa=${e.id}`} className="btn-primario py-1.5 text-sm">
                + Nova oportunidade
              </Link>
            </div>
            {oportunidades.length === 0 ? (
              <p className="cartao p-4 text-sm text-suave">Nenhuma oportunidade com esta empresa.</p>
            ) : (
              <div className="cartao overflow-x-auto">
                <table className="tabela w-full min-w-[560px] text-sm">
                  <thead>
                    <tr>
                      <th>Oportunidade</th>
                      <th>Etapa</th>
                      <th>Vendedora</th>
                      <th>Criada em</th>
                      <th className="text-right">Valor estimado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {oportunidades.map((o) => (
                      <tr key={o.id} className="hover:bg-fundo">
                        <td>
                          <Link href={`/gestao/oportunidades/${o.id}`} className="font-semibold text-titan hover:underline">
                            {o.titulo}
                          </Link>
                        </td>
                        <td>
                          <span className={etapaInfo(o.etapa).chip}>{etapaInfo(o.etapa).rotulo}</span>
                        </td>
                        <td>{nomeMembro(o.vendedora_id)}</td>
                        <td>{data(o.criado_em)}</td>
                        <td className="text-right font-semibold">{brl(o.valor_estimado != null ? Number(o.valor_estimado) : null)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="flex flex-col gap-2" aria-labelledby="linha-do-tempo">
            <h2 id="linha-do-tempo" className="text-lg font-semibold">
              Linha do tempo
            </h2>
            <FormAtividade
              empresaId={e.id}
              eu={s.userId}
              gestor={ehGestor(s)}
              equipe={equipeCrm.filter((m) => m.ativo).map(({ id, nome }) => ({ id, nome }))}
            />
            <LinhaDoTempoCrm atividades={atividades} equipe={equipeCrm} oportunidades={titulosOport} agora={Date.now()} />
          </section>
        </div>

        <aside>
          <AcoesIntegrador
            id={e.id}
            status={e.status}
            podeBloquear={podeBloquear}
            vendedoraId={e.vendedora_id}
            cdPadrao={e.cd_padrao}
            podeBoleto={e.pode_boleto}
            vendedoras={equipeLista}
            cds={cds.map((c) => ({ id: c.id, nome: c.nome, uf: c.uf, ativo: c.ativo }))}
          />
        </aside>
      </div>
    </>
  );
}
