"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarOportunidade, salvarOportunidade } from "@/app/gestao/funil/acoes";
import { Aviso } from "@/components/gestao/Aviso";
import { formatarCnpj } from "@/lib/formato";
import { ORIGENS } from "./constantes";

export interface ValoresOportunidade {
  titulo: string;
  empresa_id: string;
  contato_nome: string;
  contato_telefone: string;
  cidade: string;
  uf: string;
  cnpj: string;
  valor_estimado: string;
  kwp: string;
  origem: string;
  previsao_fechamento: string;
  vendedora_id: string;
}

export const VALORES_VAZIOS: ValoresOportunidade = {
  titulo: "",
  empresa_id: "",
  contato_nome: "",
  contato_telefone: "",
  cidade: "",
  uf: "",
  cnpj: "",
  valor_estimado: "",
  kwp: "",
  origem: "manual",
  previsao_fechamento: "",
  vendedora_id: "",
};

export interface OpcaoEmpresa {
  id: string;
  nome: string;
  cidade: string | null;
  vendedora_id: string | null;
}

const UFS = "AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO".split(" ");

/** Formulário de criação/edição da oportunidade. */
export function FormOportunidade({
  id,
  inicial,
  empresas,
  equipe,
  gestor,
  vendedoraAtualNome,
}: {
  id?: string;
  inicial: ValoresOportunidade;
  empresas: OpcaoEmpresa[];
  equipe: { id: string; nome: string; papel: string }[];
  gestor: boolean;
  vendedoraAtualNome?: string | null;
}) {
  const router = useRouter();
  const [f, setF] = useState(inicial);
  const [modo, setModo] = useState<"empresa" | "prospect">(inicial.empresa_id ? "empresa" : "prospect");
  const [filtro, setFiltro] = useState("");
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const set = (k: keyof ValoresOportunidade) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((v) => ({ ...v, [k]: e.target.value }));

  const opcoes = useMemo(() => {
    const t = filtro.trim().toLowerCase();
    const l = t ? empresas.filter((e) => `${e.nome} ${e.cidade ?? ""}`.toLowerCase().includes(t) || e.id === f.empresa_id) : empresas;
    return l.slice(0, 300);
  }, [empresas, filtro, f.empresa_id]);

  const empresaSel = empresas.find((e) => e.id === f.empresa_id);
  const vendedoraDaEmpresa = empresaSel?.vendedora_id ? equipe.find((m) => m.id === empresaSel.vendedora_id) : undefined;
  const editando = !!id;

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        const dados =
          modo === "empresa"
            ? { ...f, cidade: "", uf: "", cnpj: "" }
            : { ...f, empresa_id: "" };
        if (modo === "empresa" && !f.empresa_id) {
          setMsg({ tipo: "erro", texto: "Escolha a empresa ou mude para “Prospect”." });
          return;
        }
        iniciar(async () => {
          const r = editando ? await salvarOportunidade(id, dados) : await criarOportunidade(dados);
          if (!r.ok) {
            setMsg({ tipo: "erro", texto: r.erro });
            return;
          }
          if (!editando && r.id) {
            router.push(`/gestao/oportunidades/${r.id}`);
            return;
          }
          setMsg({ tipo: "ok", texto: r.msg ?? "Salvo." });
          router.refresh();
        });
      }}
    >
      <div>
        <label className="rotulo" htmlFor="titulo">
          Título da oportunidade *
        </label>
        <input
          id="titulo"
          required
          minLength={2}
          maxLength={160}
          className="campo"
          placeholder="Ex.: Usina 75 kWp – Fazenda Santa Rita"
          value={f.titulo}
          onChange={set("titulo")}
        />
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="rotulo">Cliente</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tipo de cliente">
          {(
            [
              ["empresa", "Integrador cadastrado"],
              ["prospect", "Prospect (ainda sem cadastro)"],
            ] as const
          ).map(([m, rot]) => (
            <label key={m} className={`btn cursor-pointer py-1.5 text-sm ${modo === m ? "border-titan bg-titan-tinta text-titan" : ""}`}>
              <input type="radio" name="modo" value={m} checked={modo === m} onChange={() => setModo(m)} className="sr-only" />
              {rot}
            </label>
          ))}
        </div>

        {modo === "empresa" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {empresas.length > 12 && (
              <div className="sm:col-span-2">
                <label className="rotulo" htmlFor="filtro-empresa">
                  Procurar empresa
                </label>
                <input id="filtro-empresa" type="search" className="campo" value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Nome ou cidade" />
              </div>
            )}
            <div className="sm:col-span-2">
              <label className="rotulo" htmlFor="empresa_id">
                Empresa {gestor ? "" : "da sua carteira"} *
              </label>
              <select
                id="empresa_id"
                className="campo"
                value={f.empresa_id}
                onChange={(e) => {
                  const emp = empresas.find((x) => x.id === e.target.value);
                  setF((v) => ({ ...v, empresa_id: e.target.value, vendedora_id: gestor && emp?.vendedora_id ? emp.vendedora_id : v.vendedora_id }));
                }}
              >
                <option value="">{empresas.length ? "Escolha a empresa…" : "Nenhuma empresa na carteira"}</option>
                {opcoes.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome}
                    {e.cidade ? ` – ${e.cidade}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="rotulo" htmlFor="contato_nome">
                Pessoa de contato
              </label>
              <input id="contato_nome" maxLength={120} className="campo" value={f.contato_nome} onChange={set("contato_nome")} />
            </div>
            <div>
              <label className="rotulo" htmlFor="contato_telefone">
                Telefone / WhatsApp do contato
              </label>
              <input
                id="contato_telefone"
                inputMode="tel"
                maxLength={20}
                className="campo"
                placeholder="Se vazio, usa o da empresa"
                value={f.contato_telefone}
                onChange={set("contato_telefone")}
              />
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="rotulo" htmlFor="contato_nome">
                Nome do contato / empresa *
              </label>
              <input id="contato_nome" maxLength={120} className="campo" value={f.contato_nome} onChange={set("contato_nome")} />
            </div>
            <div>
              <label className="rotulo" htmlFor="contato_telefone">
                Telefone / WhatsApp
              </label>
              <input
                id="contato_telefone"
                inputMode="tel"
                maxLength={20}
                className="campo"
                placeholder="(45) 99999-0000"
                value={f.contato_telefone}
                onChange={set("contato_telefone")}
              />
            </div>
            <div>
              <label className="rotulo" htmlFor="cidade">
                Cidade
              </label>
              <input id="cidade" maxLength={120} className="campo" value={f.cidade} onChange={set("cidade")} />
            </div>
            <div className="grid grid-cols-[90px_1fr] gap-3">
              <div>
                <label className="rotulo" htmlFor="uf">
                  UF
                </label>
                <select id="uf" className="campo px-2" value={f.uf} onChange={set("uf")}>
                  <option value="">—</option>
                  {UFS.map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="rotulo" htmlFor="cnpj">
                  CNPJ
                </label>
                <input
                  id="cnpj"
                  inputMode="numeric"
                  maxLength={18}
                  className="campo"
                  value={formatarCnpj(f.cnpj)}
                  onChange={(e) => setF((v) => ({ ...v, cnpj: e.target.value.replace(/\D/g, "").slice(0, 14) }))}
                />
              </div>
            </div>
          </div>
        )}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="rotulo" htmlFor="valor_estimado">
            Valor estimado (R$)
          </label>
          <input id="valor_estimado" inputMode="decimal" maxLength={20} className="campo" placeholder="0,00" value={f.valor_estimado} onChange={set("valor_estimado")} />
        </div>
        <div>
          <label className="rotulo" htmlFor="kwp">
            Potência (kWp)
          </label>
          <input id="kwp" inputMode="decimal" maxLength={12} className="campo" placeholder="0,00" value={f.kwp} onChange={set("kwp")} />
        </div>
        <div>
          <label className="rotulo" htmlFor="origem">
            Origem
          </label>
          <select id="origem" className="campo" value={f.origem} onChange={set("origem")}>
            {ORIGENS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="rotulo" htmlFor="previsao_fechamento">
            Previsão de fechamento
          </label>
          <input id="previsao_fechamento" type="date" className="campo" value={f.previsao_fechamento} onChange={set("previsao_fechamento")} />
        </div>
      </div>

      {gestor ? (
        <div className="max-w-sm">
          <label className="rotulo" htmlFor="vendedora_id">
            Vendedora responsável
          </label>
          <select id="vendedora_id" className="campo" value={f.vendedora_id} onChange={set("vendedora_id")}>
            <option value="">Sem vendedora (distribuir depois)</option>
            {equipe.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
                {m.papel !== "vendedora" ? ` (${m.papel})` : ""}
              </option>
            ))}
          </select>
          {modo === "empresa" && empresaSel && (
            <p className="mt-1 text-xs text-suave">
              {vendedoraDaEmpresa
                ? f.vendedora_id && f.vendedora_id !== vendedoraDaEmpresa.id
                  ? `A empresa está na carteira de ${vendedoraDaEmpresa.nome}. Ao salvar, a empresa e as oportunidades abertas dela passam para a vendedora escolhida.`
                  : `Empresa da carteira de ${vendedoraDaEmpresa.nome}.`
                : "Empresa ainda sem vendedora: ao escolher uma, ela entra na carteira dessa vendedora."}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-suave">
          Responsável: <span className="font-semibold text-grafite">{vendedoraAtualNome ?? "você"}</span>
        </p>
      )}

      {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primario" disabled={pendente}>
          {pendente ? "Salvando…" : editando ? "Salvar alterações" : "Criar oportunidade"}
        </button>
        {!editando && (
          <button type="button" className="btn" onClick={() => router.back()} disabled={pendente}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
