"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { mudarStatusEmpresa, salvarComercial, type Resultado } from "@/app/gestao/integradores/acoes";
import { Aviso } from "./Aviso";
import type { StatusEmpresa } from "@/lib/tipos";

/** Ações de aprovação/recusa/bloqueio e dados comerciais da empresa. */
export function AcoesIntegrador({
  id,
  status,
  podeBloquear,
  vendedoraId,
  cdPadrao,
  podeBoleto,
  vendedoras,
  cds,
}: {
  id: string;
  status: StatusEmpresa;
  podeBloquear: boolean;
  vendedoraId: string | null;
  cdPadrao: string;
  podeBoleto: boolean;
  vendedoras: { id: string; nome: string; papel: string; ativo: boolean }[];
  cds: { id: string; nome: string; uf: string; ativo: boolean }[];
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [f, setF] = useState({ vendedora_id: vendedoraId ?? "", cd_padrao: cdPadrao, pode_boleto: podeBoleto });

  const executar = (acao: () => Promise<Resultado>) => {
    setMsg(null);
    iniciar(async () => {
      const r = await acao();
      if (r.ok) {
        setMsg({ tipo: "ok", texto: r.msg ?? "Salvo." });
        router.refresh();
      } else setMsg({ tipo: "erro", texto: r.erro });
    });
  };
  const mudar = (novo: StatusEmpresa, confirmar?: string) => {
    if (confirmar && !window.confirm(confirmar)) return;
    executar(() => mudarStatusEmpresa(id, novo));
  };

  return (
    <div className="flex flex-col gap-4">
      {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}

      <section className="cartao flex flex-col gap-3 p-4" aria-label="Situação do cadastro">
        <h2 className="font-semibold">Situação do cadastro</h2>
        {status === "pendente" && (
          <p className="text-sm text-suave">Confira CNPJ e dados de contato antes de aprovar. Ao aprovar, o integrador passa a ver preços e estoque.</p>
        )}
        <div className="flex flex-wrap gap-2">
          {status !== "aprovada" && (status !== "bloqueada" || podeBloquear) && (
            <button className="btn-primario" disabled={pendente} onClick={() => mudar("aprovada")}>
              {status === "bloqueada" ? "Desbloquear e aprovar" : "Aprovar"}
            </button>
          )}
          {status === "pendente" && (
            <button className="btn" disabled={pendente} onClick={() => mudar("recusada", "Recusar o cadastro desta empresa?")}>
              Recusar
            </button>
          )}
          {status === "recusada" && (
            <button className="btn" disabled={pendente} onClick={() => mudar("pendente")}>
              Voltar para análise
            </button>
          )}
          {podeBloquear && status !== "bloqueada" && (
            <button
              className="btn border-red-200 text-red-700 hover:border-red-400"
              disabled={pendente}
              onClick={() => mudar("bloqueada", "Bloquear esta empresa? As compras pelo portal ficam suspensas.")}
            >
              Bloquear
            </button>
          )}
        </div>
        {status === "bloqueada" && !podeBloquear && <p className="text-sm text-suave">Só gestor ou administrador pode desbloquear esta empresa.</p>}
      </section>

      <form
        className="cartao flex flex-col gap-3 p-4"
        aria-label="Dados comerciais"
        onSubmit={(e) => {
          e.preventDefault();
          executar(() => salvarComercial({ id, ...f }));
        }}
      >
        <h2 className="font-semibold">Dados comerciais</h2>
        <div>
          <label className="rotulo" htmlFor="vendedora">
            Vendedora responsável
          </label>
          <select id="vendedora" className="campo" value={f.vendedora_id} onChange={(e) => setF((v) => ({ ...v, vendedora_id: e.target.value }))}>
            <option value="">Sem vendedora</option>
            {vendedoras.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nome}
                {v.papel !== "vendedora" ? ` (${v.papel})` : ""}
                {v.ativo ? "" : " – inativa"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="rotulo" htmlFor="cd_padrao">
            CD padrão
          </label>
          <select id="cd_padrao" className="campo" value={f.cd_padrao} onChange={(e) => setF((v) => ({ ...v, cd_padrao: e.target.value }))}>
            {cds.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome} – {c.uf}
                {c.ativo ? "" : " (inativo)"}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 accent-titan"
            checked={f.pode_boleto}
            onChange={(e) => setF((v) => ({ ...v, pode_boleto: e.target.checked }))}
          />
          <span>
            <span className="font-semibold">Liberar boleto faturado</span>
            <span className="block text-suave">Permite escolher boleto faturado como forma de pagamento no portal.</span>
          </span>
        </label>
        <button className="btn-primario" disabled={pendente}>
          Salvar
        </button>
      </form>
    </div>
  );
}
