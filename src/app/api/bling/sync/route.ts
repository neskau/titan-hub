import { NextResponse, type NextRequest } from "next/server";
import {
  BlingNaoConectadoErro,
  comLog,
  cronAutorizado,
  respostaErro,
  sincronizarEstoque,
  sincronizarProdutos,
} from "@/lib/bling";
import { mensagemSegura } from "@/lib/bling/sincronizar";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // segundos (limite do plano da Vercel prevalece)

/**
 * Sincronização agendada: produtos e depois estoque.
 * Protegida por `Authorization: Bearer <CRON_SECRET>` — o Cron da Vercel envia esse cabeçalho sozinho.
 * Query opcional ?so=produtos ou ?so=estoque.
 */
async function rodar(request: NextRequest) {
  if (!cronAutorizado(request.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 401 });
  }
  const so = request.nextUrl.searchParams.get("so");
  const resultado: Record<string, unknown> = {};
  let ok = true;

  try {
    if (so !== "estoque") {
      try {
        resultado.produtos = await comLog("produtos", sincronizarProdutos);
      } catch (e) {
        if (e instanceof BlingNaoConectadoErro) throw e;
        ok = false;
        resultado.produtos = { ok: false, erro: mensagemSegura(e) };
      }
    }
    if (so !== "produtos") {
      try {
        resultado.estoque = await comLog("estoque", sincronizarEstoque);
      } catch (e) {
        if (e instanceof BlingNaoConectadoErro) throw e;
        ok = false;
        resultado.estoque = { ok: false, erro: mensagemSegura(e) };
      }
    }
  } catch (e) {
    return respostaErro(e);
  }
  return NextResponse.json({ ok, ...resultado }, { status: ok ? 200 : 500 });
}

export const GET = rodar;
export const POST = rodar;
