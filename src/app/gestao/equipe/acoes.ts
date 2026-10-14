"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { supabaseServidor } from "@/lib/supabase/server";
import { mensagemErro, sessaoAcao } from "@/components/gestao/servidor";

export type Resultado = { ok: true; msg?: string } | { ok: false; erro: string };

const Mudanca = z.object({
  id: z.string().uuid("Usuário inválido."),
  papel: z.enum(["integrador", "vendedora", "gestor", "admin"], { errorMap: () => ({ message: "Papel inválido." }) }),
  ativo: z.boolean(),
});

/** Muda papel e acesso de um perfil. Só gestor/admin; só admin mexe em administradores; ninguém muda a si mesmo. */
export async function salvarMembro(entrada: unknown): Promise<Resultado> {
  const s = await sessaoAcao(["gestor", "admin"]);
  if (!s) return { ok: false, erro: "Só gestor ou administrador pode alterar a equipe." };
  const v = Mudanca.safeParse(entrada);
  if (!v.success) return { ok: false, erro: v.error.issues[0]?.message ?? "Dados inválidos." };
  const d = v.data;
  if (d.id === s.userId) return { ok: false, erro: "Você não pode alterar o seu próprio papel ou acesso." };

  const sb = supabaseServidor();
  const { data: alvo } = await sb.from("perfis").select("papel, empresa_id").eq("id", d.id).maybeSingle();
  if (!alvo) return { ok: false, erro: "Usuário não encontrado." };
  if (s.perfil.papel !== "admin" && (d.papel === "admin" || alvo.papel === "admin"))
    return { ok: false, erro: "Somente um administrador pode conceder ou alterar o papel de administrador." };
  if (d.papel !== "integrador" && alvo.empresa_id)
    return { ok: false, erro: "Este usuário está vinculado a uma empresa integradora e não pode virar membro da equipe." };

  const { error } = await sb.from("perfis").update({ papel: d.papel, ativo: d.ativo }).eq("id", d.id);
  if (error) return { ok: false, erro: mensagemErro(error.message) };
  revalidatePath("/gestao/equipe");
  revalidatePath("/gestao/integradores", "layout");
  return { ok: true, msg: "Usuário atualizado." };
}
