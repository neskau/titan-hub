import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../supabase/admin";
import { blingFetch, blingListarTudo } from "./cliente";
import {
  agregarSaldos,
  chaveEstoque,
  diferencasEstoque,
  montarContato,
  montarPedido,
  numeroLojaTitan,
  planejarProdutos,
  soDigitos,
  type ItemParaBling,
  type ProdutoTitanResumo,
} from "./mapear";
import type { BlingContato, BlingCriado, BlingPedidoResumo, BlingProduto, BlingResposta, BlingSaldo } from "./tipos";

export type Contadores = Record<string, number>;
type TipoSync = "produtos" | "estoque" | "pedido";

// ---------------- Log em bling_sincronizacoes ----------------

/** Executa `fazer` registrando início/fim/resultado. Relança o erro depois de gravar. */
export async function comLog<T extends { contadores: Contadores; mensagem?: string }>(
  tipo: TipoSync,
  fazer: () => Promise<T>
): Promise<T> {
  const sb = supabaseAdmin();
  const { data: log } = await sb.from("bling_sincronizacoes").insert({ tipo }).select("id").single<{ id: number }>();
  try {
    const r = await fazer();
    if (log) {
      await sb
        .from("bling_sincronizacoes")
        .update({ fim: new Date().toISOString(), ok: true, mensagem: r.mensagem ?? null, contadores: r.contadores })
        .eq("id", log.id);
    }
    return r;
  } catch (e) {
    if (log) {
      await sb
        .from("bling_sincronizacoes")
        .update({ fim: new Date().toISOString(), ok: false, mensagem: mensagemSegura(e) })
        .eq("id", log.id);
    }
    throw e;
  }
}

/** Mensagem curta e sem dados sensíveis. */
export function mensagemSegura(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m.replace(/Bearer\s+[\w.-]+/gi, "Bearer ***").slice(0, 500);
}

// ---------------- Leitura paginada do Supabase ----------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- o builder do Supabase muda de tipo a cada filtro
type Filtro = (q: any) => any;

