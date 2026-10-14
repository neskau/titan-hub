import { describe, expect, it } from "vitest";
import {
  BLING_AUTHORIZE,
  cabecalhoBasic,
  calcularExpiracao,
  iguaisSeguro,
  precisaRenovar,
  urlAutorizacao,
} from "./config";
import {
  agregarSaldos,
  chaveEstoque,
  diferencasEstoque,
  mapearProduto,
  montarContato,
  montarPedido,
  palpiteCategoria,
  planejarProdutos,
} from "./mapear";
import { comRetentativa, criarCadencia, tempoDeEspera } from "./retry";
import type { BlingProduto, BlingSaldo } from "./tipos";

// ---------- Respostas de exemplo (formato da API v3) ----------

const produtosBling: BlingProduto[] = [
  { id: 101, nome: "Módulo Fotovoltaico 620W Bifacial", codigo: "MOD-620", preco: 612.5, tipo: "P", situacao: "A", formato: "S", unidade: "UN" },
  { id: 102, nome: "Inversor On-Grid 5kW Mono", codigo: "INV-5K", preco: 3980, tipo: "P", situacao: "A", formato: "S", unidade: "un" },
  { id: 103, nome: "Instalação (serviço)", codigo: "SRV-1", preco: 500, tipo: "S", situacao: "A", formato: "S" },
  { id: 104, nome: "Produto sem código", codigo: "", preco: 10, tipo: "P", situacao: "A", formato: "S" },
  { id: 105, nome: "Cabo solar (pai de variações)", codigo: "CABO", preco: 0, tipo: "P", situacao: "A", formato: "V" },
  { id: 106, nome: "Cabo solar 6mm vermelho", codigo: "CABO-6-VM", preco: 7.9, tipo: "P", situacao: "I", formato: "S", unidade: "M" },
];

const saldosBling: BlingSaldo[] = [
  {
    produto: { id: 101, codigo: "MOD-620" },
    saldoFisicoTotal: 600,
    saldoVirtualTotal: 580,
    depositos: [
      { id: 1, saldoFisico: 400, saldoVirtual: 380 },
      { id: 2, saldoFisico: 150, saldoVirtual: 150 },
      { id: 3, saldoFisico: 50, saldoVirtual: 50 }, // Piracicaba
      { id: 99, saldoFisico: 999, saldoVirtual: 999 }, // não mapeado
    ],
  },
  { produto: { id: 102 }, depositos: [{ id: 3, saldoFisico: 7.9 }] }, // sem saldoVirtual: usa físico, arredonda p/ baixo
  { produto: { id: 555 }, depositos: [{ id: 1, saldoVirtual: 10 }] }, // produto que o Titan não conhece
];

describe("token", () => {
  it("calcula expiração a partir do expires_in", () => {
    const agora = new Date("2026-10-14T12:00:00Z");
    expect(calcularExpiracao(21600, agora).toISOString()).toBe("2026-10-14T18:00:00.000Z");
    expect(calcularExpiracao(NaN, agora).toISOString()).toBe("2026-10-14T13:00:00.000Z");
  });

  it("renova com 5 min de margem", () => {
    const agora = new Date("2026-10-14T12:00:00Z");
    expect(precisaRenovar("2026-10-14T12:10:00Z", agora)).toBe(false);
    expect(precisaRenovar("2026-10-14T12:04:59Z", agora)).toBe(true);
    expect(precisaRenovar("2026-10-14T11:00:00Z", agora)).toBe(true);
    expect(precisaRenovar("lixo", agora)).toBe(true);
  });

  it("monta Basic auth e URL de autorização", () => {
    expect(cabecalhoBasic("abc", "xyz")).toBe("Basic " + Buffer.from("abc:xyz").toString("base64"));
    const u = new URL(urlAutorizacao("cli123", "st4te"));
    expect(`${u.origin}${u.pathname}`).toBe(BLING_AUTHORIZE);
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("client_id")).toBe("cli123");
    expect(u.searchParams.get("state")).toBe("st4te");
  });

  it("compara segredos", () => {
    expect(iguaisSeguro("abc", "abc")).toBe(true);
    expect(iguaisSeguro("abc", "abd")).toBe(false);
    expect(iguaisSeguro("abc", "abcd")).toBe(false);
  });
});

