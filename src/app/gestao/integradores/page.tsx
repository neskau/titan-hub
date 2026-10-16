import Link from "next/link";
import { CabecalhoPagina } from "@/components/Shell";
import { SEGMENTOS, STATUS_EMPRESA, TODOS_STATUS_EMPRESA, data, nomeEmpresa } from "@/components/gestao/rotulos";
import { limparTermo, sessaoGestao } from "@/components/gestao/servidor";
import { formatarCnpj } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import type { Empresa } from "@/lib/tipos";

export const metadata = { title: "Integradores · Gestão · Titan" };

type LinhaEmpresa = Empresa & { vendedora: { nome: string } | null };

const ORDEM: Record<Empresa["status"], number> = { pendente: 0, aprovada: 1, bloqueada: 2, recusada: 3 };

export default async function Integradores({ searchParams }: { searchParams: { status?: string; segmento?: string; q?: string } }) {
  await sessaoGestao();
  const status = TODOS_STATUS_EMPRESA.find((s) => s === searchParams.status);
  const segmento = SEGMENTOS.find((s) => s === searchParams.segmento);
  const termo = limparTermo(searchParams.q);

  let consulta = supabaseServidor()
    .from("empresas")
    .select("*, vendedora:perfis!empresas_vendedora_fk(nome)")
    .order("criado_em", { ascending: false })
    .limit(1000);
  if (status) consulta = consulta.eq("status", status);
  if (segmento) consulta = consulta.eq("segmento", segmento);
  if (termo) {
    const t = `%${termo}%`;
    const digitos = termo.replace(/\D/g, "");
    const filtros = [`razao_social.ilike.${t}`, `nome_fantasia.ilike.${t}`, `cidade.ilike.${t}`];
    if (digitos.length >= 4) filtros.push(`cnpj.ilike.%${digitos}%`);
    consulta = consulta.or(filtros.join(","));
  }
  const { data: dados } = await consulta;
  // Pendentes primeiro; dentro de cada situação, os mais recentes primeiro (ordem estável).
  const lista = ((dados as unknown as LinhaEmpresa[] | null) ?? []).sort((a, b) => ORDEM[a.status] - ORDEM[b.status]);
  const pendentes = lista.filter((e) => e.status === "pendente").length;

  return (
    <>
      <CabecalhoPagina
        titulo="Integradores"
        sub={pendentes > 0 ? `${pendentes} cadastro(s) aguardando aprovação` : "Empresas cadastradas no portal"}
        acoes={
          <Link href="/gestao/integradores/novo" className="btn-primario">
            Novo integrador
          </Link>
        }
      />

      <form method="get" className="cartao grid gap-3 p-4 sm:grid-cols-[1fr_170px_210px_auto] sm:items-end" aria-label="Filtros de integradores">
        <div>
          <label className="rotulo" htmlFor="q">
            Buscar
          </label>
          <input id="q" name="q" type="search" defaultValue={searchParams.q ?? ""} placeholder="Empresa, CNPJ ou cidade" className="campo" />
        </div>
        <div>
          <label className="rotulo" htmlFor="status">
            Situação
          </label>
          <select id="status" name="status" defaultValue={status ?? ""} className="campo">
            <option value="">Todas</option>
            {TODOS_STATUS_EMPRESA.map((s) => (
              <option key={s} value={s}>
                {STATUS_EMPRESA[s].rotulo}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="rotulo" htmlFor="segmento">
            Segmento
          </label>
          <select id="segmento" name="segmento" defaultValue={segmento ?? ""} className="campo">
            <option value="">Todos</option>
            {SEGMENTOS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <button className="btn-primario">Filtrar</button>
          <Link href="/gestao/integradores" className="btn">
            Limpar
          </Link>
        </div>
      </form>

      {lista.length === 0 ? (
        <p className="cartao p-6 text-center text-suave">Nenhuma empresa com esses filtros.</p>
      ) : (
        <div className="cartao overflow-x-auto">
          <table className="tabela w-full min-w-[760px] text-sm">
            <thead>
              <tr>
                <th>Empresa</th>
                <th>CNPJ</th>
                <th>Cidade</th>
                <th>Segmento</th>
                <th>Vendedora</th>
                <th>Cadastro</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((e) => (
                <tr key={e.id} className={`hover:bg-fundo ${e.status === "pendente" ? "bg-amber-50/40" : ""}`}>
                  <td>
                    <Link href={`/gestao/integradores/${e.id}`} className="font-semibold text-titan hover:underline">
                      {nomeEmpresa(e)}
                    </Link>
                    {e.nome_fantasia && <p className="text-xs text-suave">{e.razao_social}</p>}
                  </td>
                  <td className="whitespace-nowrap">{formatarCnpj(e.cnpj)}</td>
                  <td>{e.cidade ? `${e.cidade}/${e.uf ?? ""}` : "—"}</td>
                  <td>{e.segmento ?? "—"}</td>
                  <td>{e.vendedora?.nome ?? <span className="text-suave">Sem vendedora</span>}</td>
                  <td>{data(e.criado_em)}</td>
                  <td>
                    <span className={STATUS_EMPRESA[e.status].chip}>{STATUS_EMPRESA[e.status].rotulo}</span>
                    {e.pode_boleto && <span className="chip-info ml-1">Boleto</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
