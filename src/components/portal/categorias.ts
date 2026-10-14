import type { Categoria, FormaPagamento, StatusPedido, TipoTelhado } from "@/lib/tipos";

export const CATEGORIAS: Categoria[] = ["Módulos", "Inversores", "Microinversores", "Estruturas", "Elétrica", "Baterias"];

export const TELHADOS: { id: TipoTelhado; rotulo: string }[] = [
  { id: "ceramica", rotulo: "Telha cerâmica" },
  { id: "metalica", rotulo: "Telha metálica" },
  { id: "fibrocimento", rotulo: "Fibrocimento" },
  { id: "laje", rotulo: "Laje" },
  { id: "solo", rotulo: "Solo" },
];

export const PAGAMENTOS: Record<FormaPagamento, string> = {
  pix: "Pix",
  cartao: "Cartão de crédito",
  boleto_faturado: "Boleto faturado",
};

export const STATUS_PEDIDO: Record<StatusPedido, { rotulo: string; chip: string }> = {
  recebido: { rotulo: "Recebido", chip: "chip-info" },
  faturado: { rotulo: "Faturado", chip: "chip-info" },
  separacao: { rotulo: "Em separação", chip: "chip-alerta" },
  em_transporte: { rotulo: "Em transporte", chip: "chip-alerta" },
  entregue: { rotulo: "Entregue", chip: "chip-ok" },
  cancelado: { rotulo: "Cancelado", chip: "chip-erro" },
};

/** Limite abaixo do qual o estoque aparece como "últimas unidades". */
export const POUCO_ESTOQUE = 10;
