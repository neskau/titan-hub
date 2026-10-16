"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { sessaoAcao } from "@/components/gestao/servidor";
import { erroCrm } from "@/components/gestao/crm/servidor";
import type { Resultado } from "@/components/gestao/crm/tipos";
import { supabaseServidor } from "@/lib/supabase/server";

const Meta = z.object({
  vendedora_id: z.string().uuid("Vendedora inválida."),
  mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mês inválido."),
  valor: z
    .string()
    .trim()
    .transform((s) => s.replace(/[R$\s]/g, ""))
    .transform((s) => (s.includes(",") || /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s))
    .pipe(z.coerce.number({ invalid_type_error: "Valor inválido." }).min(0, "A meta não pode ser negativa.").max(999_999_999_999, "Valor muito alto.")),
});

/** Gestor define a meta de vendas do mês de uma vendedora. */
export async function salvarMeta(entrada: unknown): Promise<Resultado> {
  if (!(await sessaoAcao(["gestor", "admin"]))) return { ok: false, erro: "Só o gestor define metas." };
  const v = Meta.safeParse(entrada);
  if (!v.success) return { ok: false, erro: v.error.issues[0]?.message ?? "Dados inválidos." };
  const sb = supabaseServidor();
  const { data: m } = await sb.from("perfis").select("id").eq("id", v.data.vendedora_id).in("papel", ["vendedora", "gestor", "admin"]).maybeSingle();
  if (!m) return { ok: false, erro: "Vendedora não encontrada." };
  const { error } = await sb.from("metas").upsert(
    { vendedora_id: v.data.vendedora_id, mes: `${v.data.mes}-01`, valor: Math.round(v.data.valor * 100) / 100, atualizado_em: new Date().toISOString() },
    { onConflict: "vendedora_id,mes" }
  );
  if (error) return { ok: false, erro: erroCrm(error.message) };
  revalidatePath("/gestao/metas");
  revalidatePath("/gestao");
  return { ok: true, msg: "Meta salva." };
}
