// Constantes e funções puras da autenticação OAuth do Bling (sem acesso a banco/rede).

export const BLING_API = "https://api.bling.com.br/Api/v3";
export const BLING_AUTHORIZE = "https://www.bling.com.br/Api/v3/oauth/authorize";
export const BLING_TOKEN = `${BLING_API}/oauth/token`;

/** Cookie httpOnly com o state anti-CSRF do OAuth ("<state>.<userId>"). */
export const COOKIE_STATE = "bling_oauth_state";

/** Renova o access token quando faltar menos que isto para expirar. */
export const MARGEM_RENOVACAO_MS = 5 * 60 * 1000;

export class BlingNaoConectadoErro extends Error {
  constructor(detalhe?: string) {
    super(detalhe ? `Bling não conectado: ${detalhe}` : "Bling não conectado");
    this.name = "BlingNaoConectadoErro";
  }
}

export class BlingConfigErro extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "BlingConfigErro";
  }
}

/** Erro devolvido pela API (status ≠ 2xx). Nunca carrega token. */
export class BlingApiErro extends Error {
  constructor(
    public status: number,
    msg: string
  ) {
    super(msg);
    this.name = "BlingApiErro";
  }
}

export function credenciais(env: Record<string, string | undefined> = process.env) {
  const id = env.BLING_CLIENT_ID;
  const secret = env.BLING_CLIENT_SECRET;
  if (!id || !secret) {
    throw new BlingConfigErro("BLING_CLIENT_ID / BLING_CLIENT_SECRET não configurados na Vercel");
  }
  return { id, secret };
}

/** Authorization: Basic base64(client_id:client_secret) */
export function cabecalhoBasic(clientId: string, clientSecret: string): string {
  return "Basic " + Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
}

export function urlAutorizacao(clientId: string, state: string): string {
  const q = new URLSearchParams({ response_type: "code", client_id: clientId, state });
  return `${BLING_AUTHORIZE}?${q.toString()}`;
}

/** Momento em que o access token expira, a partir do expires_in (segundos). */
export function calcularExpiracao(expiresIn: number, agora: Date = new Date()): Date {
  const seg = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600;
  return new Date(agora.getTime() + seg * 1000);
}

export function precisaRenovar(expiraEm: Date | string, agora: Date = new Date(), margemMs = MARGEM_RENOVACAO_MS): boolean {
  const t = typeof expiraEm === "string" ? Date.parse(expiraEm) : expiraEm.getTime();
  if (Number.isNaN(t)) return true;
  return t - agora.getTime() <= margemMs;
}

/** Comparação de strings em tempo constante (state, CRON_SECRET). */
export function iguaisSeguro(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  let dif = ba.length ^ bb.length;
  const n = Math.max(ba.length, bb.length);
  for (let i = 0; i < n; i++) dif |= (ba[i] ?? 0) ^ (bb[i] ?? 0);
  return dif === 0;
}
