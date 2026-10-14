import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { obterSessao } from "@/lib/sessao";
import { BlingConfigErro, COOKIE_STATE, credenciais, urlAutorizacao } from "@/lib/bling/config";

export const dynamic = "force-dynamic";

/** Só gestor/admin logado: gera state anti-CSRF (cookie httpOnly, 10 min) e redireciona para a autorização do Bling. */
export async function GET(request: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) {
    const url = new URL("/entrar", request.url);
    url.searchParams.set("voltar", "/api/bling/conectar");
    return NextResponse.redirect(url);
  }
  if (!["gestor", "admin"].includes(sessao.perfil.papel)) {
    return NextResponse.json({ ok: false, erro: "Apenas gestor ou admin pode conectar o Bling" }, { status: 403 });
  }

  let clientId: string;
  try {
    clientId = credenciais().id;
  } catch (e) {
    const msg = e instanceof BlingConfigErro ? e.message : "Configuração do Bling ausente";
    return NextResponse.json({ ok: false, erro: msg }, { status: 503 });
  }

  const state = randomBytes(24).toString("hex");
  const resp = NextResponse.redirect(urlAutorizacao(clientId, state));
  resp.cookies.set(COOKIE_STATE, `${state}.${sessao.userId}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // precisa voltar no redirecionamento do Bling (navegação GET)
    path: "/api/bling",
    maxAge: 600,
  });
  return resp;
}
