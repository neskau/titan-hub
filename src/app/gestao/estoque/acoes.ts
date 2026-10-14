"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { supabaseServidor } from "@/lib/supabase/server";
import { mensagemErro, sessaoAcao } from "@/components/gestao/servidor";

export type Resultado = { ok: true; msg?: string } | { ok: false; erro: string };

const inteiro = (rotulo: string) =>
  z.coerce
    .number({ invalid_type_error: `${rotulo} inválido.` })
    .int(`${rotulo}: use um número inteiro.`)
    .min(0, `${rotulo} não pode ser negativo.`)
    .max(10_000_000, `${rotulo} muito alto.`);

const Cd = z.string().regex(/^[a-z0-9_-]{1,40}$/, "CD inválido.");

const Ajuste = z.object({
  produto_id: z.string().uuid("Produto inválido."),
  cd_id: Cd,
  quantidade: inteiro("Saldo"),
  minimo: inteiro("Mínimo"),
});

function revalidar() {
  revalidatePath("/gestao");
  revalidatePath("/gestao/estoque");
  revalidatePath("/portal");
  revalidatePath("/catalogo");
}

/** Ajuste manual de saldo e mínimo (função SQL ajustar_estoque grava o movimento com o delta). */
export async function ajustarEstoque(entrada: unknown): Promise<Resultado> {
  if (!(await sessaoAcao())) return { ok: false, erro: "Sua sessão expirou ou você não tem acesso." };
  const v = Ajuste.safeParse(entrada);
  if (!v.success) return { ok: false, erro: v.error.issues[0]?.message ?? "Dados inválidos." };
  const d = v.data;
  const { error } = await supabaseServidor().rpc("ajustar_estoque", {
    p_produto: d.produto_id,
    p_cd: d.cd_id,
    p_nova_qtd: d.quantidade,
    p_minimo: d.minimo,
  });
  if (error) return { ok: false, erro: mensagemErro(error.message, "Não foi possível ajustar o estoque.") };
  revalidar();
  return { ok: true, msg: "Estoque ajustado." };
}

const Transferencia = z
  .object({
    produto_id: z.string().uuid("Escolha o produto."),
    de: Cd,
    para: Cd,
    quantidade: inteiro("Quantidade").refine((n) => n > 0, "Informe uma quantidade maior que zero."),
  })
  .refine((d) => d.de !== d.para, { message: "Origem e destino precisam ser CDs diferentes." });

/** Transferência entre CDs (função SQL transferir_estoque). */
export async function transferirEstoque(entrada: unknown): Promise<Resultado> {
  if (!(await sessaoAcao())) return { ok: false, erro: "Sua sessão expirou ou você não tem acesso." };
  const v = Transferencia.safeParse(entrada);
  if (!v.success) return { ok: false, erro: v.error.issues[0]?.message ?? "Dados inválidos." };
  const d = v.data;
  const { error } = await supabaseServidor().rpc("transferir_estoque", {
    p_produto: d.produto_id,
    p_de: d.de,
    p_para: d.para,
    p_qtd: d.quantidade,
  });
  if (error) return { ok: false, erro: mensagemErro(error.message, "Não foi possível transferir.") };
  revalidar();
  return { ok: true, msg: `Transferidas ${d.quantidade} un. com sucesso.` };
}
