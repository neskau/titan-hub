"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { sessaoAcao } from "@/components/gestao/servidor";
import { IDS_ETAPA, IDS_ORIGEM } from "@/components/gestao/crm/constantes";
import { SEM_ACESSO, SESSAO_EXPIRADA, ehGestor, erroCrm, revalidarCrm } from "@/components/gestao/crm/servidor";
import type { Resultado } from "@/components/gestao/crm/tipos";
import { cnpjValido, soDigitos } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";

const Id = z.string().uuid("Oportunidade inválida.");
const UuidOuVazio = (msg: string) => z.union([z.literal(""), z.string().uuid(msg)]);
const primeiroErro = (e: z.ZodError) => e.issues[0]?.message ?? "Dados inválidos.";

/** Número digitado (aceita "12.500,50" ou "12500.50"); vazio vira null. */
const Numero = (rotulo: string) =>
  z
    .string()
    .trim()
    .max(20)
    .transform((s, ctx) => {
      if (!s) return null;
      // Vírgula = decimal brasileiro; "12.500" sem vírgula = separador de milhar.
      const limpo = s.includes(",") || /^\D*\d{1,3}(\.\d{3})+\s*$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s;
      const n = Number(limpo.replace(/[^\d.]/g, ""));
      if (!Number.isFinite(n) || n < 0 || /[^\d.,\sR$]/.test(s)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${rotulo} inválido.` });
        return z.NEVER;
      }
      return Math.round(n * 100) / 100;
    });

const Dados = z
  .object({
    titulo: z.string().trim().min(2, "Informe um título com pelo menos 2 letras.").max(160, "Título muito longo."),
    empresa_id: UuidOuVazio("Empresa inválida."),
    contato_nome: z.string().trim().max(120, "Nome do contato muito longo."),
    contato_telefone: z
      .string()
      .transform(soDigitos)
      .refine((d) => d === "" || (d.length >= 10 && d.length <= 13), "Telefone inválido: informe DDD + número."),
    cidade: z.string().trim().max(120, "Cidade muito longa."),
    uf: z
      .string()
      .trim()
      .toUpperCase()
      .refine((u) => u === "" || /^[A-Z]{2}$/.test(u), "UF inválida."),
    cnpj: z
      .string()
      .transform(soDigitos)
      .refine((d) => d === "" || cnpjValido(d), "CNPJ inválido."),
    valor_estimado: Numero("Valor estimado"),
    kwp: Numero("kWp"),
    origem: z.enum(IDS_ORIGEM, { errorMap: () => ({ message: "Origem inválida." }) }),
    previsao_fechamento: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de previsão inválida.")]),
    vendedora_id: UuidOuVazio("Vendedora inválida."),
  })
  .refine((d) => d.empresa_id || d.contato_nome || d.contato_telefone, {
    message: "Vincule uma empresa ou informe o nome ou telefone do contato.",
  });

type DadosOk = z.infer<typeof Dados>;

function linhaBanco(d: DadosOk) {
  return {
    titulo: d.titulo,
    empresa_id: d.empresa_id || null,
    contato_nome: d.contato_nome || null,
    contato_telefone: d.contato_telefone || null,
    cidade: d.cidade || null,
    uf: d.uf || null,
    cnpj: d.cnpj || null,
    valor_estimado: d.valor_estimado,
    kwp: d.kwp,
    origem: d.origem,
    previsao_fechamento: d.previsao_fechamento || null,
  };
}

type Sb = ReturnType<typeof supabaseServidor>;

async function membroAtivo(sb: Sb, id: string) {
  const { data } = await sb.from("perfis").select("id, nome").eq("id", id).eq("ativo", true).in("papel", ["vendedora", "gestor", "admin"]).maybeSingle();
  return data as { id: string; nome: string } | null;
}

async function empresaDaCarteira(sb: Sb, id: string) {
  const { data } = await sb.from("empresas").select("id, vendedora_id").eq("id", id).maybeSingle();
  return data as { id: string; vendedora_id: string | null } | null;
}

/** Cria uma oportunidade. Vendedora cria sempre para si; gestor escolhe (ou deixa para distribuir). */
export async function criarOportunidade(entrada: unknown): Promise<Resultado> {
  const s = await sessaoAcao();
  if (!s) return { ok: false, erro: SESSAO_EXPIRADA };
  const v = Dados.safeParse(entrada);
  if (!v.success) return { ok: false, erro: primeiroErro(v.error) };
  const d = v.data;
  const sb = supabaseServidor();
  const gestor = ehGestor(s);

  let vendedora: string | null = gestor ? d.vendedora_id || null : s.userId;
  let distribuirEmpresa = false;
  if (d.empresa_id) {
    const emp = await empresaDaCarteira(sb, d.empresa_id);
    if (!emp) return { ok: false, erro: "Empresa não encontrada na sua carteira." };
    if (gestor) {
      // Sem escolha: fica com a dona da empresa. Escolha diferente: a empresa é transferida (ou distribuída).
      if (!vendedora) vendedora = emp.vendedora_id;
      else if (vendedora !== emp.vendedora_id) distribuirEmpresa = true;
    }
  }
  if (gestor && vendedora && vendedora !== s.userId && !(await membroAtivo(sb, vendedora))) {
    return { ok: false, erro: "Vendedora não encontrada ou inativa." };
  }

  const { data, error } = await sb
    .from("oportunidades")
    .insert({ ...linhaBanco(d), vendedora_id: vendedora, criado_por: s.userId })
    .select("id")
    .single();
  if (error || !data) return { ok: false, erro: erroCrm(error?.message) };

  // Distribuir/transferir = colocar a empresa na carteira (o banco leva oportunidades abertas e tarefas junto).
  if (distribuirEmpresa && d.empresa_id) {
    const { error: e2 } = await sb.from("empresas").update({ vendedora_id: vendedora }).eq("id", d.empresa_id);
    if (e2) return { ok: false, erro: `Oportunidade criada, mas a empresa não foi transferida: ${erroCrm(e2.message)}` };
  }
  revalidarCrm({ oportunidade: data.id, empresa: d.empresa_id || null });
  return { ok: true, id: data.id, msg: "Oportunidade criada." };
}

/** Salva os dados de uma oportunidade. Só o gestor troca a vendedora. */
export async function salvarOportunidade(id: string, entrada: unknown): Promise<Resultado> {
  const s = await sessaoAcao();
  if (!s) return { ok: false, erro: SESSAO_EXPIRADA };
  if (!Id.safeParse(id).success) return { ok: false, erro: "Oportunidade inválida." };
  const v = Dados.safeParse(entrada);
  if (!v.success) return { ok: false, erro: primeiroErro(v.error) };
  const d = v.data;
  const sb = supabaseServidor();
  const gestor = ehGestor(s);

  const { data: atual } = await sb.from("oportunidades").select("id, empresa_id, vendedora_id").eq("id", id).maybeSingle();
  if (!atual) return { ok: false, erro: SEM_ACESSO };

  const linha: Record<string, unknown> = linhaBanco(d);
  let novaVendedora: string | null = atual.vendedora_id;
  if (gestor) {
    novaVendedora = d.vendedora_id || null;
    if (novaVendedora && novaVendedora !== atual.vendedora_id && !(await membroAtivo(sb, novaVendedora))) {
      return { ok: false, erro: "Vendedora não encontrada ou inativa." };
    }
  }

  if (d.empresa_id) {
    const emp = await empresaDaCarteira(sb, d.empresa_id);
    if (!emp) return { ok: false, erro: "Empresa não encontrada na sua carteira." };
    if (gestor && novaVendedora && novaVendedora !== emp.vendedora_id) {
      // Oportunidade de empresa: trocar a vendedora = transferir a empresa (o banco leva oportunidades e tarefas).
      const { error: e1 } = await sb.from("empresas").update({ vendedora_id: novaVendedora }).eq("id", d.empresa_id);
      if (e1) return { ok: false, erro: erroCrm(e1.message) };
    }
  }
  if (gestor) linha.vendedora_id = novaVendedora;

  const { data, error } = await sb.from("oportunidades").update(linha).eq("id", id).select("id");
  if (error) return { ok: false, erro: erroCrm(error.message) };
  if (!data?.length) return { ok: false, erro: SEM_ACESSO };
  revalidarCrm({ oportunidade: id, empresa: d.empresa_id || atual.empresa_id });
  return { ok: true, msg: "Oportunidade salva." };
}

const Mover = z.object({
  id: Id,
  etapa: z.enum(IDS_ETAPA, { errorMap: () => ({ message: "Etapa inválida." }) }),
  motivo: z.string().trim().max(500, "Motivo muito longo.").optional(),
});

/** Move a oportunidade de etapa. "Perdido" exige motivo. */
export async function moverEtapa(id: string, etapa: string, motivo?: string): Promise<Resultado> {
  if (!(await sessaoAcao())) return { ok: false, erro: SESSAO_EXPIRADA };
  const v = Mover.safeParse({ id, etapa, motivo });
  if (!v.success) return { ok: false, erro: primeiroErro(v.error) };
  if (v.data.etapa === "perdido" && !v.data.motivo) return { ok: false, erro: "Informe o motivo da perda." };

  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("oportunidades")
    .update({ etapa: v.data.etapa, motivo_perda: v.data.etapa === "perdido" ? v.data.motivo : null })
    .eq("id", v.data.id)
    .select("id, empresa_id");
  if (error) return { ok: false, erro: erroCrm(error.message) };
  if (!data?.length) return { ok: false, erro: SEM_ACESSO };
  revalidarCrm({ oportunidade: v.data.id, empresa: (data[0] as { empresa_id: string | null }).empresa_id });
  return { ok: true, msg: "Etapa atualizada." };
}

/** Gestor distribui um lead sem dona. Com empresa, a empresa vai para a carteira da vendedora. */
export async function distribuirLead(id: string, vendedoraId: string): Promise<Resultado> {
  const s = await sessaoAcao(["gestor", "admin"]);
  if (!s) return { ok: false, erro: "Só o gestor pode distribuir leads." };
  if (!Id.safeParse(id).success) return { ok: false, erro: "Oportunidade inválida." };
  if (!z.string().uuid().safeParse(vendedoraId).success) return { ok: false, erro: "Escolha a vendedora." };
  const sb = supabaseServidor();
  const membro = await membroAtivo(sb, vendedoraId);
  if (!membro) return { ok: false, erro: "Vendedora não encontrada ou inativa." };

  const { data: op } = await sb.from("oportunidades").select("id, empresa_id").eq("id", id).maybeSingle();
  if (!op) return { ok: false, erro: SEM_ACESSO };

  if (op.empresa_id) {
    const { data, error } = await sb.from("empresas").update({ vendedora_id: vendedoraId }).eq("id", op.empresa_id).select("id");
    if (error) return { ok: false, erro: erroCrm(error.message) };
    if (!data?.length) return { ok: false, erro: SEM_ACESSO };
    // Garante a oportunidade mesmo se já estiver fechada (o banco só leva as abertas).
    await sb.from("oportunidades").update({ vendedora_id: vendedoraId }).eq("id", id).is("vendedora_id", null);
  } else {
    const { data, error } = await sb.from("oportunidades").update({ vendedora_id: vendedoraId }).eq("id", id).select("id");
    if (error) return { ok: false, erro: erroCrm(error.message) };
    if (!data?.length) return { ok: false, erro: SEM_ACESSO };
  }
  revalidarCrm({ oportunidade: id, empresa: op.empresa_id });
  revalidatePath("/gestao/integradores");
  return { ok: true, msg: `Lead distribuído para ${membro.nome}.` };
}
