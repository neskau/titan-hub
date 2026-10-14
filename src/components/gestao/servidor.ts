import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { exigirEquipe, obterSessao, type Sessao } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import type { CD, Papel } from "@/lib/tipos";

/** Sessão da equipe, consultada uma única vez por requisição (layout + página). */
export const sessaoGestao = cache(() => exigirEquipe());

/** Página restrita a gestor/admin; vendedora volta para o dashboard da gestão. */
export const sessaoGestor = cache(async () => {
  const s = await sessaoGestao();
  if (s.perfil.papel !== "gestor" && s.perfil.papel !== "admin") redirect("/gestao");
  return s;
});

/** Para Server Actions: devolve a sessão se o usuário for da equipe ativa com um dos papéis, senão null. */
export async function sessaoAcao(papeis: Papel[] = ["vendedora", "gestor", "admin"]): Promise<Sessao | null> {
  const s = await obterSessao();
  if (!s || !s.perfil.ativo || !papeis.includes(s.perfil.papel)) return null;
  return s;
}

/** Todos os CDs (ativos primeiro, matriz primeiro). */
export const listarCdsGestao = cache(async (): Promise<CD[]> => {
  const { data } = await supabaseServidor()
    .from("cds")
    .select("*")
    .order("ativo", { ascending: false })
    .order("matriz", { ascending: false })
    .order("nome");
  return (data as CD[] | null) ?? [];
});

/** Remove caracteres que quebram o filtro `or` do PostgREST. */
export function limparTermo(q?: string) {
  return (q ?? "")
    .replace(/[^0-9A-Za-zÀ-ÿ\s\-/._]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

export const ehUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

/** URL pública do datasheet no bucket 'datasheets'. */
export function urlDatasheet(path: string | null): string | null {
  if (!path) return null;
  return supabaseServidor().storage.from("datasheets").getPublicUrl(path).data.publicUrl;
}

/** Primeiro dia do mês atual e hoje, no fuso de Brasília (AAAA-MM-DD). */
export function periodoPadrao(): { de: string; ate: string } {
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return { de: hoje.slice(0, 8) + "01", ate: hoje };
}

export const dataValida = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) ? s : undefined);

/** Converte AAAA-MM-DD (Brasília, UTC−3) no instante de início do dia ou do dia seguinte. */
export function inicioDoDia(d: string) {
  return `${d}T00:00:00-03:00`;
}
export function inicioDoDiaSeguinte(d: string) {
  const t = new Date(`${d}T00:00:00-03:00`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString();
}

/** Traduz erros do Postgres/PostgREST em mensagens para a equipe. */
export function mensagemErro(m: string | undefined, padrao = "Não foi possível salvar agora. Tente novamente."): string {
  if (!m) return padrao;
  if (/Sem permissão|permission denied|row-level security/i.test(m)) return "Você não tem permissão para esta ação.";
  if (/duplicate key|unique/i.test(m)) return "Já existe um registro com esses dados.";
  // Mensagens das nossas funções SQL já estão em português: repassa.
  if (/^[A-ZÀ-Ú][^\n]{3,160}$/.test(m) && !/[{}]|violates|column|relation|function/i.test(m)) return m;
  return padrao;
}