describe("produtos", () => {
  it("mapeia produto simples e ignora serviço, sem código e pai de variações", () => {
    expect(mapearProduto(produtosBling[0])).toEqual({
      bling_produto_id: 101,
      sku: "MOD-620",
      nome: "Módulo Fotovoltaico 620W Bifacial",
      preco: 612.5,
      unidade: "un",
      marca: null,
      ativoNoBling: true,
    });
    expect(mapearProduto(produtosBling[2])).toBeNull();
    expect(mapearProduto(produtosBling[3])).toBeNull();
    expect(mapearProduto(produtosBling[4])).toBeNull();
  });

  it("palpita categoria pelo nome", () => {
    expect(palpiteCategoria("Microinversor 2kW")).toBe("Microinversores");
    expect(palpiteCategoria("Inversor On-Grid 5kW")).toBe("Inversores");
    expect(palpiteCategoria("MÓDULO 620W")).toBe("Módulos");
    expect(palpiteCategoria("Bateria de lítio")).toBe("Baterias");
    expect(palpiteCategoria("Estrutura telhado cerâmico")).toBe("Estruturas");
    expect(palpiteCategoria("Cabo solar 6mm")).toBe("Elétrica");
  });

  it("planeja: cria novos inativos, vincula e atualiza só o preço que mudou", () => {
    const plano = planejarProdutos(produtosBling, [
      { id: "u1", sku: "mod-620", bling_produto_id: null, preco_base: 612.5 }, // SKU igual sem diferenciar maiúsculas
      { id: "u2", sku: "INV-5K", bling_produto_id: 102, preco_base: 3800 },
    ]);
    expect(plano.vincular).toEqual([{ id: "u1", bling_produto_id: 101 }]);
    expect(plano.precos).toEqual([{ produto_id: "u2", preco_base: 3980 }]);
    expect(plano.novos).toHaveLength(1);
    expect(plano.novos[0]).toMatchObject({ sku: "CABO-6-VM", ativo: false, categoria: "Elétrica", unidade: "m", marca: "A definir", preco: 7.9 });
    expect(plano.ignorados).toBe(3);
  });
});

describe("estoque", () => {
  const depositoParaCd = new Map([
    [1, "cascavel"],
    [2, "cascavel"],
    [3, "piracicaba"],
  ]);
  const produtoPorBlingId = new Map([
    [101, "p-mod"],
    [102, "p-inv"],
  ]);

  it("soma depósitos por CD usando saldo virtual e ignora o que não está mapeado", () => {
    const r = agregarSaldos(saldosBling, depositoParaCd, produtoPorBlingId);
    expect(r.get(chaveEstoque("p-mod", "cascavel"))).toBe(530);
    expect(r.get(chaveEstoque("p-mod", "piracicaba"))).toBe(50);
    expect(r.get(chaveEstoque("p-inv", "piracicaba"))).toBe(7);
    expect(r.get(chaveEstoque("p-inv", "cascavel"))).toBe(0);
    expect(r.size).toBe(4);
  });

  it("nunca gera saldo negativo", () => {
    const r = agregarSaldos([{ produto: { id: 101 }, depositos: [{ id: 1, saldoVirtual: -5 }] }], depositoParaCd, produtoPorBlingId);
    expect(r.get(chaveEstoque("p-mod", "cascavel"))).toBe(0);
  });

  it("só devolve o que mudou", () => {
    const novos = agregarSaldos(saldosBling, depositoParaCd, produtoPorBlingId);
    const atuais = new Map([
      [chaveEstoque("p-mod", "cascavel"), 530], // igual
      [chaveEstoque("p-mod", "piracicaba"), 60], // mudou
      // p-inv/piracicaba não existe (vira 7), p-inv/cascavel não existe e é 0 (não muda)
    ]);
    const d = diferencasEstoque(novos, atuais);
    expect(d).toEqual(
      expect.arrayContaining([
        { produto_id: "p-mod", cd_id: "piracicaba", quantidade: 50, delta: -10 },
        { produto_id: "p-inv", cd_id: "piracicaba", quantidade: 7, delta: 7 },
      ])
    );
    expect(d).toHaveLength(2);
  });
});

