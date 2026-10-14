"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { supabaseNavegador } from "@/lib/supabase/client";
import { definirDatasheet } from "@/app/gestao/produtos/acoes";
import { Aviso } from "./Aviso";

const LIMITE_MB = 20;

/** Nome de arquivo seguro: sem acento, espaços viram hífen, sempre .pdf. */
function nomeSeguro(nome: string) {
  const base = nome
    .replace(/\.pdf$/i, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);
  return `${base || "datasheet"}.pdf`;
}

/**
 * Envia o PDF direto do navegador para o bucket 'datasheets' (a política do Storage exige equipe)
 * e depois grava o caminho no produto por Server Action.
 */
export function EnvioDatasheet({ produtoId, atual, urlAtual }: { produtoId: string; atual: string | null; urlAtual: string | null }) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [pendente, iniciar] = useTransition();
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const ocupado = pendente || enviando;

  async function enviar(arquivo: File) {
    setMsg(null);
    if (arquivo.type !== "application/pdf" && !/\.pdf$/i.test(arquivo.name)) return setMsg({ tipo: "erro", texto: "Envie um arquivo PDF." });
    if (arquivo.size > LIMITE_MB * 1024 * 1024) return setMsg({ tipo: "erro", texto: `O PDF passa de ${LIMITE_MB} MB.` });
    const caminho = `produtos/${produtoId}/${nomeSeguro(arquivo.name)}`;
    setEnviando(true);
    const { error } = await supabaseNavegador()
      .storage.from("datasheets")
      .upload(caminho, arquivo, { upsert: true, contentType: "application/pdf", cacheControl: "3600" });
    setEnviando(false);
    if (error) return setMsg({ tipo: "erro", texto: "Não foi possível enviar o PDF. Confira sua conexão e tente de novo." });
    iniciar(async () => {
      const r = await definirDatasheet({ id: produtoId, path: caminho });
      if (r.ok) {
        setMsg({ tipo: "ok", texto: r.msg ?? "Datasheet enviado." });
        router.refresh();
      } else setMsg({ tipo: "erro", texto: r.erro });
    });
  }

  return (
    <section className="cartao flex flex-col gap-3 p-4" aria-label="Datasheet">
      <h2 className="font-semibold">Datasheet (PDF)</h2>
      {atual ? (
        <p className="text-sm [overflow-wrap:anywhere]">
          {urlAtual ? (
            <a href={urlAtual} target="_blank" rel="noreferrer" className="font-semibold text-titan hover:underline">
              {atual.split("/").pop()}
            </a>
          ) : (
            atual.split("/").pop()
          )}
        </p>
      ) : (
        <p className="text-sm text-suave">Nenhum datasheet enviado.</p>
      )}
      {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}
      <input
        ref={entrada}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        aria-label="Escolher PDF do datasheet"
        onChange={(e) => {
          const arq = e.target.files?.[0];
          e.target.value = "";
          if (arq) void enviar(arq);
        }}
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primario" disabled={ocupado} onClick={() => entrada.current?.click()}>
          {enviando ? "Enviando…" : atual ? "Substituir PDF" : "Enviar PDF"}
        </button>
        {atual && (
          <button
            type="button"
            className="btn"
            disabled={ocupado}
            onClick={() => {
              if (!window.confirm("Desvincular o datasheet deste produto?")) return;
              setMsg(null);
              iniciar(async () => {
                const r = await definirDatasheet({ id: produtoId, path: "" });
                if (r.ok) {
                  setMsg({ tipo: "ok", texto: r.msg ?? "Removido." });
                  router.refresh();
                } else setMsg({ tipo: "erro", texto: r.erro });
              });
            }}
          >
            Remover
          </button>
        )}
      </div>
      <p className="text-xs text-suave">PDF de até {LIMITE_MB} MB. O arquivo fica público para os integradores baixarem no catálogo.</p>
    </section>
  );
}
