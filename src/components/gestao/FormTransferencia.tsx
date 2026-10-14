"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { transferirEstoque } from "@/app/gestao/estoque/acoes";
import { Aviso } from "./Aviso";

/** Transferência de saldo entre CDs (chama a função transferir_estoque). */
export function FormTransferencia({
  produtos,
  cds,
  saldos,
}: {
  produtos: { id: string; nome: string; sku: string }[];
  cds: { id: string; nome: string }[];
  saldos: Record<string, number>; // chave `${produto}|${cd}`
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [f, setF] = useState({ produto_id: "", de: cds[0]?.id ?? "", para: cds[1]?.id ?? "", quantidade: "" });
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const saldoOrigem = f.produto_id && f.de ? (saldos[`${f.produto_id}|${f.de}`] ?? 0) : null;

  if (cds.length < 2) return <p className="text-sm text-suave">É preciso ter pelo menos dois CDs ativos para transferir.</p>;

  return (
    <form
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_110px_auto] lg:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        iniciar(async () => {
          const r = await transferirEstoque(f);
          if (r.ok) {
            setMsg({ tipo: "ok", texto: r.msg ?? "Transferência feita." });
            setF((v) => ({ ...v, quantidade: "" }));
            router.refresh();
          } else setMsg({ tipo: "erro", texto: r.erro });
        });
      }}
    >
      <div className="sm:col-span-2 lg:col-span-1">
        <label className="rotulo" htmlFor="t-produto">
          Produto
        </label>
        <select id="t-produto" required className="campo" value={f.produto_id} onChange={(e) => setF((v) => ({ ...v, produto_id: e.target.value }))}>
          <option value="" disabled>
            Escolha…
          </option>
          {produtos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome} ({p.sku})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="rotulo" htmlFor="t-de">
          De
        </label>
        <select id="t-de" className="campo" value={f.de} onChange={(e) => setF((v) => ({ ...v, de: e.target.value }))}>
          {cds.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="rotulo" htmlFor="t-para">
          Para
        </label>
        <select id="t-para" className="campo" value={f.para} onChange={(e) => setF((v) => ({ ...v, para: e.target.value }))}>
          {cds.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="rotulo" htmlFor="t-qtd">
          Quantidade
        </label>
        <input
          id="t-qtd"
          required
          inputMode="numeric"
          className="campo"
          value={f.quantidade}
          onChange={(e) => setF((v) => ({ ...v, quantidade: e.target.value.replace(/\D/g, "").slice(0, 8) }))}
        />
      </div>
      <button className="btn-primario" disabled={pendente}>
        Transferir
      </button>
      {saldoOrigem != null && (
        <p className="text-xs text-suave sm:col-span-2 lg:col-span-5">Saldo na origem: {saldoOrigem.toLocaleString("pt-BR")} un.</p>
      )}
      {msg && (
        <div className="sm:col-span-2 lg:col-span-5">
          <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>
        </div>
      )}
    </form>
  );
}
