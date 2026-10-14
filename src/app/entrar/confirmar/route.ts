import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServidor } from "@/lib/supabase/server";
import { caminhoSeguro } from "@/components/portal/destino";

/**
 * Destino dos links enviados por e-mail (confirmação de conta e nova senha).
 * Aceita o fluxo PKCE (?code=) e o de token (?token_hash=&type=).
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const proximo = caminhoSeguro(url.searchParams.get("proximo")) ?? "/cadastro/empresa";
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const tipo = url.searchParams.get("type") as EmailOtpType | null;
  const sb = supabaseServidor();

  let ok = false;
  if (code) {
    ok = !(await sb.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && tipo) {
    ok = !(await sb.auth.verifyOtp({ token_hash: tokenHash, type: tipo })).error;
  }

  const destino = url.clone();
  destino.search = "";
  if (ok) {
    destino.pathname = tipo === "recovery" ? "/entrar/nova-senha" : proximo;
  } else {
    destino.pathname = "/entrar";
    destino.searchParams.set("erro", "link");
  }
  return NextResponse.redirect(destino);
}
