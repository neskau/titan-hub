import "server-only";
import { BLING_API, BlingApiErro } from "./config";
import { comRetentativa, criarCadencia } from "./retry";
import { tokenValido } from "./tokens";
import type { BlingErroCorpo, BlingResposta } from "./tipos";

// Cliente HTTP da API v3: Bearer token com renovação automática, cadência ~3 req/s e nova tentativa em 429.

type Consulta = Record<string, string | number | boolean | (string | number)[] | undefined | null>;

const cadencia = criarCadencia(350);

export function montarUrl(caminho: string, consulta?: Consulta): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(consulta ?? {})) {
    if (v === undefined || v === null) continue;
    // Arrays no padrão do Bling: idsProdutos[]=1&idsProdutos[]=2
    if (Array.isArray(v)) v.forEach((x) => q.append(k.endsWith("[]") ? k : `${k}[]`, String(x)));
    else q.append(k, String(v));
  }
  const s = q.toString();
  return `${BLING_API}${caminho.startsWith("/") ? caminho : `/${caminho}`}${s ? `?${s}` : ""}`;
}

function mensagemErro(status: number, corpo: BlingErroCorpo | null): string {
  const e = corpo?.error;
  const campos = (e?.fields ?? []).map((f) => f.msg).filter(Boolean).join("; ");
  const base = e?.description || e?.message || `HTTP ${status}`;
  return `Bling: ${base}${campos ? ` (${campos})` : ""}`;
}

export async function blingFetch<T>(
  metodo: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  caminho: string,
  op: { consulta?: Consulta; corpo?: unknown } = {}
): Promise<T> {
  const url = montarUrl(caminho, op.consulta);
  const chamar = async (token: string) =>
    comRetentativa(
      async () => {
        await cadencia();
        return fetch(url, {
          method: metodo,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            "enable-jwt": "1",
            ...(op.corpo !== undefined ? { "Content-Type": "application/json" } : {}),
          },
          body: op.corpo !== undefined ? JSON.stringify(op.corpo) : undefined,
          cache: "no-store",
        });
      },
      // GET pode repetir também em erro 5xx/rede; POST só em 429 (não processado) para não duplicar.
      { repetirFalhaServidor: metodo === "GET" }
    );

  let resp = await chamar(await tokenValido());
  if (resp.status === 401) {
    // Token recusado antes da hora: força renovação e tenta uma vez.
    resp = await chamar(await tokenValido(true));
  }
  if (resp.status === 204) return undefined as T;
  const texto = await resp.text();
  let json: unknown = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    json = null;
  }
  if (!resp.ok) throw new BlingApiErro(resp.status, mensagemErro(resp.status, json as BlingErroCorpo | null));
  return json as T;
}

/** GET paginado (pagina/limite até 100). Para quando a página vier com menos que o limite. */
export async function blingListarTudo<T>(caminho: string, consulta: Consulta = {}, maxPaginas = 200): Promise<T[]> {
  const limite = 100;
  const tudo: T[] = [];
  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    const r = await blingFetch<BlingResposta<T[]>>("GET", caminho, { consulta: { ...consulta, pagina, limite } });
    const itens = r?.data ?? [];
    tudo.push(...itens);
    if (itens.length < limite) break;
  }
  return tudo;
}