async function lerTudo<T>(sb: SupabaseClient, tabela: string, colunas: string, filtro?: Filtro): Promise<T[]> {
  const passo = 1000;
  const out: T[] = [];
  for (let de = 0; ; de += passo) {
    let q = sb.from(tabela).select(colunas).range(de, de + passo - 1);
    if (filtro) q = filtro(q);
    const { data, error } = await q;
    if (error) throw new Error(`Falha ao ler ${tabela}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < passo) break;
  }
  return out;
}

function emLotes<T>(lista: T[], tamanho: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) out.push(lista.slice(i, i + tamanho));
  return out;
}

// ---------------- Produtos ----------------

/**
 * Bling -> Titan por SKU (= código do produto no Bling).
 * Cria produtos novos INATIVOS (marca "A definir", categoria por palpite) para a equipe completar.
 * Atualiza só vínculo (bling_produto_id) e preço base dos existentes.
 */
export async function sincronizarProdutos(): Promise<{ contadores: Contadores; mensagem?: string }> {
  const sb = supabaseAdmin();
  const doBling = await blingListarTudo<BlingProduto>("/produtos");

  const produtos = await lerTudo<{ id: string; sku: string; bling_produto_id: number | null }>(
    sb,
    "produtos",
    "id, sku, bling_produto_id"
  );
  const precos = await lerTudo<{ produto_id: string; preco_base: number }>(sb, "precos", "produto_id, preco_base");
  const precoPorId = new Map(precos.map((p) => [p.produto_id, Number(p.preco_base)]));
  const titan: ProdutoTitanResumo[] = produtos.map((p) => ({
    id: p.id,
    sku: p.sku,
    bling_produto_id: p.bling_produto_id === null ? null : Number(p.bling_produto_id),
    preco_base: precoPorId.has(p.id) ? (precoPorId.get(p.id) as number) : null,
  }));

  const plano = planejarProdutos(doBling, titan);
  const agora = new Date().toISOString();

  for (const lote of emLotes(plano.novos, 200)) {
    const { data, error } = await sb
      .from("produtos")
      .insert(
        lote.map((n) => ({
          sku: n.sku,
          nome: n.nome,
          marca: n.marca,
          categoria: n.categoria,
          unidade: n.unidade,
          ativo: n.ativo,
          bling_produto_id: n.bling_produto_id,
        }))
      )
      .select("id, sku");
    if (error) throw new Error(`Falha ao criar produtos novos: ${error.message}`);
    const idPorSku = new Map((data ?? []).map((d: { id: string; sku: string }) => [d.sku, d.id]));
    const novosPrecos = lote
      .filter((n) => n.preco !== null && idPorSku.has(n.sku))
      .map((n) => ({ produto_id: idPorSku.get(n.sku) as string, preco_base: n.preco as number, atualizado_em: agora }));
    if (novosPrecos.length) {
      const { error: e2 } = await sb.from("precos").upsert(novosPrecos, { onConflict: "produto_id" });
      if (e2) throw new Error(`Falha ao gravar preços dos produtos novos: ${e2.message}`);
    }
  }

  for (const v of plano.vincular) {
    const { error } = await sb.from("produtos").update({ bling_produto_id: v.bling_produto_id, atualizado_em: agora }).eq("id", v.id);
    if (error) throw new Error(`Falha ao vincular produto: ${error.message}`);
  }

  for (const lote of emLotes(plano.precos, 500)) {
    const { error } = await sb
      .from("precos")
      .upsert(lote.map((p) => ({ ...p, atualizado_em: agora })), { onConflict: "produto_id" });
    if (error) throw new Error(`Falha ao atualizar preços: ${error.message}`);
  }

  const contadores: Contadores = {
    lidos_bling: doBling.length,
    criados_inativos: plano.novos.length,
    vinculados: plano.vincular.length,
    precos_atualizados: plano.precos.length,
    ignorados: plano.ignorados,
  };
  const mensagem = plano.novos.length
    ? `${plano.novos.length} produto(s) novo(s) criado(s) INATIVOS: complete categoria, marca e dados técnicos e ative.`
    : undefined;
  return { contadores, mensagem };
}

// ---------------- Estoque ----------------

/**
 * Saldos do Bling por depósito -> estoque por CD (via bling_depositos).
 * Grava movimentos_estoque (motivo 'sync_bling') apenas quando o saldo muda.
 */
export async function sincronizarEstoque(): Promise<{ contadores: Contadores; mensagem?: string }> {
  const sb = supabaseAdmin();
  const mapa = await lerTudo<{ deposito_id: number; cd_id: string }>(sb, "bling_depositos", "deposito_id, cd_id");
  if (mapa.length === 0) {
    throw new Error("Nenhum depósito do Bling mapeado para CD (tabela bling_depositos vazia). Veja docs/BLING.md.");
  }
  const depositoParaCd = new Map(mapa.map((m) => [Number(m.deposito_id), m.cd_id]));

  const vinculados = await lerTudo<{ id: string; bling_produto_id: number }>(sb, "produtos", "id, bling_produto_id", (q) =>
    q.not("bling_produto_id", "is", null)
  );
  if (vinculados.length === 0) return { contadores: { produtos: 0, alterados: 0 }, mensagem: "Nenhum produto vinculado ao Bling ainda." };
  const produtoPorBlingId = new Map(vinculados.map((p) => [Number(p.bling_produto_id), p.id]));

  const saldos: BlingSaldo[] = [];
  for (const lote of emLotes(Array.from(produtoPorBlingId.keys()), 50)) {
    const r = await blingFetch<BlingResposta<BlingSaldo[]>>("GET", "/estoques/saldos", { consulta: { "idsProdutos[]": lote } });
    saldos.push(...(r?.data ?? []));
  }
  const novos = agregarSaldos(saldos, depositoParaCd, produtoPorBlingId);

  const cds = Array.from(new Set(mapa.map((m) => m.cd_id)));
  const atuaisLinhas = await lerTudo<{ produto_id: string; cd_id: string; quantidade: number }>(
    sb,
    "estoque",
    "produto_id, cd_id, quantidade",
    (q) => q.in("cd_id", cds)
  );
  const atuais = new Map(atuaisLinhas.map((l) => [chaveEstoque(l.produto_id, l.cd_id), Number(l.quantidade)]));
  const mudancas = diferencasEstoque(novos, atuais);

  const agora = new Date().toISOString();
  for (const lote of emLotes(mudancas, 500)) {
    const { error } = await sb.from("estoque").upsert(
      lote.map((m) => ({ produto_id: m.produto_id, cd_id: m.cd_id, quantidade: m.quantidade, atualizado_em: agora })),
      { onConflict: "produto_id,cd_id" }
    );
    if (error) throw new Error(`Falha ao gravar estoque: ${error.message}`);
    const movs = lote
      .filter((m) => m.delta !== 0)
      .map((m) => ({ produto_id: m.produto_id, cd_id: m.cd_id, delta: m.delta, motivo: "sync_bling", referencia: "bling" }));
    if (movs.length) {
      const { error: e2 } = await sb.from("movimentos_estoque").insert(movs);
      if (e2) throw new Error(`Falha ao gravar movimentos de estoque: ${e2.message}`);
    }
  }

  return { contadores: { produtos: produtoPorBlingId.size, saldos_lidos: saldos.length, alterados: mudancas.length } };
}

// ---------------- Pedido ----------------

interface PedidoCompleto {
  id: string;
  numero: number;
  criado_em: string;
  cd_id: string;
  pagamento: string;
  frete: number;
  cep_entrega: string | null;
  observacao: string | null;
  bling_pedido_id: number | null;
  empresa: {
    id: string;
    cnpj: string;
    razao_social: string;
    nome_fantasia: string | null;
    cidade: string | null;
    uf: string | null;
    telefone: string | null;
    bling_contato_id: number | null;
  };
  pedido_itens: ItemParaBling[];
}

async function encontrarOuCriarContato(sb: SupabaseClient, e: PedidoCompleto["empresa"], cep: string | null): Promise<number> {
  if (e.bling_contato_id) return Number(e.bling_contato_id);
  const doc = soDigitos(e.cnpj);
  const busca = await blingFetch<BlingResposta<BlingContato[]>>("GET", "/contatos", { consulta: { numeroDocumento: doc } });
  const achado = (busca?.data ?? []).find((c) => soDigitos(c.numeroDocumento ?? "") === doc);
  let id: number;
  if (achado) {
    id = achado.id;
  } else {
    const criado = await blingFetch<BlingResposta<BlingCriado>>("POST", "/contatos", { corpo: montarContato(e, cep) });
    id = criado.data.id;
  }
  await sb.from("empresas").update({ bling_contato_id: id }).eq("id", e.id);
  return id;
}

/** Envia um pedido do Titan como pedido de venda no Bling. Idempotente: se já foi enviado, devolve o id existente. */
export async function enviarPedido(pedidoId: string) {
  const sb = supabaseAdmin();
  const { data: p, error } = await sb
    .from("pedidos")
    .select(
      "id, numero, criado_em, cd_id, pagamento, frete, cep_entrega, observacao, bling_pedido_id," +
        " empresa:empresas!inner(id, cnpj, razao_social, nome_fantasia, cidade, uf, telefone, bling_contato_id)," +
        " pedido_itens(quantidade, preco_unitario, produto:produtos(sku, nome, unidade, bling_produto_id))"
    )
    .eq("id", pedidoId)
    .maybeSingle<PedidoCompleto>();
  if (error) throw new Error(`Falha ao ler o pedido: ${error.message}`);
  if (!p) throw new Error("Pedido não encontrado");
  if (p.bling_pedido_id) {
    return { contadores: { enviados: 0 }, mensagem: "Pedido já estava no Bling", bling_pedido_id: Number(p.bling_pedido_id) };
  }

  // Evita duplicar se um envio anterior chegou ao Bling mas não gravou o id aqui.
  const numeroLoja = numeroLojaTitan(p.numero);
  const existente = await blingFetch<BlingResposta<BlingPedidoResumo[]>>("GET", "/pedidos/vendas", {
    consulta: { "numerosLojas[]": [numeroLoja] },
  });
  let blingId = (existente?.data ?? []).find((x) => x.numeroLoja === numeroLoja)?.id;

  if (!blingId) {
    const contatoId = await encontrarOuCriarContato(sb, p.empresa, p.cep_entrega);
    const corpo = montarPedido(p, p.pedido_itens, contatoId);
    const criado = await blingFetch<BlingResposta<BlingCriado>>("POST", "/pedidos/vendas", { corpo });
    blingId = criado.data.id;
  }

  const { error: e2 } = await sb.from("pedidos").update({ bling_pedido_id: blingId, atualizado_em: new Date().toISOString() }).eq("id", p.id);
  if (e2) throw new Error(`Pedido criado no Bling (id ${blingId}), mas falhou ao gravar no Titan: ${e2.message}`);
  return { contadores: { enviados: 1 }, mensagem: `Pedido ${p.numero} enviado ao Bling`, bling_pedido_id: blingId };
}
