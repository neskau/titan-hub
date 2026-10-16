import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServidor } from "@/lib/supabase/server";
import { destinoConfirmacao } from "./destino";

const TIPOS: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/**
 * Destino dos links enviados por e-mail (confirmação de conta, convite da equipe e nova senha).
 * - ?code=                     fluxo PKCE (cadastro e "esqueci a senha" feitos no navegador)
 * - ?token_hash=&type=         modelos de e-mail com {{ .TokenHash }}
 * - #access_token=…            fluxo implícito (convite padrão do Supabase): o fragmento não chega ao
 *                              servidor, então seguimos para /entrar/confirmar/sessao — o navegador
 *                              mantém o fragmento no redirecionamento e a página grava a sessão.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const proximo = url.searchParams.get("proximo");
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const tipoBruto = url.searchParams.get("type");
  const tipo = TIPOS.find((t) => t === tipoBruto) ?? null;

  const destino = url.clone();
  destino.search = "";
  const falhou = () => {
    destino.pathname = "/entrar";
    destino.searchParams.set("erro", "link");
    return NextResponse.redirect(destino);
  };

  if (url.searchParams.get("error") || url.searchParams.get("error_code")) return falhou();

  if (!code && !(tokenHash && tipo)) {
    destino.pathname = "/entrar/confirmar/sessao";
    if (proximo) destino.searchParams.set("proximo", proximo);
    return NextResponse.redirect(destino);
  }

  const sb = supabaseServidor();
  const { error } = code
    ? await sb.auth.exchangeCodeForSession(code)
    : await sb.auth.verifyOtp({ token_hash: tokenHash!, type: tipo! });
  if (error) return falhou();

  destino.pathname = destinoConfirmacao(tipo, proximo);
  return NextResponse.redirect(destino);
}
