import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { exigirIntegrador } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import type { CD, Categoria, ItemCatalogo } from "@/lib/tipos";
import { CATEGORIAS } from "./categorias";

/** Sessão do integrador, consultada uma única vez por requisição (layout + página). */
export const sessaoPortal = cache(exigirIntegrador);

/** CDs ativos, matriz primeiro. */
export const listarCds = cache(async (): Promise<CD[]> => {
  const { data } = await supabaseServidor()
    .from("cds")
    .select("*")
    .eq("ativo", true)
    .order("matriz", { ascending: false })
    .order("nome");
  return (data as CD[] | null) ?? [];
});

/**
 * CD em uso: cookie 'cd' (se válido) → CD padrão da empresa → matriz.
 * `padrao` permite que páginas públicas escolham o CD sem exigir login.
 */
export const cdAtual = cache(async (padrao?: string | null): Promise<{ cd: CD | null; cds: CD[] }> => {
  const cds = await listarCds();
  const doCookie = cookies().get("cd")?.value;
  const cd =
    cds.find((c) => c.id === doCookie) ??
    cds.find((c) => c.id === padrao) ??
    cds.find((c) => c.matriz) ??
    cds[0] ??
    null;
  return { cd, cds };
});

/** Remove caracteres que quebram o filtro `or` do PostgREST. */
function limparTermo(q?: string) {
  return (q ?? "")
    .replace(/[^0-9A-Za-zÀ-ÿ\s\-/]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

export function categoriaValida(c?: string): Categoria | undefined {
  return CATEGORIAS.find((x) => x === c);
}

/** Lê a view `catalogo` de um CD com filtro por categoria e busca por nome/marca/SKU. */
export async function buscarCatalogo(opcoes: { cd: string; q?: string; categoria?: string }): Promise<ItemCatalogo[]> {
  let consulta = supabaseServidor().from("catalogo").select("*").eq("cd_id", opcoes.cd);
  const categoria = categoriaValida(opcoes.categoria);
  if (categoria) consulta = consulta.eq("categoria", categoria);
  const termo = limparTermo(opcoes.q);
  if (termo) {
    const t = `%${termo}%`;
    consulta = consulta.or(`nome.ilike.${t},marca.ilike.${t},sku.ilike.${t}`);
  }
  const { data } = await consulta.limit(1000);
  const itens = (data as ItemCatalogo[] | null) ?? [];
  return itens.sort(
    (a, b) =>
      CATEGORIAS.indexOf(a.categoria) - CATEGORIAS.indexOf(b.categoria) ||
      (b.potencia_w ?? 0) - (a.potencia_w ?? 0) ||
      (a.potencia_kw ?? 0) - (b.potencia_kw ?? 0) ||
      a.nome.localeCompare(b.nome, "pt-BR")
  );
}

/** URL pública do datasheet no bucket 'datasheets'. */
export function urlDatasheet(path: string | null): string | null {
  if (!path) return null;
  return supabaseServidor().storage.from("datasheets").getPublicUrl(path).data.publicUrl;
}
