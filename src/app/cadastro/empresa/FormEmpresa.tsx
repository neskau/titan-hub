"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cnpjValido, formatarCnpj, soDigitos } from "@/lib/formato";
import { cadastrarEmpresa } from "./acoes";

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
const SEGMENTOS = ["Residencial", "Agro", "Comercial e industrial"] as const;

function formatarTelefone(s: string) {
  const d = soDigitos(s).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function FormEmpresa() {
  const router = useRouter();
  const [f, setF] = useState({ cnpj: "", razao: "", fantasia: "", cidade: "", uf: "", telefone: "", segmento: "" });
  const [tocouCnpj, setTocouCnpj] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const mudar = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((v) => ({ ...v, [k]: e.target.value }));

  const cnpjCompleto = soDigitos(f.cnpj).length === 14;
  const cnpjErro = (tocouCnpj || cnpjCompleto) && f.cnpj && !cnpjValido(f.cnpj) ? "CNPJ inválido. Confira os números." : null;

  return (
    <form
      className="cartao grid gap-4 p-5 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        setErro(null);
        if (!cnpjValido(f.cnpj)) {
          setTocouCnpj(true);
          return setErro("CNPJ inválido. Confira os números.");
        }
        iniciar(async () => {
          const r = await cadastrarEmpresa(f);
          if (r.ok) router.refresh();
          else setErro(r.erro);
        });
      }}
    >
      <div className="sm:col-span-2">
        <label className="rotulo" htmlFor="cnpj">
          CNPJ
        </label>
        <input
          id="cnpj"
          inputMode="numeric"
          placeholder="00.000.000/0000-00"
          required
          className={`campo ${cnpjErro ? "border-red-400" : ""}`}
          aria-invalid={Boolean(cnpjErro)}
          aria-describedby={cnpjErro ? "cnpj-erro" : undefined}
          value={f.cnpj}
          onChange={(e) => setF((v) => ({ ...v, cnpj: formatarCnpj(e.target.value) }))}
          onBlur={() => setTocouCnpj(true)}
        />
        {cnpjErro && (
          <p id="cnpj-erro" className="mt-1 text-xs text-red-700">
            {cnpjErro}
          </p>
        )}
      </div>
      <div className="sm:col-span-2">
        <label className="rotulo" htmlFor="razao">
          Razão social
        </label>
        <input id="razao" required autoComplete="organization" className="campo" value={f.razao} onChange={mudar("razao")} />
      </div>
      <div className="sm:col-span-2">
        <label className="rotulo" htmlFor="fantasia">
          Nome fantasia (opcional)
        </label>
        <input id="fantasia" className="campo" value={f.fantasia} onChange={mudar("fantasia")} />
      </div>
      <div className="grid grid-cols-[1fr_88px] gap-3 sm:col-span-2">
        <div>
          <label className="rotulo" htmlFor="cidade">
            Cidade
          </label>
          <input id="cidade" required autoComplete="address-level2" className="campo" value={f.cidade} onChange={mudar("cidade")} />
        </div>
        <div>
          <label className="rotulo" htmlFor="uf">
            UF
          </label>
          <select id="uf" required className="campo" value={f.uf} onChange={mudar("uf")}>
            <option value="" disabled>
              —
            </option>
            {UFS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="rotulo" htmlFor="telefone">
          Telefone / WhatsApp
        </label>
        <input
          id="telefone"
          type="tel"
          autoComplete="tel"
          placeholder="(45) 99999-9999"
          required
          className="campo"
          value={f.telefone}
          onChange={(e) => setF((v) => ({ ...v, telefone: formatarTelefone(e.target.value) }))}
        />
      </div>
      <div>
        <label className="rotulo" htmlFor="segmento">
          Segmento principal
        </label>
        <select id="segmento" required className="campo" value={f.segmento} onChange={mudar("segmento")}>
          <option value="" disabled>
            Escolha
          </option>
          {SEGMENTOS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      {erro && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 sm:col-span-2">
          {erro}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button className="btn-primario" disabled={enviando}>
          {enviando ? "Enviando…" : "Enviar para análise"}
        </button>
        <p className="text-xs text-suave">A equipe Titan confere os dados e libera preços e compras.</p>
      </div>
    </form>
  );
}
