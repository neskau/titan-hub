"use server";
import { z } from "zod";
import { sessaoAcao } from "@/components/gestao/servidor";
import { TIPOS_REGISTRO, instanteSP } from "@/components/gestao/crm/constantes";
import { SEM_ACESSO, SESSAO_EXPIRADA, ehGestor, erroCrm, revalidarCrm } from "@/components/gestao/crm/servidor";
import type { Resultado } from "@/components/gestao/crm/tipos";
import { supabaseServidor } from "@/lib/supabase/server";

const UuidOuVazio = z.union([z.literal(""), z.string().uuid("Registro inválido.")]);

const Registro = z
  .object({
    oportunidade_id: UuidOuVazio,
    empresa_id: UuidOuVazio,
    tipo: z.enum([...TIPOS_REGISTRO, "tarefa"], { errorMap: () => ({ message: "Tipo de registro inválido." }) }),
    descricao: z.string().trim().min(1, "Escreva a descrição.").max(2000, "Descrição muito longa (máx. 2000 caracteres)."),
    dia: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de vencimento inválida.")]),
    hora: z.union([z.literal(""), z.string().regex(/^\d{2}:\d{2}$/, "Hora inválida.")]),
    responsavel_id: UuidOuVazio,
  })
  .refine((d) => d.oportunidade_id || d.empresa_id, { message: "Registro sem oportunidade nem empresa." });

/** Registra nota/ligação/WhatsApp/e-mail/visita ou cria uma tarefa na linha do tempo. */
export async function registrarAtividade(entrada: unknown): Promise<Resultado> {
  const s = await sessaoAcao();
  if (!s) return { ok: false, erro: SESSAO_EXPIRADA };
  const v = Registro.safeParse(entrada);
  if (!v.success) return { ok: false, erro: v.error.issues[0]?.message ?? "Dados inválidos." };
  const d = v.data;
  const tarefa = d.tipo === "tarefa";
  // Responsável: sempre quem cria; gestor pode escolher outra pessoa da equipe.
  let responsavel: string | null = tarefa ? s.userId : null;
  const sb = supabaseServidor();
  if (tarefa && d.responsavel_id && d.responsavel_id !== s.userId) {
    if (!ehGestor(s)) return { ok: false, erro: "Só o gestor cria tarefas para outra pessoa." };
    const { data: m } = await sb.from("perfis").select("id").eq("id", d.responsavel_id).eq("ativo", true).in("papel", ["vendedora", "gestor", "admin"]).maybeSingle();
    if (!m) return { ok: false, erro: "Responsável não encontrado ou inativo." };
    responsavel = d.responsavel_id;
  }
  if (!tarefa && d.dia) return { ok: false, erro: "Só tarefas têm vencimento." };

  const { error } = await sb.from("atividades").insert({
    oportunidade_id: d.oportunidade_id || null,
    empresa_id: d.empresa_id || null,
    tipo: d.tipo,
    descricao: d.descricao,
    vencimento: tarefa && d.dia ? instanteSP(d.dia, d.hora || "09:00") : null,
    responsavel_id: responsavel,
    autor_id: s.userId,
  });
  if (error) return { ok: false, erro: erroCrm(error.message) };
  revalidarCrm({ oportunidade: d.oportunidade_id || null, empresa: d.empresa_id || null });
  return { ok: true, msg: tarefa ? "Tarefa criada." : "Registro adicionado à linha do tempo." };
}

/** Marca (ou desmarca) uma tarefa como concluída. */
export async function concluirTarefa(id: string, concluida = true): Promise<Resultado> {
  if (!(await sessaoAcao())) return { ok: false, erro: SESSAO_EXPIRADA };
  if (!z.string().uuid().safeParse(id).success) return { ok: false, erro: "Tarefa inválida." };
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("atividades")
    .update({ concluida, concluida_em: concluida ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("tipo", "tarefa")
    .select("oportunidade_id, empresa_id");
  if (error) return { ok: false, erro: erroCrm(error.message) };
  if (!data?.length) return { ok: false, erro: SEM_ACESSO };
  const a = data[0] as { oportunidade_id: string | null; empresa_id: string | null };
  revalidarCrm({ oportunidade: a.oportunidade_id, empresa: a.empresa_id });
  return { ok: true, msg: concluida ? "Tarefa concluída." : "Tarefa reaberta." };
}
