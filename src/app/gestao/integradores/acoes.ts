"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { supabaseServidor } from "@/lib/supabase/server";
import { mensagemErro, sessaoAcao } from "@/components/gestao/servidor";

export type Resultado = { ok: true; msg?: string } | { ok: false; erro: string };

const Id = z.string().uuid("Empresa inválida.");

function revalidar(id: string) {
  revalidatePath("/gestao");
  revalidatePath("/gestao/integradores");
  revalidatePath(`/gestao/integradores/${id}`);
  revalidatePath("/portal", "layout");
}

const Status = z.enum(["aprovada", "recusada", "bloqueada", "pendente"], { errorMap: () => ({ message: "Situação inválida." }) });

const MENSAGENS: Record<z.infer<typeof Status>, string> = {
  aprovada: "Cadastro aprovado. O integrador já vê preços e pode comprar.",
  recusada: "Cadastro recusado.",
  bloqueada: "Empresa bloqueada. As compras pelo portal foram suspensas.",
  pendente: "Cadastro voltou para análise.",
};

/** Aprova, recusa, bloqueia ou devolve para análise. Bloquear é só para gestor/admin. */
export async function mudarStatusEmpresa(id: string, status: string): Promise<Resultado> {
  const s = await sessaoAcao();
  if (!s) return { ok: false, erro: "Sua sessão expirou ou você não tem acesso." };
  if (!Id.safeParse(id).success) return { ok: false, erro: "Empresa inválida." };
  const v = Status.safeParse(status);
  if (!v.success) return { ok: false, erro: "Situação inválida." };
  if (v.data === "bloqueada" && s.perfil.papel === "vendedora") return { ok: false, erro: "Só gestor ou administrador pode bloquear uma empresa." };

  const sb = supabaseServidor();
  const { data: atual } = await sb.from("empresas").select("status").eq("id", id).maybeSingle();
  if (!atual) return { ok: false, erro: "Empresa não encontrada." };
  // Vendedora não desbloqueia empresa bloqueada por um gestor.
  if (atual.status === "bloqueada" && s.perfil.papel === "vendedora") return { ok: false, erro: "Só gestor ou administrador pode desbloquear esta empresa." };

  const { error } = await sb.from("empresas").update({ status: v.data }).eq("id", id);
  if (error) return { ok: false, erro: mensagemErro(error.message) };
  revalidar(id);
  return { ok: true, msg: MENSAGENS[v.data] };
}

const Comercial = z.object({
  id: Id,
  vendedora_id: z.union([z.literal(""), z.string().uuid("Vendedora inválida.")]),
  cd_padrao: z.string().regex(/^[a-z0-9_-]{1,40}$/, "CD inválido."),
  pode_boleto: z.boolean(),
});

/** Define vendedora responsável, CD padrão e liberação de boleto faturado. */
export async function salvarComercial(entrada: unknown): Promise<Resultado> {
  if (!(await sessaoAcao())) return { ok: false, erro: "Sua sessão expirou ou você não tem acesso." };
  const v = Comercial.safeParse(entrada);
  if (!v.success) return { ok: false, erro: v.error.issues[0]?.message ?? "Dados inválidos." };
  const d = v.data;
  const sb = supabaseServidor();

  const [{ data: cd }, vend] = await Promise.all([
    sb.from("cds").select("id").eq("id", d.cd_padrao).maybeSingle(),
    d.vendedora_id
      ? sb.from("perfis").select("id").eq("id", d.vendedora_id).in("papel", ["vendedora", "gestor", "admin"]).maybeSingle()
      : Promise.resolve({ data: { id: null } }),
  ]);
  if (!cd) return { ok: false, erro: "CD não encontrado." };
  if (!vend.data) return { ok: false, erro: "Vendedora não encontrada." };

  const { error } = await sb
    .from("empresas")
    .update({ vendedora_id: d.vendedora_id || null, cd_padrao: d.cd_padrao, pode_boleto: d.pode_boleto })
    .eq("id", d.id);
  if (error) return { ok: false, erro: mensagemErro(error.message) };
  revalidar(d.id);
  return { ok: true, msg: "Dados comerciais salvos." };
}
