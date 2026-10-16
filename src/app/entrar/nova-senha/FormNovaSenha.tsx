"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseNavegador } from "@/lib/supabase/client";

/** aposSalvar: destino mantendo a sessão (integrador convidado); sem ele, sai e volta ao login. */
export function FormNovaSenha({ aposSalvar = null }: { aposSalvar?: string | null }) {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [repetir, setRepetir] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (senha.length < 8) return setErro("A senha precisa ter pelo menos 8 caracteres.");
    if (senha !== repetir) return setErro("As senhas não conferem.");
    setEnviando(true);
    const sb = supabaseNavegador();
    const { error } = await sb.auth.updateUser({ password: senha });
    if (error) {
      setEnviando(false);
      setErro(/different from the old/i.test(error.message) ? "A nova senha precisa ser diferente da anterior." : "Não foi possível salvar a senha. Peça um novo link e tente de novo.");
      return;
    }
    if (aposSalvar) {
      router.replace(aposSalvar);
      router.refresh();
      return;
    }
    await sb.auth.signOut();
    router.replace("/entrar?senha=ok");
    router.refresh();
  }

  return (
    <form onSubmit={salvar} className="flex flex-col gap-4">
      <div>
        <label className="rotulo" htmlFor="senha">
          Nova senha
        </label>
        <input id="senha" type="password" autoComplete="new-password" minLength={8} required className="campo" value={senha} onChange={(e) => setSenha(e.target.value)} />
      </div>
      <div>
        <label className="rotulo" htmlFor="repetir">
          Repita a nova senha
        </label>
        <input id="repetir" type="password" autoComplete="new-password" minLength={8} required className="campo" value={repetir} onChange={(e) => setRepetir(e.target.value)} />
      </div>
      {erro && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {erro}
        </p>
      )}
      <button className="btn-primario" disabled={enviando}>
        {enviando ? "Salvando…" : "Salvar nova senha"}
      </button>
    </form>
  );
}
