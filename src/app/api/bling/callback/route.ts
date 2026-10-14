import { NextResponse, type NextRequest } from "next/server";
import { obterSessao } from "@/lib/sessao";
import { COOKIE_STATE, iguaisSeguro } from "@/lib/bling/config";
import { trocarCodigo } from "@/lib/bling/tokens";
import { mensagemSegura } from "@/lib/bling/sincronizar";

export const dynamic = "force-dynamic";

/** Volta da autorização do Bling: confere o state (cookie) e o usuário, troca o code por tokens e salva. */
export async function GET(request: NextRequest) {
  const destino = (status: string, msg?: string) => {
    const url = new URL("/gestao", request.url);
    url.searchParams.set("bling", status);
    if (msg) url.searchParams.set("msg", msg.slice(0, 200));
    const r = NextResponse.redirect(url);
    r.cookies.set(COOKIE_STATE, "", { path: "/api/bling", maxAge: 0 });
    return r;
  };

  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state") ?? "";
  const cookie = request.cookies.get(COOKIE_STATE)?.value ?? "";
  const [stateEsperado, userEsperado] = cookie.split(".");

  if (params.get("error")) return destino("erro", "Autorização negada no Bling");
  if (!stateEsperado || !state || !iguaisSeguro(state, stateEsperado)) {
    return destino("erro", "Link de conexão expirado ou inválido. Clique em Conectar Bling de novo.");
  }

  const sessao = await obterSessao();
  if (!sessao || sessao.userId !== userEsperado || !["gestor", "admin"].includes(sessao.perfil.papel)) {
    return destino("erro", "Apenas o gestor/admin que iniciou a conexão pode concluí-la.");
  }
  if (!code) return destino("erro", "O Bling não enviou o código de autorização.");

  try {
    await trocarCodigo(code, sessao.userId);
  } catch (e) {
    return destino("erro", mensagemSegura(e));
  }
  return destino("conectado");
}
