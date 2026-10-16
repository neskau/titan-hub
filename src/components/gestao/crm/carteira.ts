import "server-only";
import { nomeEmpresa } from "@/components/gestao/rotulos";
import { supabaseServidor } from "@/lib/supabase/server";
import type { OpcaoEmpresa } from "./FormOportunidade";

/** Empresas que quem está logado pode vincular (a RLS limita a vendedora à própria carteira). */
export async function empresasDaCarteira(): Promise<OpcaoEmpresa[]> {
  const { data } = await supabaseServidor()
    .from("empresas")
    .select("id, razao_social, nome_fantasia, cidade, uf, vendedora_id, status")
    .neq("status", "recusada")
    .order("razao_social")
    .limit(3000);
  type Linha = { id: string; razao_social: string; nome_fantasia: string | null; cidade: string | null; uf: string | null; vendedora_id: string | null };
  return ((data as Linha[] | null) ?? [])
    .map((e) => ({
      id: e.id,
      nome: nomeEmpresa(e),
      cidade: e.cidade ? `${e.cidade}${e.uf ? `/${e.uf}` : ""}` : null,
      vendedora_id: e.vendedora_id,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
