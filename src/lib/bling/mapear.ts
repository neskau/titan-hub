// Funções puras de mapeamento Bling <-> Titan (sem banco e sem rede; testadas em mapear.test.ts).
import type { Categoria } from "../tipos";
import type { BlingContatoNovo, BlingPedidoNovo, BlingProduto, BlingSaldo } from "./tipos";

// ---------------- Produtos ----------------

export interface ProdutoDoBling {
  bling_produto_id: number;
  sku: string;
  nome: string;
  preco: number | null;
  unidade: string;
  marca: string | null;
  ativoNoBling: boolean;
}

/** Converte um produto do Bling. Devolve null quando não serve ao catálogo (sem código, serviço, produto-pai de variações). */
export function mapearProduto(p: BlingProduto): ProdutoDoBling | null {
  const sku = (p.codigo ?? "").trim();
  if (!sku) return null;
  if (p.tipo && p.tipo !== "P") return null; // serviços etc.
  if (p.formato === "V") return null; // pai de variações: as variações vêm como produtos próprios
  const preco = typeof p.preco === "number" && Number.isFinite(p.preco) && p.preco > 0 ? round2(p.preco) : null; // 0 = sem preço no Bling
  return {
    bling_produto_id: p.id,
    sku,
    nome: (p.nome ?? "").trim() || sku,
    preco,
    unidade: (p.unidade ?? "").trim().toLowerCase() || "un",
    marca: p.marca?.trim() || null,
    ativoNoBling: p.situacao !== "I",
  };
}

/** Palpite de categoria para produto novo (a equipe confere antes de ativar). */
export function palpiteCategoria(nome: string): Categoria {
  const n = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/micro\s*-?\s*inversor/.test(n)) return "Microinversores";
  if (/inversor/.test(n)) return "Inversores";
  if (/modulo|painel|placa solar|\bwp\b|\d{3}\s?w\b/.test(n)) return "Módulos";
  if (/bateria/.test(n)) return "Baterias";
  if (/estrutura|trilho|perfil|gancho|suporte|telhado|solo/.test(n)) return "Estruturas";
  return "Elétrica";
}

export interface ProdutoTitanResumo {
  id: string;
  sku: string;
  bling_produto_id: number | null;
  preco_base: number | null;
}

export interface PlanoProdutos {
  novos: { sku: string; nome: string; marca: string; categoria: Categoria; unidade: string; ativo: false; bling_produto_id: number; preco: number | null }[];
  vincular: { id: string; bling_produto_id: number }[];
  precos: { produto_id: string; preco_base: number }[];
  ignorados: number;
}

/**
 * Compara a lista do Bling com o que já existe no Titan (chave = SKU = código do Bling).
 * - SKU novo: cria produto INATIVO (equipe completa categoria/dados técnicos e ativa).
 * - SKU existente: grava bling_produto_id se faltar/mudar e atualiza preço se mudou.
 * Nome, categoria e dados técnicos do Titan nunca são sobrescritos.
 */
export function planejarProdutos(doBling: BlingProduto[], titan: ProdutoTitanResumo[]): PlanoProdutos {
  const porSku = new Map(titan.map((t) => [t.sku.trim().toLowerCase(), t]));
  const plano: PlanoProdutos = { novos: [], vincular: [], precos: [], ignorados: 0 };
  const vistos = new Set<string>();
  for (const bp of doBling) {
    const p = mapearProduto(bp);
    if (!p) {
      plano.ignorados++;
      continue;
    }
    const chave = p.sku.toLowerCase();
    if (vistos.has(chave)) {
      plano.ignorados++;
      continue;
    }
    vistos.add(chave);
    const t = porSku.get(chave);
    if (!t) {
      plano.novos.push({
        sku: p.sku,
        nome: p.nome,
        marca: p.marca ?? "A definir",
        categoria: palpiteCategoria(p.nome),
        unidade: p.unidade,
        ativo: false,
        bling_produto_id: p.bling_produto_id,
        preco: p.preco,
      });
      continue;
    }
    if (t.bling_produto_id !== p.bling_produto_id) plano.vincular.push({ id: t.id, bling_produto_id: p.bling_produto_id });
    if (p.preco !== null && (t.preco_base === null || round2(t.preco_base) !== p.preco)) {
      plano.precos.push({ produto_id: t.id, preco_base: p.preco });
    }
  }
  return plano;
}

// ---------------- Estoque ----------------

/** chave "produto_id|cd_id" */
export const chaveEstoque = (produtoId: string, cdId: string) => `${produtoId}|${cdId}`;

/**
 * Soma os saldos por CD. Usa o saldo VIRTUAL (físico menos reservado em pedidos) por depósito,
 * caindo para o físico se o virtual não vier. Depósitos sem mapeamento são ignorados.
 * Todo produto retornado recebe 0 nos CDs mapeados onde não aparece.
 */
