"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Aviso } from "@/components/gestao/Aviso";
import { adicionarUsuarioEmpresa } from "./acoes";

/**
 * Botão "Adicionar usuário" + formulário (nome e e-mail) para dar acesso ao portal a mais uma pessoa
 * de uma empresa da carteira. O usuário recebe convite por e-mail para criar a senha.
 * Uso: <AdicionarUsuario empresaId={e.id} cnpj={e.cnpj} />
 */
export function AdicionarUsuario({ empresaId, cnpj }: { empresaId: string; cnpj: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [f, setF] = useState({ nome: "", email: "" });
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [enviando, iniciar] = useTransition();

  if (!aberto) {
    return (
      <div className="flex flex-col gap-2">
        {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}
        <button
          type="button"
          className="btn w-fit"
          onClick={() => {
            setAberto(true);
            setMsg(null);
          }}
        >
          Adicionar usuário
        </button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-md border border-linha bg-fundo p-3"
      aria-label="Adicionar usuário de acesso"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        iniciar(async () => {
          const r = await adicionarUsuarioEmpresa({ empresaId, cnpj, ...f });
          if (r.ok) {
            setMsg({ tipo: "ok", texto: r.msg });
            setF({ nome: "", email: "" });
            setAberto(false);
            router.refresh();
          } else setMsg({ tipo: "erro", texto: r.erro });
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="rotulo" htmlFor={`nu-nome-${empresaId}`}>
            Nome
          </label>
          <input
            id={`nu-nome-${empresaId}`}
            required
            maxLength={120}
            autoComplete="off"
            className="campo"
            value={f.nome}
            onChange={(e) => setF((v) => ({ ...v, nome: e.target.value }))}
          />
        </div>
        <div>
          <label className="rotulo" htmlFor={`nu-email-${empresaId}`}>
            E-mail
          </label>
          <input
            id={`nu-email-${empresaId}`}
            type="email"
            required
            maxLength={254}
            autoComplete="off"
            className="campo"
            value={f.email}
            onChange={(e) => setF((v) => ({ ...v, email: e.target.value }))}
          />
        </div>
      </div>
      {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primario" disabled={enviando}>
          {enviando ? "Enviando…" : "Enviar convite"}
        </button>
        <button type="button" className="btn" disabled={enviando} onClick={() => setAberto(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
