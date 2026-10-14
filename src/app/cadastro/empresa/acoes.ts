"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { cnpjValido, soDigitos } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"] as const;

const Empresa = z.object({
  cnpj: z.string().refine(cnpjValido, "CNPJ inválido. Confira os números."),
  razao: z.string().trim().min(3, "Informe a razão social.").max(200),
  fantasia: z.string().trim().max(120),
  cidade: z.string().trim().min(2, "Informe a cidade.").max(120),
  uf: z.enum(UFS, { errorMap: () => ({ message: "Escolha a UF." }) }),
  telefone: z.string().refine((t) => [10, 11].includes(soDigitos(t).length), "Telefone com DDD inválido."),
  segmento: z.enum(["Residencial", "Agro", "Comercial e industrial"], { errorMap: () => ({ message: "Escolha o segmento principal." }) }),
});

export type ResultadoCadastro = { ok: true } | { ok: false; erro: string };

export async function cadastrarEmpresa(entrada: unknown): Promise<ResultadoCadastro> {
  const v = Empresa.safeParse(entrada);
  if (!v.success) return { ok: false, erro: v.error.issues[0]?.message ?? "Dados inválidos." };
  const d = v.data;
  const { error } = await supabaseServidor().rpc("cadastrar_empresa", {
    p_cnpj: soDigitos(d.cnpj),
    p_razao: d.razao,
    p_fantasia: d.fantasia || null,
    p_cidade: d.cidade,
    p_uf: d.uf,
    p_telefone: soDigitos(d.telefone),
    p_segmento: d.segmento,
  });
  if (error) {
    const m = error.message;
    if (/duplicate key|empresas_cnpj_key|unique/i.test(m))
      return { ok: false, erro: "Este CNPJ já está cadastrado na Titan. Peça a quem fez o cadastro para liberar seu acesso, ou fale com a equipe comercial." };
    if (/Faça login/i.test(m)) return { ok: false, erro: "Sua sessão expirou. Entre novamente para continuar." };
    if (/já vinculado/i.test(m)) return { ok: false, erro: "Seu usuário já está vinculado a uma empresa." };
    return { ok: false, erro: "Não foi possível enviar o cadastro agora. Tente novamente em instantes." };
  }
  revalidatePath("/cadastro/empresa");
  return { ok: true };
}