describe("pedido", () => {
  const empresa = {
    cnpj: "12.345.678/0001-90",
    razao_social: "Sol Forte Energia LTDA",
    nome_fantasia: "Sol Forte",
    cidade: "Cascavel",
    uf: "PR",
    telefone: "(45) 99999-0000",
  };

  it("monta contato pessoa jurídica pelo CNPJ", () => {
    expect(montarContato(empresa, "85.800-000")).toEqual({
      nome: "Sol Forte Energia LTDA",
      fantasia: "Sol Forte",
      tipo: "J",
      numeroDocumento: "12345678000190",
      situacao: "A",
      telefone: "(45) 99999-0000",
      endereco: { geral: { municipio: "Cascavel", uf: "PR", cep: "85800000" } },
    });
  });

  const pedido = {
    numero: 1042,
    criado_em: "2026-10-14T15:30:00.000Z",
    cd_id: "cascavel",
    pagamento: "pix",
    frete: 150,
    cep_entrega: "85800-000",
    observacao: "Entregar pela manhã",
  };

  it("monta pedido de venda com numeroLoja, itens e frete", () => {
    const p = montarPedido(
      pedido,
      [{ quantidade: 20, preco_unitario: 612.5, produto: { sku: "MOD-620", nome: "Módulo 620W", unidade: "un", bling_produto_id: 101 } }],
      777
    );
    expect(p).toMatchObject({
      numeroLoja: "TITAN-1042",
      data: "2026-10-14",
      contato: { id: 777 },
      transporte: { frete: 150 },
      itens: [{ codigo: "MOD-620", descricao: "Módulo 620W", unidade: "un", quantidade: 20, valor: 612.5, produto: { id: 101 } }],
    });
    expect(p.observacoes).toContain("Pagamento: PIX");
    expect(p.observacoes).toContain("Entregar pela manhã");
  });

  it("recusa item sem vínculo com o Bling", () => {
    expect(() =>
      montarPedido(pedido, [{ quantidade: 1, preco_unitario: 10, produto: { sku: "X1", nome: "X", unidade: "un", bling_produto_id: null } }], 1)
    ).toThrow(/X1/);
    expect(() => montarPedido(pedido, [], 1)).toThrow(/sem itens/);
  });
});

describe("retentativa", () => {
  const resp = (status: number, headers: Record<string, string> = {}) => new Response(null, { status, headers });

  it("calcula espera: Retry-After ou exponencial com teto", () => {
    expect(tempoDeEspera(1, "2")).toBe(2000);
    expect(tempoDeEspera(1, null)).toBe(1000);
    expect(tempoDeEspera(3, null)).toBe(4000);
    expect(tempoDeEspera(10, null)).toBe(30000);
  });

  it("repete em 429 até dar certo", async () => {
    const esperas: number[] = [];
    const fila = [resp(429), resp(429, { "retry-after": "3" }), resp(200)];
    const r = await comRetentativa(async () => fila.shift()!, { esperar: async (ms) => void esperas.push(ms) });
    expect(r.status).toBe(200);
    expect(esperas).toEqual([1000, 3000]);
  });

  it("desiste após o máximo e devolve o último 429", async () => {
    let n = 0;
    const r = await comRetentativa(async () => (n++, resp(429)), { maxTentativas: 3, esperar: async () => {} });
    expect(r.status).toBe(429);
    expect(n).toBe(3);
  });

  it("não repete 500 em POST, mas repete em GET", async () => {
    let n = 0;
    const r1 = await comRetentativa(async () => (n++, resp(500)), { esperar: async () => {} });
    expect(r1.status).toBe(500);
    expect(n).toBe(1);
    n = 0;
    const fila = [resp(503), resp(200)];
    const r2 = await comRetentativa(async () => (n++, fila.shift()!), { repetirFalhaServidor: true, esperar: async () => {} });
    expect(r2.status).toBe(200);
    expect(n).toBe(2);
  });

  it("cadência espaça as chamadas", async () => {
    let t = 1000;
    const esperas: number[] = [];
    const c = criarCadencia(350, async (ms) => void esperas.push(ms), () => t);
    await c();
    await c();
    await c();
    t += 2000;
    await c();
    expect(esperas).toEqual([350, 700]);
  });
});
