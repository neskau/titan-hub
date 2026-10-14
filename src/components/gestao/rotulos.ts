import type { Papel, StatusEmpresa, StatusPedido } from "@/lib/tipos";

// Rótulos e regras compartilhadas da área de gestão (podem ser usados no servidor e no navegador).

export { CATEGORIAS, TELHADOS, PAGAMENTOS, STATUS_PEDIDO } from "@/components/portal/categorias";

export const SEGMENTOS = ["Residencial", "Agro", "Comercial e industrial"] as const;

export const STATUS_EMPRESA: Record<StatusEmpresa, { rotulo: string; chip: string }> = {
  pendente: { rotulo: "Pendente", chip: "chip-alerta" },
  aprovada: { rotulo: "Aprovada", chip: "chip-ok" },
  recusada: { rotulo: "Recusada", chip: "chip-erro" },
  bloqueada: { rotulo: "Bloqueada", chip: "chip-erro" },
};

export const PAPEIS: Record<Papel, string> = {
  integrador: "Integrador",
  vendedora: "Vendedora",
  gestor: "Gestor",
  admin: "Administrador",
};

/** Fluxo do pedido: cada status avança para o próximo. */
export const PROXIMO_STATUS: Partial<Record<StatusPedido, StatusPedido>> = {
  recebido: "faturado",
  faturado: "separacao",
  separacao: "em_transporte",
  em_transporte: "entregue",
};

/** Texto do botão que leva o pedido ao próximo status. */
export const ACAO_AVANCAR: Partial<Record<StatusPedido, string>> = {
  recebido: "Marcar como faturado",
  faturado: "Iniciar separação",
  separacao: "Despachar (em transporte)",
  em_transporte: "Confirmar entrega",
};

export const TODOS_STATUS_PEDIDO: StatusPedido[] = ["recebido", "faturado", "separacao", "em_transporte", "entregue", "cancelado"];
export const TODOS_STATUS_EMPRESA: StatusEmpresa[] = ["pendente", "aprovada", "recusada", "bloqueada"];

/** Situação do estoque de um produto num CD. */
export function situacaoEstoque(quantidade: number, minimo: number): { rotulo: string; chip: string; alerta: boolean } {
  if (quantidade <= 0) return { rotulo: "Zerado", chip: "chip-erro", alerta: true };
  if (quantidade < minimo) return { rotulo: "Abaixo do mínimo", chip: "chip-alerta", alerta: true };
  return { rotulo: "OK", chip: "chip-ok", alerta: false };
}

const fuso = { timeZone: "America/Sao_Paulo" } as const;
export const data = (s: string) => new Date(s).toLocaleDateString("pt-BR", fuso);
export const dataHora = (s: string) => new Date(s).toLocaleString("pt-BR", { ...fuso, dateStyle: "short", timeStyle: "short" });

export const nomeEmpresa = (e: { razao_social: string; nome_fantasia: string | null } | null | undefined) =>
  e ? e.nome_fantasia || e.razao_social : "—";
