import "server-only";
import { supabaseAdmin } from "../supabase/admin";
import {
  BLING_TOKEN,
  BlingApiErro,
  BlingNaoConectadoErro,
  cabecalhoBasic,
  calcularExpiracao,
  credenciais,
  precisaRenovar,
} from "./config";
import { comRetentativa } from "./retry";
import type { BlingTokenResposta } from "./tipos";

// Guarda e renova os tokens OAuth do Bling na tabela integracao_bling (linha única, só service role).
// NUNCA registre access_token/refresh_token em log ou em mensagens de erro.

interface LinhaTokens {
  access_token: string;
  refresh_token: string;
  expira_em: string;
  atualizado_em: string;
}

async function lerTokens(): Promise<LinhaTokens | null> {
  const { data, error } = await supabaseAdmin()
    .from("integracao_bling")
    .select("access_token, refresh_token, expira_em, atualizado_em")
    .eq("id", 1)
    .maybeSingle<LinhaTokens>();
  if (error) throw new Error(`Falha ao ler a conexão com o Bling: ${error.message}`);
  return data ?? null;
}

async function salvarTokens(t: BlingTokenResposta, conectadoPor?: string) {
  const linha: Record<string, unknown> = {
    id: 1,
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expira_em: calcularExpiracao(t.expires_in).toISOString(),
    atualizado_em: new Date().toISOString(),
  };
  if (conectadoPor) linha.conectado_por = conectadoPor;
  const { error } = await supabaseAdmin().from("integracao_bling").upsert(linha, { onConflict: "id" });
  if (error) throw new Error(`Falha ao salvar a conexão com o Bling: ${error.message}`);
}

/** POST /oauth/token com Basic auth. `corpo` é form-urlencoded. */
async function pedirToken(corpo: Record<string, string>): Promise<BlingTokenResposta> {
  const { id, secret } = credenciais();
  const resp = await comRetentativa(() =>
    fetch(BLING_TOKEN, {
      method: "POST",
      headers: {
        Authorization: cabecalhoBasic(id, secret),
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        // Pede token JWT (formato novo do Bling) — https://developer.bling.com.br/migracao-jwt
        "enable-jwt": "1",
      },
      body: new URLSearchParams(corpo).toString(),
      cache: "no-store",
    })
  );
  const json = (await resp.json().catch(() => ({}))) as Partial<BlingTokenResposta> & {
    error?: string | { description?: string; message?: string };
    error_description?: string;
  };
  if (!resp.ok || !json.access_token || !json.refresh_token) {
    const e = json.error;
    const motivo =
      json.error_description ?? (typeof e === "string" ? e : e?.description ?? e?.message) ?? `HTTP ${resp.status}`;
    throw new BlingApiErro(resp.status, `Bling recusou o token: ${motivo}`);
  }
  return json as BlingTokenResposta;
}

/** Troca o `code` do callback por tokens e salva. O code vale só 1 minuto. */
export async function trocarCodigo(code: string, conectadoPor?: string) {
  const t = await pedirToken({ grant_type: "authorization_code", code });
  await salvarTokens(t, conectadoPor);
}

// Evita duas renovações simultâneas na mesma instância (o refresh token é trocado a cada renovação).
let renovando: Promise<string> | null = null;

async function renovar(atual: LinhaTokens): Promise<string> {
  try {
    const t = await pedirToken({ grant_type: "refresh_token", refresh_token: atual.refresh_token });
    await salvarTokens(t);
    return t.access_token;
  } catch (e) {
    // Outra instância (ex.: cron x envio de pedido) pode ter renovado antes: relê o banco.
    const recente = await lerTokens();
    if (recente && recente.refresh_token !== atual.refresh_token && !precisaRenovar(recente.expira_em)) {
      return recente.access_token;
    }
    if (e instanceof BlingApiErro && (e.status === 400 || e.status === 401)) {
      throw new BlingNaoConectadoErro("a autorização expirou ou foi revogada. Um gestor precisa clicar em “Conectar Bling” de novo");
    }
    throw e;
  }
}

/** Access token válido (renova se estiver perto de expirar). Lança BlingNaoConectadoErro se não houver conexão. */
export async function tokenValido(forcarRenovacao = false): Promise<string> {
  const atual = await lerTokens();
  if (!atual) throw new BlingNaoConectadoErro();
  if (!forcarRenovacao && !precisaRenovar(atual.expira_em)) return atual.access_token;
  if (!renovando) {
    renovando = renovar(atual).finally(() => {
      renovando = null;
    });
  }
  return renovando;
}

export async function blingConectado(): Promise<boolean> {
  return (await lerTokens()) !== null;
}
