import "server-only";
import { cache } from "react";
import { revalidatePath } from "next/cache";
import { mensagemErro } from "@/components/gestao/servidor";
import { supabaseServidor } from "@/lib/supabase/server";
import type { Sessao } from "@/lib/sessao";
import type { Membro } from "./tipos";

export const ehGestor = (s: Sessao) => s.perfil.papel === "gestor" || s.perfil.papel === "admin";

/** Equipe comercial (vendedoras primeiro). Inclui inativos para mostrar nomes antigos; filtre `ativo` nos selects. */
export const listarEquipe = cache(async (): Promise<Membro[]> => {
  const { data } = await supabaseServidor()
    .from("perfis")
    .select("id, nome, papel, ativo")
    .in("papel", ["vendedora", "gestor", "admin"])
    .order("nome");
  const lista = (data as Membro[] | null) ?? [];
  return lista.sort(
    (a, b) => Number(a.papel !== "vendedora") - Number(b.papel !== "vendedora") || a.nome.localeCompare(b.nome, "pt-BR")
  );
});

/** Traduz erros do banco no contexto do CRM. */
export function erroCrm(m: string | undefined, padrao?: string) {
  if (m && /row-level security|violates row|permission denied|Sem permissão/i.test(m)) return "Você não tem acesso a este registro.";
  if (m && /Informe o motivo da perda/i.test(m)) return "Informe o motivo da perda.";
  if (m && /Só o gestor pode transferir/i.test(m)) return m.endsWith(".") ? m : `${m}.`;
  if (m && /invalid input syntax for type uuid/i.test(m)) return "Registro inválido.";
  return mensagemErro(m, padrao);
}

export const SEM_ACESSO = "Você não tem acesso a este registro.";
export const SESSAO_EXPIRADA = "Sua sessão expirou ou você não tem acesso.";

/** Revalida as telas do CRM afetadas por uma mudança. */
export function revalidarCrm(ids: { oportunidade?: string | null; empresa?: string | null } = {}) {
  revalidatePath("/gestao");
  revalidatePath("/gestao/funil");
  revalidatePath("/gestao/tarefas");
  revalidatePath("/gestao/metas");
  if (ids.oportunidade) revalidatePath(`/gestao/oportunidades/${ids.oportunidade}`);
  if (ids.empresa) revalidatePath(`/gestao/integradores/${ids.empresa}`);
}
