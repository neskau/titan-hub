"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { supabaseServidor } from "@/lib/supabase/server";
import { soDigitos } from "@/lib/formato";

const Entrada = z.object({
  cd: z.string().min(1).max(40),
  pagamento: z.enum(["pix", "cartao", "boleto_faturado"]),
  itens: z
    .array(z.object({ produto_id: z.string().uuid(), quantidade: z.number().int().positive().max(100000) }))
    .min(1, "Seu carrinho está vazio.")
    .max(200),
  cep: z.string().max(12),
  obs: z.string().max(1000),
});

export type ResultadoPedido = { ok: true; id: string } | { ok: false; erro: string };

/** Traduz as recusas da função criar_pedido para mensagens ao integrador. */
async function traduzirErro(msg: string): Promise<string> {
  const estoque = msg.match(/Estoque insuficiente para (.+?): disponível (\d+) un\./i);
  if (estoque) {
    return `Estoque insuficiente para ${estoque[1]} neste CD (disponível: ${estoque[2]} un.). Ajuste a quantidade ou troque o CD.`;
  }
  if (/Produto sem preço cadastrado/i.test(msg)) return "Um dos produtos está sem preço cadastrado. Fale com sua vendedora.";
  if (/Cadastro ainda não aprovado/i.test(msg)) return "Seu cadastro ainda não foi aprovado. Assim que for liberado, você poderá fechar pedidos.";
  if (/Boleto faturado não liberado/i.test(msg)) return "O boleto faturado ainda não está liberado para a sua empresa. Escolha Pix ou cartão.";
  if (/Carrinho vazio/i.test(msg)) return "Seu carrinho está vazio.";
  if (/Quantidade inválida/i.test(msg)) return "Há uma quantidade inválida no carrinho.";
  if (/null value in column "preco_unitario"/i.test(msg)) return "Um dos produtos está sem preço cadastrado. Fale com sua vendedora.";
  if (/foreign key|violates/i.test(msg)) return "Um dos produtos não está mais disponível. Atualize o carrinho e tente de novo.";
  return "Não foi possível fechar o pedido agora. Tente novamente em instantes ou fale com sua vendedora.";
}

export async function fecharPedido(entrada: unknown): Promise<ResultadoPedido> {
  const v = Entrada.safeParse(entrada);
  if (!v.success) return { ok: false, erro: v.error.issues[0]?.message ?? "Dados do pedido inválidos." };
  const cep = soDigitos(v.data.cep);
  if (cep.length !== 8) return { ok: false, erro: "Informe um CEP de entrega com 8 dígitos." };

  // Junta linhas repetidas do mesmo produto (a tabela pedido_itens não aceita duplicatas).
  const porProduto = new Map<string, number>();
  for (const i of v.data.itens) porProduto.set(i.produto_id, (porProduto.get(i.produto_id) ?? 0) + i.quantidade);
  const itens = Array.from(porProduto, ([produto_id, quantidade]) => ({ produto_id, quantidade }));

  const { data, error } = await supabaseServidor().rpc("criar_pedido", {
    p_cd: v.data.cd,
    p_pagamento: v.data.pagamento,
    p_itens: itens,
    p_cep: cep,
    p_obs: v.data.obs.trim() || null,
    p_frete: 0,
  });
  if (error || !data) return { ok: false, erro: await traduzirErro(error?.message ?? "") };

  revalidatePath("/portal/pedidos");
  revalidatePath("/portal");
  return { ok: true, id: String(data) };
}
