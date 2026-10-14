// Controle de limite de requisições do Bling: 3 req/s e 120.000/dia por conta.
// Excedeu → HTTP 429 (a requisição NÃO é processada, então é seguro repetir).
// https://developer.bling.com.br/limites

export interface OpcoesRetentativa {
  maxTentativas?: number; // total de tentativas (padrão 5)
  baseMs?: number; // espera inicial (padrão 1000 ms)
  tetoMs?: number; // espera máxima (padrão 30 s)
  /** Repetir também em 5xx/erro de rede? Só para GET (POST poderia duplicar). */
  repetirFalhaServidor?: boolean;
  esperar?: (ms: number) => Promise<void>;
}

export const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Espera antes da próxima tentativa: respeita Retry-After (segundos) ou faz backoff exponencial. */
export function tempoDeEspera(tentativa: number, retryAfter: string | null, baseMs = 1000, tetoMs = 30000): number {
  if (retryAfter) {
    const s = Number(retryAfter);
    if (Number.isFinite(s) && s >= 0) return Math.min(s * 1000, tetoMs);
  }
  return Math.min(baseMs * 2 ** (tentativa - 1), tetoMs);
}

/**
 * Executa `fazer` e repete em 429 (e opcionalmente 5xx/erro de rede) com espera crescente.
 * Devolve a última resposta (o chamador decide o que fazer com status ≠ 2xx).
 */
export async function comRetentativa(fazer: () => Promise<Response>, op: OpcoesRetentativa = {}): Promise<Response> {
  const max = op.maxTentativas ?? 5;
  const esperar = op.esperar ?? dormir;
  let ultimoErro: unknown;
  for (let t = 1; t <= max; t++) {
    let resp: Response;
    try {
      resp = await fazer();
    } catch (e) {
      ultimoErro = e;
      if (op.repetirFalhaServidor && t < max) {
        await esperar(tempoDeEspera(t, null, op.baseMs, op.tetoMs));
        continue;
      }
      throw e;
    }
    const repetir = resp.status === 429 || (op.repetirFalhaServidor === true && resp.status >= 500);
    if (!repetir || t === max) return resp;
    await esperar(tempoDeEspera(t, resp.headers.get("retry-after"), op.baseMs, op.tetoMs));
  }
  throw ultimoErro ?? new Error("Falha ao chamar o Bling");
}

/** Garante intervalo mínimo entre chamadas (≈3 por segundo) dentro da mesma instância. */
export function criarCadencia(intervaloMs = 350, esperar: (ms: number) => Promise<void> = dormir, agora = () => Date.now()) {
  let proxima = 0;
  return async () => {
    const t = agora();
    const espera = proxima - t;
    proxima = Math.max(t, proxima) + intervaloMs;
    if (espera > 0) await esperar(espera);
  };
}
