"use client";
import { useState, useTransition } from "react";
import { cnpjValido, formatarCnpj, soDigitos } from "@/lib/formato";
import { Aviso } from "@/components/gestao/Aviso";
import { SEGMENTOS } from "@/components/gestao/rotulos";
import { cadastrarIntegradorEquipe } from "./acoes";
import { UFS, formatarTelefone } from "./mascaras";

export interface DadosNovoIntegrador {
  cnpj: string;
  razao: string;
  fantasia: string;
  cidade: string;
  uf: string;
  telefone: string;
  segmento: string;
  cd: string;
  nome: string;
  email: string;
  vendedora: string;
  oportunidade: string;
}

/** Cadastro de integrador pela equipe: empresa + usuário de acesso (convite por e-mail). */
export function FormNovoIntegrador({
  inicial,
  cds,
  vendedoras,
}: {
  inicial: DadosNovoIntegrador;
  cds: { id: string; nome: string; uf: string }[];
  /** Só para gestor/admin; vazio = vendedora (o integrador fica na carteira de quem cadastra). */
  vendedoras: { id: string; nome: string; papel: string }[];
}) {
  const [f, setF] = useState<DadosNovoIntegrador>({
    ...inicial,
    cnpj: formatarCnpj(inicial.cnpj),
    telefone: formatarTelefone(inicial.telefone),
  });
  const [tocouCnpj, setTocouCnpj] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const mudar = (k: keyof DadosNovoIntegrador) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((v) => ({ ...v, [k]: e.target.value }));

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
          // Em caso de sucesso a ação redireciona para a ficha do integrador.
          const r = await cadastrarIntegradorEquipe(f);
          if (r && !r.ok) setErro(r.erro);
        });
      }}
    >
      <h2 className="font-semibold sm:col-span-2">Empresa integradora</h2>
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
        <input id="razao" required maxLength={200} className="campo" value={f.razao} onChange={mudar("razao")} />
      </div>
      <div className="sm:col-span-2">
        <label className="rotulo" htmlFor="fantasia">
          Nome fantasia (opcional)
        </label>
        <input id="fantasia" maxLength={120} className="campo" value={f.fantasia} onChange={mudar("fantasia")} />
      </div>
      <div className="grid grid-cols-[1fr_88px] gap-3 sm:col-span-2">
        <div>
          <label className="rotulo" htmlFor="cidade">
            Cidade
          </label>
          <input id="cidade" required maxLength={120} className="campo" value={f.cidade} onChange={mudar("cidade")} />
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
      <div>
        <label className="rotulo" htmlFor="cd">
          CD padrão
        </label>
        <select id="cd" required className="campo" value={f.cd} onChange={mudar("cd")}>
          {cds.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome} – {c.uf}
            </option>
          ))}
        </select>
      </div>
      {vendedoras.length > 0 && (
        <div>
          <label className="rotulo" htmlFor="vendedora">
            Vendedora responsável
          </label>
          <select id="vendedora" required className="campo" value={f.vendedora} onChange={mudar("vendedora")}>
            {vendedoras.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nome}
                {v.papel !== "vendedora" ? ` (${v.papel})` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      <h2 className="mt-2 border-t border-linha pt-4 font-semibold sm:col-span-2">Usuário de acesso ao portal</h2>
      <div>
        <label className="rotulo" htmlFor="nome">
          Nome
        </label>
        <input id="nome" required maxLength={120} autoComplete="off" className="campo" value={f.nome} onChange={mudar("nome")} />
      </div>
      <div>
        <label className="rotulo" htmlFor="email">
          E-mail
        </label>
        <input id="email" type="email" required maxLength={254} autoComplete="off" className="campo" value={f.email} onChange={mudar("email")} />
      </div>
      <p className="text-xs text-suave sm:col-span-2">
        A empresa entra aprovada e já na carteira {vendedoras.length > 0 ? "da vendedora escolhida" : "sua"}. O usuário recebe um e-mail com o link
        para criar a senha e acessar o portal.
      </p>

      {erro && (
        <div className="sm:col-span-2">
          <Aviso tipo="erro">{erro}</Aviso>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button className="btn-primario" disabled={enviando}>
          {enviando ? "Cadastrando…" : "Cadastrar e enviar convite"}
        </button>
      </div>
    </form>
  );
}
