"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseNavegador } from "@/lib/supabase/client";
import { destinoConfirmacao } from "../destino";

/**
 * Lê os tokens do fragmento (#access_token=…&refresh_token=…&type=invite), grava a sessão nos cookies
 * e segue para o destino. Usado pelos links de convite do Supabase (fluxo implícito).
 */
export function GravarSessao({ proximo }: { proximo: string | null }) {
  const router = useRouter();
  const [falhou, setFalhou] = useState(false);
  const feito = useRef(false);

  useEffect(() => {
    if (feito.current) return;
    feito.current = true;
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    // Tira os tokens da barra de endereço e do histórico.
    window.history.replaceState(null, "", window.location.pathname + window.location.search);

    const acesso = hash.get("access_token");
    const renovacao = hash.get("refresh_token");
    if (hash.get("error") || hash.get("error_code") || !acesso || !renovacao) {
      setFalhou(true);
      router.replace("/entrar?erro=link");
      return;
    }
    void (async () => {
      const { error } = await supabaseNavegador().auth.setSession({ access_token: acesso, refresh_token: renovacao });
      if (error) {
        setFalhou(true);
        router.replace("/entrar?erro=link");
        return;
      }
      router.replace(destinoConfirmacao(hash.get("type"), proximo));
      router.refresh();
    })();
  }, [proximo, router]);

  return (
    <p role="status" className="text-sm text-suave">
      {falhou ? "O link expirou ou já foi usado. Redirecionando para o login…" : "Aguarde um instante, estamos preparando seu acesso."}
    </p>
  );
}
