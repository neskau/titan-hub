"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { distribuirLead } from "@/app/gestao/funil/acoes";
import { Aviso } from "@/components/gestao/Aviso";
import { brl } from "@/lib/formato";

export interface LeadSemDona {
  id: string;
  titulo: string;
  nome: string;
  cidade: string | null;
  origem: string;
  valor: number | null;
  recebido: string; // texto já formatado
}

/** Faixa do gestor com os leads sem vendedora: escolher a vendedora e distribuir. */
export function Distribuicao({ leads, equipe }: { leads: LeadSemDona[]; equipe: { id: string; nome: string; papel: string }[] }) {
  const router = useRouter();
  const [escolha, setEscolha] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [emAndamento, setEmAndamento] = useState<string | null>(null);
  const [, iniciar] = useTransition();

  if (leads.length === 0) return null;
  return (
    <section className="cartao flex flex-col gap-3 border-amber-200 bg-amber-50/40 p-4" aria-labelledby="aguardando">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="aguardando" className="font-semibold">
          Aguardando distribuição
        </h2>
        <span className="chip-alerta">{leads.length}</span>
        <p className="w-full text-sm text-suave">Cadastros novos vindos do site e leads sem vendedora. Só o gestor vê esta lista.</p>
      </div>
      {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}
      <ul className="flex flex-col divide-y divide-linha">
        {leads.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
            <div className="min-w-0 flex-1 basis-60">
              <Link href={`/gestao/oportunidades/${l.id}`} className="font-semibold hover:text-titan hover:underline [overflow-wrap:anywhere]">
                {l.titulo}
              </Link>
              <p className="text-sm text-suave [overflow-wrap:anywhere]">
                {l.nome}
                {l.cidade ? ` · ${l.cidade}` : ""} · {l.origem} · {l.recebido}
                {l.valor != null ? ` · ${brl(l.valor)}` : ""}
              </p>
            </div>
            <form
              className="flex w-full items-center gap-2 sm:w-auto"
              onSubmit={(e) => {
                e.preventDefault();
                const v = escolha[l.id];
                if (!v) {
                  setMsg({ tipo: "erro", texto: "Escolha a vendedora antes de distribuir." });
                  return;
                }
                setMsg(null);
                setEmAndamento(l.id);
                iniciar(async () => {
                  const r = await distribuirLead(l.id, v);
                  setEmAndamento(null);
                  if (r.ok) {
                    setMsg({ tipo: "ok", texto: r.msg ?? "Lead distribuído." });
                    router.refresh();
                  } else setMsg({ tipo: "erro", texto: r.erro });
                });
              }}
            >
              <select
                aria-label={`Vendedora para ${l.titulo}`}
                className="campo min-w-0 flex-1 py-1.5 sm:w-48"
                value={escolha[l.id] ?? ""}
                onChange={(e) => setEscolha((m) => ({ ...m, [l.id]: e.target.value }))}
              >
                <option value="">Escolher vendedora…</option>
                {equipe.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nome}
                    {v.papel !== "vendedora" ? ` (${v.papel})` : ""}
                  </option>
                ))}
              </select>
              <button className="btn-primario py-1.5" disabled={emAndamento !== null}>
                {emAndamento === l.id ? "Distribuindo…" : "Distribuir"}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
