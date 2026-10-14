"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseNavegador } from "@/lib/supabase/client";

function traduzir(msg: string): string {
  if (/already registered|already exists/i.test(msg)) return "Este e-mail já tem cadastro. Use “Entrar” ou recupere a senha.";
  if (/password/i.test(msg) && /characters|weak|short/i.test(msg)) return "Senha fraca: use pelo menos 8 caracteres, com letras e números.";
  if (/invalid.*email|email.*invalid/i.test(msg)) return "E-mail inválido.";
  if (/rate limit|too many/i.test(msg)) return "Muitas tentativas seguidas. Aguarde alguns minutos.";
  return "Não foi possível criar a conta agora. Tente novamente.";
}

export function FormConta() {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [confirmarEmail, setConfirmarEmail] = useState<string | null>(null);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (nome.trim().length < 3) return setErro("Informe seu nome completo.");
    if (senha.length < 8) return setErro("A senha precisa ter pelo menos 8 caracteres.");
    setEnviando(true);
    const { data, error } = await supabaseNavegador().auth.signUp({
      email: email.trim(),
      password: senha,
      options: {
        data: { nome: nome.trim() },
        emailRedirectTo: `${window.location.origin}/entrar/confirmar?proximo=${encodeURIComponent("/cadastro/empresa")}`,
      },
    });
    if (error) {
      setEnviando(false);
      return setErro(traduzir(error.message));
    }
    // Com confirmação de e-mail ligada, o Supabase não devolve sessão.
    if (!data.session) {
      setEnviando(false);
      setConfirmarEmail(email.trim());
      return;
    }
    router.replace("/cadastro/empresa");
    router.refresh();
  }

  if (confirmarEmail) {
    return (
      <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
        <p className="font-semibold">Confirme seu e-mail</p>
        <p className="text-sm">
          Enviamos um link para <strong>{confirmarEmail}</strong>. Abra o link para continuar o cadastro com os dados da empresa.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={criar} className="flex flex-col gap-4">
      <div>
        <label className="rotulo" htmlFor="nome">
          Seu nome
        </label>
        <input id="nome" autoComplete="name" required className="campo" value={nome} onChange={(e) => setNome(e.target.value)} />
      </div>
      <div>
        <label className="rotulo" htmlFor="email">
          E-mail
        </label>
        <input id="email" type="email" autoComplete="email" required className="campo" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="rotulo" htmlFor="senha">
          Senha (mínimo 8 caracteres)
        </label>
        <input id="senha" type="password" autoComplete="new-password" minLength={8} required className="campo" value={senha} onChange={(e) => setSenha(e.target.value)} />
      </div>
      {erro && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {erro}
        </p>
      )}
      <button className="btn-primario" disabled={enviando}>
        {enviando ? "Criando conta…" : "Criar conta e continuar"}
      </button>
    </form>
  );
}
