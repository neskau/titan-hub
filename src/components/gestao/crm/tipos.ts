import type { Etapa, Origem, TipoAtividade } from "./constantes";

export type Resultado = { ok: true; msg?: string; id?: string } | { ok: false; erro: string };

export interface EmpresaResumo {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  telefone: string | null;
  cidade: string | null;
  uf: string | null;
  cnpj?: string;
  vendedora_id?: string | null;
}

export interface Oportunidade {
  id: string;
  titulo: string;
  empresa_id: string | null;
  contato_nome: string | null;
  contato_telefone: string | null;
  cidade: string | null;
  uf: string | null;
  cnpj: string | null;
  vendedora_id: string | null;
  etapa: Etapa;
  valor_estimado: number | null;
  kwp: number | null;
  origem: Origem;
  motivo_perda: string | null;
  previsao_fechamento: string | null;
  fechado_em: string | null;
  criado_em: string;
  atualizado_em: string;
  empresas: EmpresaResumo | null;
}

export interface Atividade {
  id: string;
  oportunidade_id: string | null;
  empresa_id: string | null;
  tipo: TipoAtividade;
  descricao: string;
  vencimento: string | null;
  responsavel_id: string | null;
  concluida: boolean;
  concluida_em: string | null;
  autor_id: string | null;
  criado_em: string;
}

export interface Membro {
  id: string;
  nome: string;
  papel: string;
  ativo: boolean;
}

/** Card do funil já com os dados calculados no servidor. */
export interface CardFunil {
  id: string;
  titulo: string;
  etapa: Etapa;
  nome: string;
  cidade: string | null;
  valor: number | null;
  kwp: number | null;
  vendedora: string | null;
  telefone: string | null;
  diasSemAtividade: number;
  origem: Origem;
}
