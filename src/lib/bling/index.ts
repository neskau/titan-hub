import "server-only";
import { NextResponse } from "next/server";
import { BlingApiErro, BlingConfigErro, BlingNaoConectadoErro, iguaisSeguro } from "./config";
import { mensagemSegura } from "./sincronizar";

export { sincronizarProdutos, sincronizarEstoque, enviarPedido, comLog } from "./sincronizar";
export { blingConectado } from "./tokens";
export { BlingApiErro, BlingConfigErro, BlingNaoConectadoErro } from "./config";

/** Valida `Authorization: Bearer <CRON_SECRET>` (mesmo formato que o Cron da Vercel envia). */
export function cronAutorizado(cabecalho: string | null, segredo = process.env.CRON_SECRET): boolean {
  if (!segredo || segredo.length < 16) return false; // sem segredo configurado, ninguém entra
  if (!cabecalho?.startsWith("Bearer ")) return false;
  return iguaisSeguro(cabecalho.slice(7), segredo);
}

/** Converte erros da integração em JSON com status adequado (sem vazar tokens). */
export function respostaErro(e: unknown) {
  if (e instanceof BlingNaoConectadoErro) return NextResponse.json({ ok: false, erro: e.message }, { status: 409 });
  if (e instanceof BlingConfigErro) return NextResponse.json({ ok: false, erro: e.message }, { status: 503 });
  if (e instanceof BlingApiErro) {
    return NextResponse.json({ ok: false, erro: mensagemSegura(e) }, { status: e.status === 429 ? 429 : 502 });
  }
  return NextResponse.json({ ok: false, erro: mensagemSegura(e) }, { status: 500 });
}
