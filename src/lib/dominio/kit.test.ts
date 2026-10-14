import { describe, expect, it } from "vitest";
import { montarKit, kwpParaConsumo } from "./kit";
import { calcularPayback } from "./payback";
import { cnpjValido } from "../formato";
import type { ItemCatalogo } from "../tipos";

const base = (o: Partial<ItemCatalogo>): ItemCatalogo => ({
  id: o.sku ?? "x", sku: "x", nome: "x", marca: "x", categoria: "Módulos", especificacao: null,
  potencia_w: null, potencia_kw: null, fase: null, modulos_por_estrutura: null, tipo_telhado: null,
  datasheet_path: null, imagem_path: null, unidade: "un", cd_id: "cascavel", preco: 100, estoque: 1000, ...o,
});

const modulo = base({ sku: "m620", categoria: "Módulos", potencia_w: 620, preco: 612 });
const invs = [
  base({ sku: "i5", categoria: "Inversores", potencia_kw: 5, fase: "mono", preco: 3980 }),
  base({ sku: "i8", categoria: "Inversores", potencia_kw: 8, fase: "mono", preco: 5640 }),
  base({ sku: "i10", categoria: "Inversores", potencia_kw: 10, fase: "mono", preco: 6870 }),
  base({ sku: "i15", categoria: "Inversores", potencia_kw: 15, fase: "tri", preco: 10450 }),
];
const ests = [
  base({ sku: "ec", categoria: "Estruturas", tipo_telhado: "ceramica", modulos_por_estrutura: 4, preco: 398 }),
  base({ sku: "em", categoria: "Estruturas", tipo_telhado: "metalica", modulos_por_estrutura: 4, preco: 276 }),
];

describe("montarKit", () => {
  it("arredonda módulos para cima e escolhe o menor inversor que cobre", () => {
    const r = montarKit({ kwpDesejado: 9.9, modulo, inversores: invs, estruturas: ests, fase: "mono", telhado: "ceramica" });
    expect(r.quantidadeModulos).toBe(16);           // 16 × 620 = 9,92 kWp
    expect(r.kwpReal).toBeCloseTo(9.92);
    expect(r.linhas[1].produto.sku).toBe("i8");     // 8 × 1,3 = 10,4 ≥ 9,92
    expect(r.linhas[2]).toMatchObject({ quantidade: 4 });
    expect(r.total).not.toBeNull();
  });

  it("usa vários inversores quando nenhum cobre sozinho", () => {
    const r = montarKit({ kwpDesejado: 40, modulo, inversores: invs, estruturas: ests, fase: "tri", telhado: "metalica" });
    expect(r.linhas[1].produto.sku).toBe("i15");
    expect(r.linhas[1].quantidade).toBe(3);         // 40,3 / (15 × 1,3) = 2,07 → 3
  });

  it("aponta falta de estoque e esconde total sem preço", () => {
    const semPreco = { ...modulo, preco: null, estoque: 5 };
    const r = montarKit({ kwpDesejado: 5, modulo: semPreco, inversores: invs, estruturas: ests, fase: "mono", telhado: "ceramica" });
    expect(r.total).toBeNull();
    expect(r.faltaEstoque.map((l) => l.produto.sku)).toContain("m620");
  });

  it("recusa entrada inválida", () => {
    expect(() => montarKit({ kwpDesejado: 0, modulo, inversores: invs, estruturas: ests, fase: "mono", telhado: "ceramica" })).toThrow();
  });
});

describe("kwpParaConsumo", () => {
  it("converte consumo em potência", () => {
    expect(kwpParaConsumo(1176, 4.9)).toBeCloseTo(10, 1); // 4,9 × 30 × 0,8 = 117,6 kWh/kWp
  });
});

describe("calcularPayback", () => {
  it("calcula payback fracionário", () => {
    const r = calcularPayback({ investimento: 12000, geracaoKwhMes: 100, tarifa: 1, reajusteAnual: 0, degradacaoAnual: 0, anos: 25 });
    expect(r.paybackAnos).toBeCloseTo(10);           // 1.200 por ano
    expect(r.saldoFinal).toBeCloseTo(18000);
  });
});

describe("cnpjValido", () => {
  it("aceita CNPJ válido e recusa inválido", () => {
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cnpjValido("11.222.333/0001-82")).toBe(false);
    expect(cnpjValido("00000000000000")).toBe(false);
  });
});
