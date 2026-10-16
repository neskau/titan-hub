"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cnpjValido, soDigitos } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import { sessaoAcao } from "@/components/gestao/servidor";
import { apagarConta, contaPorEmail, traduzirErroCadastro } from "./convite";
import { UFS } from "./mascaras";

export type ResultadoCadastro = { ok: true; msg: string } | { ok: false; erro: string };

const SEM_SESSAO = "Sua sessão expirou ou você não tem acesso. Entre novamente.";

const Usuario = {
  nome: z.string().trim().min(3, "Informe o nome do usuário de acesso.").max(120),
  email: z.string().trim().toLowerCase().email("E-mail do usuário inválido.").max(254),
};

const NovoIntegrador = z.object({
  cnpj: z.string().refine(cnpjValido, "CNPJ inválido. Confira os números."),
  razao: z.string().trim().min(3, "Informe a razão social.").max(200),
  fantasia: z.string().trim().max(120),
  cidade: z.string().trim().min(2, "Informe a cidade.").max(120),
  uf: z.enum(UFS, { errorMap: () => ({ message: "Escolha a UF." }) }),
  telefone: z.string().refine((t) => [10, 11].includes(soDigitos(t).length), "Telefone com DDD inválido."),
  segmento: z.enum(["Residencial", "Agro", "Comercial e industrial"], { errorMap: () => ({ message: "Escolha o segmento principal." }) }),
  cd: z.string().regex(/^[a-z0-9_-]{1,40}$/, "Escolha o CD padrão."),
  vendedora: z.union([z.literal(""), z.string().uuid("Vendedora inválida.")]),
  oportunidade: z.union([z.literal(""), z.string().uuid()]),
  ...Usuario,
});

/**
 * Vendedora (ou gestor) cadastra o integrador: cria/acha a conta, chama equipe_cadastrar_integrador
 * COM A SESSÃO DE QUEM CADASTRA (a função confere a carteira por auth.uid()) e vai para a ficha da empresa.
 */
export async function cadastrarIntegradorEquipe(entrada: unknown): Promise<ResultadoCadastro> {
  const s = await sessaoAcao();
  if (!s) return { ok: false, erro: SEM_SESSAO };
  const v = NovoIntegrador.safeParse(entrada);
  if (!v.success) return { ok: false, erro: v.error.issues[0]?.message ?? "Dados inválidos." };
  const d = v.data;
  const gestor = s.perfil.papel === "gestor" || s.perfil.papel === "admin";

  const conta = await contaPorEmail(d.email, d.nome);
  if (!conta.ok) return { ok: false, erro: conta.erro };

  const sb = supabaseServidor();
  const { data: empresaId, error } = await sb.rpc("equipe_cadastrar_integrador", {
    p_usuario: conta.id,
    p_cnpj: soDigitos(d.cnpj),
    p_razao: d.razao,
    p_fantasia: d.fantasia || null,
    p_cidade: d.cidade,
    p_uf: d.uf,
    p_telefone: soDigitos(d.telefone),
    p_segmento: d.segmento,
    p_cd: d.cd,
    p_vendedora: gestor && d.vendedora ? d.vendedora : null,
  });
  if (error || typeof empresaId !== "string") {
    if (conta.criadaAgora) await apagarConta(conta.id);
    return { ok: false, erro: traduzirErroCadastro(error?.message) };
  }

  // Oportunidade de origem passa a apontar para a empresa (só se ainda não tinha empresa).
  if (d.oportunidade) {
    await sb.from("oportunidades").update({ empresa_id: empresaId }).eq("id", d.oportunidade).is("empresa_id", null);
    revalidatePath("/gestao/funil");
    revalidatePath("/gestao/oportunidades", "layout");
  }

  revalidatePath("/gestao");
  revalidatePath("/gestao/integradores");
  revalidatePath("/gestao/equipe");
  const aviso = conta.criadaAgora ? "convite" : "vinculado";
  redirect(`/gestao/integradores/${empresaId}?${aviso}=${encodeURIComponent(d.email)}`);
}

const NovoUsuario = z.object({
  empresaId: z.string().uuid("Empresa inválida."),
  cnpj: z.string(),
  ...Usuario,
});

type EmpresaCarteira = {
  id: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  cidade: string | null;
  uf: string | null;
  telefone: string | null;
  segmento: string | null;
  cd_padrao: string;
};

/** Dá acesso ao portal a mais um usuário de uma empresa da carteira (convite por e-mail). */
export async function adicionarUsuarioEmpresa(entrada: unknown): Promise<ResultadoCadastro> {
  const s = await sessaoAcao();
  if (!s) return { ok: false, erro: SEM_SESSAO };
  const v = NovoUsuario.safeParse(entrada);
  if (!v.success) return { ok: false, erro: v.error.issues[0]?.message ?? "Dados inválidos." };
  const d = v.data;

  // A RLS só devolve a empresa se ela estiver na carteira de quem chama (gestor: todas).
  const sb = supabaseServidor();
  const { data: emp } = await sb
    .from("empresas")
    .select("id, cnpj, razao_social, nome_fantasia, cidade, uf, telefone, segmento, cd_padrao")
    .eq("id", d.empresaId)
    .maybeSingle<EmpresaCarteira>();
  if (!emp) return { ok: false, erro: "Empresa não encontrada na sua carteira." };
  if (d.cnpj && soDigitos(d.cnpj) !== emp.cnpj) return { ok: false, erro: "O CNPJ não confere com a empresa. Recarregue a página." };

  const conta = await contaPorEmail(d.email, d.nome, emp.id);
  if (!conta.ok) return { ok: false, erro: conta.erro };

  const { error } = await sb.rpc("equipe_cadastrar_integrador", {
    p_usuario: conta.id,
    p_cnpj: emp.cnpj,
    p_razao: emp.razao_social,
    p_fantasia: emp.nome_fantasia,
    p_cidade: emp.cidade,
    p_uf: emp.uf,
    p_telefone: emp.telefone,
    p_segmento: emp.segmento,
    p_cd: emp.cd_padrao,
    p_vendedora: null,
  });
  if (error) {
    if (conta.criadaAgora) await apagarConta(conta.id);
    return { ok: false, erro: traduzirErroCadastro(error.message) };
  }

  revalidatePath(`/gestao/integradores/${emp.id}`);
  revalidatePath("/gestao/equipe");
  return {
    ok: true,
    msg: conta.criadaAgora
      ? `Usuário adicionado. Enviamos um convite para ${d.email} criar a senha.`
      : `Usuário adicionado. ${d.email} já tinha conta e entra com a senha que já usa.`,
  };
}
