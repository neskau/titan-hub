"use client";
import { useRouter } from "next/navigation";
import { supabaseNavegador } from "@/lib/supabase/client";

export function BotaoSair() {
  const router = useRouter();
  return (
    <button
      className="text-sm text-white/60 hover:text-white"
      onClick={async () => {
        await supabaseNavegador().auth.signOut();
        router.push("/entrar");
        router.refresh();
      }}
    >
      Sair
    </button>
  );
}
