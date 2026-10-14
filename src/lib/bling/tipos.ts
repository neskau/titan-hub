// Tipos das respostas da API v3 do Bling (somente os campos que o Titan Hub usa).
// Referência: https://developer.bling.com.br/referencia

/** Toda resposta de sucesso da v3 vem embrulhada em { data }. */
export interface BlingResposta<T> {
  data: T;
}

/** Corpo de erro da v3: { error: { type, message, description, fields? } } */
export interface BlingErroCorpo {
  error?: {
    type?: string;
    message?: string;
    description?: string;
    fields?: { code?: number; msg?: string; element?: string; namespace?: string }[];
  };
}

/** POST /oauth/token (authorization_code e refresh_token) */
export interface BlingTokenResposta {
  access_token: string;
  refresh_token: string;
  expires_in: number; // segundos (≈ 21600 = 6 h)
  token_type?: string;
  scope?: string;
}

/** Item de GET /produtos */
export interface BlingProduto {
  id: number;
  idProdutoPai?: number | null;
  nome: string;
  codigo?: string | null; // SKU — no Titan é produtos.sku
  preco?: number | null;
  precoCusto?: number | null;
  tipo?: "P" | "S" | "N" | string; // P = produto, S = serviço
  situacao?: "A" | "I" | string; // A = ativo, I = inativo
  formato?: "S" | "V" | "E" | string; // S = simples, V = com variações, E = composição/kit
  unidade?: string | null;
  descricaoCurta?: string | null;
  marca?: string | null;
  estoque?: { saldoVirtualTotal?: number | null } | null;
}

/** Item de GET /depositos */
export interface BlingDeposito {
  id: number;
  descricao: string;
  situacao?: number | string;
  padrao?: boolean;
  desconsiderarSaldo?: boolean;
}

/** Item de GET /estoques/saldos?idsProdutos[]=... */
export interface BlingSaldo {
  produto: { id: number; codigo?: string | null };
  saldoFisicoTotal?: number | null;
  saldoVirtualTotal?: number | null;
  depositos?: { id: number; saldoFisico?: number | null; saldoVirtual?: number | null }[];
}

/** Item de GET /contatos */
export interface BlingContato {
  id: number;
  nome: string;
  numeroDocumento?: string | null;
  situacao?: string;
}

/** Corpo de POST /contatos */
export interface BlingContatoNovo {
  nome: string;
  fantasia?: string;
  tipo: "J" | "F";
  numeroDocumento: string;
  situacao: "A";
  telefone?: string;
  endereco?: { geral: { municipio?: string; uf?: string; cep?: string } };
}

/** Corpo de POST /pedidos/vendas */
export interface BlingPedidoNovo {
  numeroLoja: string; // usamos "TITAN-<numero>" para evitar pedido duplicado
  data: string; // AAAA-MM-DD
  dataPrevista?: string;
  contato: { id: number };
  itens: {
    codigo: string;
    descricao: string;
    unidade: string;
    quantidade: number;
    valor: number;
    produto: { id: number };
  }[];
  transporte?: { frete: number };
  observacoes?: string;
  observacoesInternas?: string;
}

/** Item de GET /pedidos/vendas */
export interface BlingPedidoResumo {
  id: number;
  numero?: number;
  numeroLoja?: string | null;
}

/** POST que cria recurso devolve { data: { id } } */
export interface BlingCriado {
  id: number;
  alertas?: unknown[];
}
