import "server-only";
import { inicioDoDia, limparTermo } from "@/components/gestao/servidor";
import { nomeEmpresa } from "@/components/gestao/rotulos";
import { supabaseServidor } from "@/lib/supabase/server";
import { soDigitos } from "@/lib/formato";
import { diasDesde, hojeSP, somarDias } from "./constantes";
import type { CardFunil, Membro, Oportunidade } from "./tipos";

export const CAMPOS_OPORTUNIDADE =
  "id, titulo, empresa_id, contato_nome, contato_telefone, cidade, uf, cnpj, vendedora_id, etapa, valor_estimado, kwp, origem, motivo_perda, previsao_fechamento, fechado_em, criado_em, atualizado_em, empresas(id, razao_social, nome_fantasia, telefone, cidade, uf, cnpj, vendedora_id)";

/** Monta o filtro de busca (título, contato, cidade, CNPJ e nome da empresa). Devolve null se não houver termo. */
export async function filtroBusca(q?: string): Promise<string | null> {
  const termo = limparTermo(q);
  if (!termo) return null;
  const sb = supabaseServidor();
  const partes = [`titulo.ilike.%${termo}%`, `contato_nome.ilike.%${termo}%`, `cidade.ilike.%${termo}%`];
  const dig = soDigitos(termo);
  if (dig.length >= 4) partes.push(`cnpj.ilike.%${dig}%`, `contato_telefone.ilike.%${dig}%`);
  const { data } = await sb
    .from("empresas")
    .select("id")
    .or(`razao_social.ilike.%${termo}%,nome_fantasia.ilike.%${termo}%`)
    .limit(50);
  const ids = ((data as { id: string }[] | null) ?? []).map((e) => e.id);
  if (ids.length) partes.push(`empresa_id.in.(${ids.join(",")})`);
  return partes.join(",");
}

/** Data da última atividade por oportunidade e por empresa (últimos 90 dias). */
export async function ultimasAtividades(): Promise<{ porOport: Map<string, string>; porEmpresa: Map<string, string> }> {
  const desde = inicioDoDia(somarDias(hojeSP(), -90));
  const { data } = await supabaseServidor()
    .from("atividades")
    .select("oportunidade_id, empresa_id, criado_em")
    .gte("criado_em", desde)
    .order("criado_em", { ascending: false })
    .limit(5000);
  const porOport = new Map<string, string>();
  const porEmpresa = new Map<string, string>();
  for (const a of (data as { oportunidade_id: string | null; empresa_id: string | null; criado_em: string }[] | null) ?? []) {
    if (a.oportunidade_id && !porOport.has(a.oportunidade_id)) porOport.set(a.oportunidade_id, a.criado_em);
    if (a.empresa_id && !porEmpresa.has(a.empresa_id)) porEmpresa.set(a.empresa_id, a.criado_em);
  }
  return { porOport, porEmpresa };
}

export const nomeOportunidade = (o: Pick<Oportunidade, "empresas" | "contato_nome">) =>
  o.empresas ? nomeEmpresa(o.empresas) : o.contato_nome || "Contato sem nome";

export const cidadeOportunidade = (o: Pick<Oportunidade, "empresas" | "cidade" | "uf">) => {
  const cidade = o.cidade || o.empresas?.cidade;
  const uf = o.uf || o.empresas?.uf;
  return cidade ? `${cidade}${uf ? `/${uf}` : ""}` : null;
};

export const telefoneOportunidade = (o: Pick<Oportunidade, "empresas" | "contato_telefone">) =>
  o.contato_telefone || o.empresas?.telefone || null;

/** Converte a oportunidade no card do funil. */
export function paraCard(
  o: Oportunidade,
  equipe: Membro[],
  ultimas: { porOport: Map<string, string>; porEmpresa: Map<string, string> }
): CardFunil {
  const datas = [o.criado_em, ultimas.porOport.get(o.id), o.empresa_id ? ultimas.porEmpresa.get(o.empresa_id) : undefined].filter(
    (d): d is string => !!d
  );
  const ultima = datas.sort().at(-1) ?? o.criado_em;
  return {
    id: o.id,
    titulo: o.titulo,
    etapa: o.etapa,
    nome: nomeOportunidade(o),
    cidade: cidadeOportunidade(o),
    valor: o.valor_estimado != null ? Number(o.valor_estimado) : null,
    kwp: o.kwp != null ? Number(o.kwp) : null,
    vendedora: equipe.find((m) => m.id === o.vendedora_id)?.nome ?? null,
    telefone: telefoneOportunidade(o),
    diasSemAtividade: diasDesde(ultima),
    origem: o.origem,
  };
}
