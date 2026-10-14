// Tipos compartilhados — espelham supabase/migrations/0001_schema.sql

export type Papel = "integrador" | "vendedora" | "gestor" | "admin";
export type StatusEmpresa = "pendente" | "aprovada" | "recusada" | "bloqueada";
export type StatusPedido = "recebido" | "faturado" | "separacao" | "em_transporte" | "entregue" | "cancelado";
export type FormaPagamento = "pix" | "boleto_faturado" | "cartao";
export type Categoria = "Módulos" | "Inversores" | "Microinversores" | "Estruturas" | "Elétrica" | "Baterias";
export type Fase = "mono" | "tri";
export type TipoTelhado = "ceramica" | "metalica" | "fibrocimento" | "solo" | "laje";

export interface CD {
  id: string;
  nome: string;
  uf: string;
  matriz: boolean;
  prazo_entrega: string;
  fator_preco: number;
  ativo: boolean;
}

export interface Perfil {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  papel: Papel;
  empresa_id: string | null;
  ativo: boolean;
}

export interface Empresa {
  id: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  cidade: string | null;
  uf: string | null;
  telefone: string | null;
  segmento: "Residencial" | "Agro" | "Comercial e industrial" | null;
  status: StatusEmpresa;
  vendedora_id: string | null;
  cd_padrao: string;
  pode_boleto: boolean;
  criado_em: string;
}

/** Linha da view `catalogo` (um produto em um CD). preco/estoque são null para visitantes e cadastros não aprovados. */
export interface ItemCatalogo {
  id: string;
  sku: string;
  nome: string;
  marca: string;
  categoria: Categoria;
  especificacao: string | null;
  potencia_w: number | null;
  potencia_kw: number | null;
  fase: Fase | null;
  modulos_por_estrutura: number | null;
  tipo_telhado: TipoTelhado | null;
  datasheet_path: string | null;
  imagem_path: string | null;
  unidade: string;
  cd_id: string;
  preco: number | null;
  estoque: number | null;
}

export interface Pedido {
  id: string;
  numero: number;
  empresa_id: string;
  cd_id: string;
  status: StatusPedido;
  pagamento: FormaPagamento;
  subtotal: number;
  frete: number;
  total: number;
  rastreio: string | null;
  nota_fiscal: string | null;
  criado_em: string;
}

export const ETAPAS_PEDIDO: { id: StatusPedido; rotulo: string }[] = [
  { id: "recebido", rotulo: "Recebido" },
  { id: "faturado", rotulo: "Faturado" },
  { id: "separacao", rotulo: "Separação" },
  { id: "em_transporte", rotulo: "Em transporte" },
  { id: "entregue", rotulo: "Entregue" },
];
