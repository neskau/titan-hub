import "server-only";
import { redirect } from "next/navigation";
import { supabaseServidor } from "./supabase/server";
import type { Empresa, Perfil } from "./tipos";

export interface Sessao {
  userId: string;
  perfil: Perfil;
  empresa: Empresa | null;
  vendedora: Pick<Perfil, "nome" | "telefone"> | null;
}

/** Sessão atual ou null para visitantes. */
export async function obterSessao(): Promise<Sessao | null> {
  const sb = supabaseServidor();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  const { data: perfil } = await sb.from("perfis").select("*").eq("id", user.id).single<Perfil>();
  if (!perfil) return null;
  let empresa: Empresa | null = null;
  let vendedora: Sessao["vendedora"] = null;
  if (perfil.empresa_id) {
    const { data } = await sb.from("empresas").select("*").eq("id", perfil.empresa_id).single<Empresa>();
    empresa = data ?? null;
    if (empresa?.vendedora_id) {
      const { data: v } = await sb.from("perfis").select("nome, telefone").eq("id", empresa.vendedora_id).single();
      vendedora = v ?? null;
    }
  }
  return { userId: user.id, perfil, empresa, vendedora };
}

/** Exige integrador logado; manda para login ou cadastro da empresa quando falta algo. */
export async function exigirIntegrador(): Promise<Sessao> {
  const s = await obterSessao();
  if (!s) redirect("/entrar");
  if (s.perfil.papel !== "integrador") redirect("/gestao");
  if (!s.empresa) redirect("/cadastro/empresa");
  return s;
}

/** Exige alguém da equipe Titan. */
export async function exigirEquipe(papeis: Perfil["papel"][] = ["vendedora", "gestor", "admin"]): Promise<Sessao> {
  const s = await obterSessao();
  if (!s) redirect("/entrar");
  if (!papeis.includes(s.perfil.papel)) redirect("/portal");
  return s;
}