export function agregarSaldos(
  saldos: BlingSaldo[],
  depositoParaCd: Map<number, string>,
  produtoPorBlingId: Map<number, string>
): Map<string, number> {
  const cds = Array.from(new Set(Array.from(depositoParaCd.values())));
  const total = new Map<string, number>();
  for (const s of saldos) {
    const produtoId = produtoPorBlingId.get(s.produto?.id);
    if (!produtoId) continue;
    for (const cd of cds) {
      const k = chaveEstoque(produtoId, cd);
      if (!total.has(k)) total.set(k, 0);
    }
    for (const d of s.depositos ?? []) {
      const cd = depositoParaCd.get(d.id);
      if (!cd) continue;
      const v = typeof d.saldoVirtual === "number" ? d.saldoVirtual : typeof d.saldoFisico === "number" ? d.saldoFisico : 0;
      const k = chaveEstoque(produtoId, cd);
      total.set(k, (total.get(k) ?? 0) + v);
    }
  }
  // estoque.quantidade é inteiro >= 0
  total.forEach((v, k) => total.set(k, Math.max(0, Math.floor(v))));
  return total;
}

export interface MudancaEstoque {
  produto_id: string;
  cd_id: string;
  quantidade: number;
  delta: number;
}

/** Só o que mudou: atual ausente conta como 0 (e 0 -> 0 não gera nada). */
export function diferencasEstoque(novos: Map<string, number>, atuais: Map<string, number>): MudancaEstoque[] {
  const out: MudancaEstoque[] = [];
  novos.forEach((qtd, k) => {
    const antes = atuais.get(k) ?? 0;
    const existia = atuais.has(k);
    if (qtd === antes && (existia || qtd === 0)) return;
    const [produto_id, cd_id] = k.split("|");
    out.push({ produto_id, cd_id, quantidade: qtd, delta: qtd - antes });
  });
  return out;
}

// ---------------- Pedidos ----------------

export const soDigitos = (s: string) => s.replace(/\D/g, "");

export interface EmpresaParaBling {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  cidade: string | null;
  uf: string | null;
  telefone: string | null;
}

export function montarContato(e: EmpresaParaBling, cep?: string | null): BlingContatoNovo {
  const doc = soDigitos(e.cnpj);
  const c: BlingContatoNovo = {
    nome: e.razao_social.trim(),
    tipo: doc.length === 11 ? "F" : "J",
    numeroDocumento: doc,
    situacao: "A",
  };
  if (e.nome_fantasia) c.fantasia = e.nome_fantasia.trim();
  if (e.telefone) c.telefone = e.telefone.trim();
  if (e.cidade || e.uf || cep) {
    c.endereco = { geral: {} };
    if (e.cidade) c.endereco.geral.municipio = e.cidade;
    if (e.uf) c.endereco.geral.uf = e.uf;
    if (cep) c.endereco.geral.cep = soDigitos(cep);
  }
  return c;
}

export interface PedidoParaBling {
  numero: number;
  criado_em: string;
  cd_id: string;
  pagamento: string;
  frete: number;
  cep_entrega: string | null;
  observacao: string | null;
}

export interface ItemParaBling {
  quantidade: number;
  preco_unitario: number;
  produto: { sku: string; nome: string; unidade: string; bling_produto_id: number | null };
}

const ROTULO_PAGAMENTO: Record<string, string> = {
  pix: "PIX",
  boleto_faturado: "Boleto faturado",
  cartao: "Cartão",
};

export const numeroLojaTitan = (numero: number) => `TITAN-${numero}`;

/** Monta o pedido de venda do Bling. Lança erro se algum item não estiver vinculado a um produto do Bling. */
export function montarPedido(p: PedidoParaBling, itens: ItemParaBling[], contatoId: number): BlingPedidoNovo {
  if (itens.length === 0) throw new Error("Pedido sem itens");
  const semVinculo = itens.filter((i) => !i.produto.bling_produto_id).map((i) => i.produto.sku);
  if (semVinculo.length) {
    throw new Error(`Produtos sem vínculo com o Bling (rode a sincronização de produtos): ${semVinculo.join(", ")}`);
  }
  const obs = [
    `Pedido Titan Hub nº ${p.numero}`,
    `CD: ${p.cd_id}`,
    `Pagamento: ${ROTULO_PAGAMENTO[p.pagamento] ?? p.pagamento}`,
    p.cep_entrega ? `CEP de entrega: ${p.cep_entrega}` : null,
    p.observacao ? `Obs. do cliente: ${p.observacao}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
  const pedido: BlingPedidoNovo = {
    numeroLoja: numeroLojaTitan(p.numero),
    data: p.criado_em.slice(0, 10),
    contato: { id: contatoId },
    itens: itens.map((i) => ({
      codigo: i.produto.sku,
      descricao: i.produto.nome,
      unidade: i.produto.unidade || "un",
      quantidade: i.quantidade,
      valor: round2(Number(i.preco_unitario)),
      produto: { id: i.produto.bling_produto_id as number },
    })),
    observacoes: obs,
  };
  if (Number(p.frete) > 0) pedido.transporte = { frete: round2(Number(p.frete)) };
  return pedido;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
