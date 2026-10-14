"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { supabaseServidor } from "@/lib/supabase/server";
import { PROXIMO_STATUS } from "@/components/gestao/rotulos";
import { mensagemErro, sessaoAcao } from "@/components/gestao/servidor";
import type { StatusPedido } from "@/lib/tipos";

export type Resultado = { ok: true; msg?: string } | { ok: false; erro: string };

const Id = z.string().uuid("Pedido inválido.");

function revalidar(id: string) {
  revalidatePath("/gestao");
  revalidatePath("/gestao/pedidos");
  revalidatePath(`/gestao/pedidos/${id}`);
  revalidatePath("/gestao/estoque");
  revalidatePath("/portal/pedidos");
  revalidatePath(`/portal/pedidos/${id}`);
}

/** Avança o pedido para o próximo status do fluxo (recebido → faturado → separação → em transporte → entregue). */
export async function avancarStatus(id: string, statusAtual: StatusPedido): Promise<Resultado> {
  if (!(await sessaoAcao())) return { ok: false, erro: "Sua sessão expirou ou você não tem acesso." };
  if (!Id.safeParse(id).success) return { ok: false, erro: "Pedido inválido." };
  const proximo = PROXIMO_STATUS[statusAtual];
  if (!proximo) return { ok: false, erro: "Este pedido não tem próxima etapa." };

  // Só avança se o status no banco ainda for o que a tela mostrava (evita pular etapas com dois cliques).
  const { data, error } = await supabaseServidor()
    .from("pedidos")
    .update({ status: proximo, atualizado_em: new Date().toISOString() })
    .eq("id", id)
    .eq("status", statusAtual)
    .select("id");
  if (error) return { ok: false, erro: mensagemErro(error.message) };
  if (!data || data.length === 0) return { ok: false, erro: "O pedido foi alterado por outra pessoa. Atualize a página." };
  revalidar(id);
  return { ok: true };
}

/** Cancela o pedido e devolve o estoque ao CD (função SQL atômica cancelar_pedido). */
export async function cancelarPedido(id: string): Promise<Resultado> {
  if (!(await sessaoAcao())) return { ok: false, erro: "Sua sessão expirou ou você não tem acesso." };
  if (!Id.safeParse(id).success) return { ok: false, erro: "Pedido inválido." };
  const { error } = await supabaseServidor().rpc("cancelar_pedido", { p_pedido: id });
  if (error) return { ok: false, erro: mensagemErro(error.message, "Não foi possível cancelar o pedido.") };
  revalidar(id);
  return { ok: true, msg: "Pedido cancelado e estoque devolvido ao CD." };
}

const dinheiro = z
  .string()
  .trim()
  .transform((s) => (s === "" ? "0" : s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s))
  .pipe(z.coerce.number({ invalid_type_error: "Frete inválido." }).min(0, "O frete não pode ser negativo.").max(10_000_000, "Frete muito alto."));

const Dados = z.object({
  id: Id,
  frete: dinheiro,
  rastreio: z.string().trim().max(120, "Rastreio muito longo."),
  nota_fiscal: z.string().trim().max(60, "Número da nota muito longo."),
});

/** Salva rastreio, nota fiscal e frete; o total é recalculado como subtotal + frete. */
export async function salvarDadosPedido(entrada: unknown): Promise<Resultado> {
  if (!(await sessaoAcao())) return { ok: false, erro: "Sua sessão expirou ou você não tem acesso." };
  const v = Dados.safeParse(entrada);
  if (!v.success) return { ok: false, erro: v.error.issues[0]?.message ?? "Dados inválidos." };
  const d = v.data;
  const sb = supabaseServidor();
  const { data: atual } = await sb.from("pedidos").select("subtotal, status").eq("id", d.id).maybeSingle();
  if (!atual) return { ok: false, erro: "Pedido não encontrado." };
  if (atual.status === "cancelado") return { ok: false, erro: "Pedido cancelado não pode ser alterado." };
  const frete = Math.round(d.frete * 100) / 100;
  const total = Math.round((Number(atual.subtotal) + frete) * 100) / 100;
  const { error } = await sb
    .from("pedidos")
    .update({
      frete,
      total,
      rastreio: d.rastreio || null,
      nota_fiscal: d.nota_fiscal || null,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", d.id);
  if (error) return { ok: false, erro: mensagemErro(error.message) };
  revalidar(d.id);
  return { ok: true, msg: "Dados do pedido salvos." };
}
