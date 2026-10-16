import "server-only";
import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { mensagemErro } from "@/components/gestao/servidor";

export const SEM_CHAVE_SERVICO =
  "O envio de convites não está configurado: falta a variável SUPABASE_SERVICE_ROLE_KEY no servidor (Vercel > Settings > Environment Variables). Fale com o administrador do sistema.";

export const chaveServicoConfigurada = () => Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());

/** Endereço público do site: NEXT_PUBLIC_SITE_URL, se existir; senão o host da requisição. */
export function origemSite(): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  if (env && /^https?:\/\/[^/]+$/i.test(env)) return env;
  const h = headers();
  const host = h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host") || "localhost:3000";
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() || (local ? "http" : "https");
  return `${proto}://${host}`;
}

/** Link que o convite abre: confirma a conta e leva para a criação de senha. */
export const redirectConvite = () => `${origemSite()}/entrar/confirmar?proximo=${encodeURIComponent("/entrar/nova-senha")}`;

export type Conta = { ok: true; id: string; criadaAgora: boolean } | { ok: false; erro: string };

/**
 * Acha a conta pelo e-mail ou cria uma nova por convite (o Supabase envia o e-mail).
 * Só para Server Actions de quem já foi validado como equipe.
 */
export async function contaPorEmail(email: string, nome: string, empresaAtual?: string): Promise<Conta> {
  if (!chaveServicoConfigurada()) return { ok: false, erro: SEM_CHAVE_SERVICO };
  const admin = supabaseAdmin();

  const { data: existente, error: erroBusca } = await admin
    .from("perfis")
    .select("id, papel, empresa_id")
    .eq("email", email)
    .maybeSingle<{ id: string; papel: string; empresa_id: string | null }>();
  if (erroBusca) return { ok: false, erro: "Não foi possível conferir o e-mail agora. Tente novamente." };
  if (existente) {
    if (existente.papel !== "integrador") return { ok: false, erro: "Este e-mail é de um membro da equipe Titan. Use o e-mail do integrador." };
    if (existente.empresa_id && existente.empresa_id === empresaAtual) return { ok: false, erro: "Este usuário já tem acesso a esta empresa." };
    if (existente.empresa_id) return { ok: false, erro: "Este e-mail já é usado por outra empresa integradora. Use outro e-mail." };
    return { ok: true, id: existente.id, criadaAgora: false };
  }

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { nome },
    redirectTo: redirectConvite(),
  });
  if (error || !data.user) return { ok: false, erro: traduzirErroConvite(error?.message) };
  return { ok: true, id: data.user.id, criadaAgora: true };
}

/** Desfaz a conta criada agora quando o cadastro no banco falha (evita conta órfã). */
export async function apagarConta(id: string) {
  try {
    await supabaseAdmin().auth.admin.deleteUser(id);
  } catch {
    // Sem rede ou sem chave: a conta fica sem empresa e aparece em Gestão > Equipe > Candidatos.
  }
}

function traduzirErroConvite(m?: string): string {
  if (!m) return "Não foi possível enviar o convite agora. Tente novamente.";
  if (/already (been )?registered|already exists/i.test(m)) return "Este e-mail já tem conta no sistema. Confira em Gestão > Equipe ou use outro e-mail.";
  if (/rate limit|too many/i.test(m)) return "Limite de envio de e-mails atingido. Aguarde alguns minutos ou configure um SMTP próprio no Supabase.";
  if (/invalid.*email|email.*invalid|validate email/i.test(m)) return "E-mail inválido.";
  if (/sending|smtp|mail/i.test(m)) return "O Supabase não conseguiu enviar o e-mail de convite. Confira a configuração de e-mail (SMTP) do projeto.";
  if (/redirect/i.test(m)) return "O endereço de retorno do convite não está autorizado. Cadastre /entrar/confirmar nas Redirect URLs do Supabase.";
  return "Não foi possível enviar o convite agora. Tente novamente.";
}

/** Traduz os erros da função equipe_cadastrar_integrador para português simples. */
export function traduzirErroCadastro(m?: string): string {
  if (!m) return "Não foi possível cadastrar agora. Tente novamente.";
  if (/carteira de outra vendedora/i.test(m)) return "Este CNPJ já está na carteira de outra vendedora. Fale com o gestor para transferir.";
  if (/pertence a outra empresa|membro da equipe/i.test(m)) return "Este e-mail já é usado por outra empresa ou por alguém da equipe Titan. Use outro e-mail.";
  if (/CNPJ inválido/i.test(m)) return "CNPJ inválido. Confira os números.";
  if (/Vendedora responsável inválida/i.test(m)) return "Escolha uma vendedora ativa da equipe como responsável.";
  if (/Razão social inválida/i.test(m)) return "Razão social inválida: use entre 3 e 200 caracteres.";
  if (/Sem permissão|permission denied/i.test(m)) return "Você não tem permissão para cadastrar integradores.";
  if (/foreign key|cd_padrao|cds/i.test(m)) return "CD padrão inválido.";
  if (/duplicate key|unique/i.test(m)) return "Este CNPJ já está cadastrado. Busque a empresa na lista de integradores.";
  return mensagemErro(m, "Não foi possível cadastrar agora. Tente novamente.");
}
