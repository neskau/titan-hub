"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseNavegador } from "@/lib/supabase/client";
import type { Papel } from "@/lib/tipos";
import { destinoPosLogin } from "@/components/portal/destino";

function traduzir(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return "E-mail ou senha incorretos.";
  if (/email not confirmed/i.test(msg)) return "Confirme seu e-mail pelo link que enviamos antes de entrar.";
  if (/rate limit|too many/i.test(msg)) return "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.";
  return "Não foi possível entrar agora. Tente novamente.";
}

export function FormEntrar({ voltar }: { voltar: string | null }) {
  const router = useRouter();
  const [modo, setModo] = useState<"entrar" | "esqueci">("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const sb = supabaseNavegador();
    const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password: senha });
    if (error || !data.user) {
      setErro(traduzir(error?.message ?? ""));
      setEnviando(false);
      return;
    }
    const { data: perfil } = await sb.from("perfis").select("papel").eq("id", data.user.id).maybeSingle<{ papel: Papel }>();
    router.replace(destinoPosLogin(perfil?.papel, voltar));
    router.refresh();
  }

  async function esqueci(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setAviso(null);
    setEnviando(true);
    const destino = `${window.location.origin}/entrar/confirmar?proximo=${encodeURIComponent("/entrar/nova-senha")}`;
    const { error } = await supabaseNavegador().auth.resetPasswordForEmail(email.trim(), { redirectTo: destino });
    setEnviando(false);
    if (error && /rate limit|too many/i.test(error.message)) {
      setErro("Você já pediu um link há pouco. Aguarde alguns minutos para pedir outro.");
      return;
    }
    // Mesma resposta exista ou não a conta, para não revelar e-mails cadastrados.
    setAviso("Se houver uma conta com este e-mail, você vai receber um link para criar uma nova senha. Confira também a caixa de spam.");
  }

  return (
    <form onSubmit={modo === "entrar" ? entrar : esqueci} className="flex flex-col gap-4">
      <div>
        <label className="rotulo" htmlFor="email">
          E-mail
        </label>
        <input id="email" type="email" autoComplete="email" required className="campo" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      {modo === "entrar" && (
        <div>
          <div className="flex items-baseline justify-between">
            <label className="rotulo" htmlFor="senha">
              Senha
            </label>
            <button
              type="button"
              className="text-xs font-semibold text-titan hover:underline"
              onClick={() => {
                setModo("esqueci");
                setErro(null);
              }}
            >
              Esqueci a senha
            </button>
          </div>
          <input id="senha" type="password" autoComplete="current-password" required className="campo" value={senha} onChange={(e) => setSenha(e.target.value)} />
        </div>
      )}
      {erro && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {erro}
        </p>
      )}
      {aviso && (
        <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {aviso}
        </p>
      )}
      <button className="btn-primario" disabled={enviando}>
        {enviando ? "Aguarde…" : modo === "entrar" ? "Entrar" : "Enviar link para nova senha"}
      </button>
      {modo === "esqueci" ? (
        <button
          type="button"
          className="text-sm text-suave hover:text-titan"
          onClick={() => {
            setModo("entrar");
            setAviso(null);
            setErro(null);
          }}
        >
          Voltar para o login
        </button>
      ) : (
        <p className="text-center text-sm text-suave">
          Ainda não é cliente?{" "}
          <Link href="/cadastro" className="font-semibold text-titan hover:underline">
            Cadastre sua empresa
          </Link>
        </p>
      )}
    </form>
  );
}
