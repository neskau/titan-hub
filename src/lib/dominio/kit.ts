import type { Fase, ItemCatalogo, TipoTelhado } from "../tipos";

/** Geração média por kWp instalado (kWh/mês) a partir das horas de sol pleno (HSP) e do rendimento do sistema. */
export function geracaoPorKwp(hsp: number, rendimento = 0.8): number {
  return hsp * 30 * rendimento;
}

/** kWp necessário para cobrir um consumo mensal. */
export function kwpParaConsumo(consumoKwhMes: number, hsp: number, rendimento = 0.8): number {
  if (consumoKwhMes <= 0 || hsp <= 0) return 0;
  return consumoKwhMes / geracaoPorKwp(hsp, rendimento);
}

export interface EntradaKit {
  kwpDesejado: number;
  modulo: ItemCatalogo;          // categoria Módulos, com potencia_w
  inversores: ItemCatalogo[];    // categoria Inversores, com potencia_kw e fase
  estruturas: ItemCatalogo[];    // categoria Estruturas, com tipo_telhado e modulos_por_estrutura
  fase: Fase;
  telhado: TipoTelhado;
  cabo?: ItemCatalogo;           // vendido por metro
  conector?: ItemCatalogo;       // par MC4
  stringBox?: ItemCatalogo;
  /** Relação CC/CA máxima aceita (potência dos módulos / potência dos inversores). */
  sobrecargaMax?: number;
}

export interface LinhaKit {
  produto: ItemCatalogo;
  quantidade: number;
}

export interface ResultadoKit {
  linhas: LinhaKit[];
  quantidadeModulos: number;
  kwpReal: number;
  kwInversores: number;
  relacaoCcCa: number;
  total: number | null;          // null quando algum item não tem preço visível
  faltaEstoque: LinhaKit[];
  avisos: string[];
}

/**
 * Sugere um kit completo. Regras:
 * - módulos: arredonda para cima até atingir o kWp desejado;
 * - inversor: menor modelo da fase escolhida cuja potência × sobrecargaMax cubra os módulos;
 *   se nenhum cobrir sozinho, usa N unidades do maior;
 * - estruturas: 1 kit para cada `modulos_por_estrutura` módulos, do tipo de telhado escolhido;
 * - cabo: 30 m + 2,5 m por módulo; conectores: 1 par a cada 2 módulos + 2 de reserva; 1 string box por inversor.
 */
export function montarKit(e: EntradaKit): ResultadoKit {
  const avisos: string[] = [];
  const sobrecarga = e.sobrecargaMax ?? 1.3;
  const wModulo = e.modulo.potencia_w ?? 0;
  if (wModulo <= 0) throw new Error("Módulo sem potência cadastrada");
  if (e.kwpDesejado <= 0) throw new Error("Informe uma potência maior que zero");

  const quantidadeModulos = Math.ceil((e.kwpDesejado * 1000) / wModulo);
  const kwpReal = (quantidadeModulos * wModulo) / 1000;

  const invs = e.inversores
    .filter((i) => i.fase === e.fase && (i.potencia_kw ?? 0) > 0)
    .sort((a, b) => (a.potencia_kw ?? 0) - (b.potencia_kw ?? 0));
  if (invs.length === 0) throw new Error("Nenhum inversor cadastrado para esta rede");

  let inversor = invs.find((i) => (i.potencia_kw ?? 0) * sobrecarga >= kwpReal);
  let qtdInv = 1;
  if (!inversor) {
    inversor = invs[invs.length - 1];
    qtdInv = Math.ceil(kwpReal / ((inversor.potencia_kw ?? 1) * sobrecarga));
  }
  const kwInversores = (inversor.potencia_kw ?? 0) * qtdInv;
  const relacaoCcCa = kwpReal / kwInversores;
  if (relacaoCcCa < 0.75) avisos.push("Inversor folgado: relação CC/CA abaixo de 0,75. Considere um modelo menor ou mais módulos.");

  const linhas: LinhaKit[] = [
    { produto: e.modulo, quantidade: quantidadeModulos },
    { produto: inversor, quantidade: qtdInv },
  ];

  const estrutura = e.estruturas.find((s) => s.tipo_telhado === e.telhado);
  if (estrutura) {
    const porKit = estrutura.modulos_por_estrutura ?? 4;
    linhas.push({ produto: estrutura, quantidade: Math.ceil(quantidadeModulos / porKit) });
  } else {
    avisos.push("Não há estrutura cadastrada para este tipo de telhado.");
  }
  if (e.cabo) linhas.push({ produto: e.cabo, quantidade: Math.round(30 + quantidadeModulos * 2.5) });
  if (e.conector) linhas.push({ produto: e.conector, quantidade: Math.ceil(quantidadeModulos / 2) + 2 });
  if (e.stringBox) linhas.push({ produto: e.stringBox, quantidade: qtdInv });

  const temPreco = linhas.every((l) => l.produto.preco != null);
  const total = temPreco ? arred2(linhas.reduce((s, l) => s + (l.produto.preco as number) * l.quantidade, 0)) : null;
  const faltaEstoque = linhas.filter((l) => l.produto.estoque != null && l.produto.estoque < l.quantidade);

  return { linhas, quantidadeModulos, kwpReal, kwInversores, relacaoCcCa, total, faltaEstoque, avisos };
}

export function arred2(v: number): number {
  return Math.round(v * 100) / 100;
}
