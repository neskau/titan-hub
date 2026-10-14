"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { salvarProduto } from "@/app/gestao/produtos/acoes";
import { CATEGORIAS, TELHADOS } from "./rotulos";
import { Aviso } from "./Aviso";
import type { Categoria, Fase, TipoTelhado } from "@/lib/tipos";

export interface DadosProduto {
  id: string;
  sku: string;
  nome: string;
  marca: string;
  categoria: Categoria | "";
  especificacao: string;
  unidade: string;
  imagem_path: string;
  potencia_w: string;
  potencia_kw: string;
  fase: Fase | "";
  modulos_por_estrutura: string;
  tipo_telhado: TipoTelhado | "";
  preco: string;
  ativo: boolean;
}

export const PRODUTO_VAZIO: DadosProduto = {
  id: "",
  sku: "",
  nome: "",
  marca: "",
  categoria: "",
  especificacao: "",
  unidade: "un",
  imagem_path: "",
  potencia_w: "",
  potencia_kw: "",
  fase: "",
  modulos_por_estrutura: "",
  tipo_telhado: "",
  preco: "",
  ativo: true,
};

/** Cadastro/edição de produto. Os campos técnicos mudam conforme a categoria. */
export function FormProduto({ inicial }: { inicial: DadosProduto }) {
  const router = useRouter();
  const [f, setF] = useState(inicial);
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const novo = !inicial.id;
  const inversor = f.categoria === "Inversores" || f.categoria === "Microinversores";
  const mudar =
    (k: keyof DadosProduto) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setF((v) => ({ ...v, [k]: e.target.value }));
  const decimal = (k: keyof DadosProduto) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((v) => ({ ...v, [k]: e.target.value.replace(/[^\d.,]/g, "") }));

  return (
    <form
      className="cartao grid gap-4 p-5 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        iniciar(async () => {
          const r = await salvarProduto(f);
          if (!r.ok) return setMsg({ tipo: "erro", texto: r.erro });
          if (novo) {
            router.push(`/gestao/produtos/${r.id}?novo=1`);
          } else {
            setMsg({ tipo: "ok", texto: r.msg ?? "Produto salvo." });
            router.refresh();
          }
        });
      }}
    >
      {msg && (
        <div className="sm:col-span-2">
          <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>
        </div>
      )}
      <div>
        <label className="rotulo" htmlFor="sku">
          SKU
        </label>
        <input id="sku" required className="campo" value={f.sku} onChange={mudar("sku")} />
      </div>
      <div>
        <label className="rotulo" htmlFor="categoria">
          Categoria
        </label>
        <select id="categoria" required className="campo" value={f.categoria} onChange={mudar("categoria")}>
          <option value="" disabled>
            Escolha…
          </option>
          {CATEGORIAS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="rotulo" htmlFor="nome">
          Nome
        </label>
        <input id="nome" required className="campo" value={f.nome} onChange={mudar("nome")} />
      </div>
      <div>
        <label className="rotulo" htmlFor="marca">
          Marca
        </label>
        <input id="marca" required className="campo" value={f.marca} onChange={mudar("marca")} />
      </div>
      <div>
        <label className="rotulo" htmlFor="unidade">
          Unidade
        </label>
        <input id="unidade" required placeholder="un, m, par…" className="campo" value={f.unidade} onChange={mudar("unidade")} />
      </div>
      <div className="sm:col-span-2">
        <label className="rotulo" htmlFor="especificacao">
          Especificação (resumo exibido no catálogo)
        </label>
        <textarea id="especificacao" rows={2} className="campo" value={f.especificacao} onChange={mudar("especificacao")} />
      </div>

      {f.categoria === "Módulos" && (
        <div>
          <label className="rotulo" htmlFor="potencia_w">
            Potência (W)
          </label>
          <input id="potencia_w" required inputMode="numeric" className="campo" value={f.potencia_w} onChange={decimal("potencia_w")} />
        </div>
      )}
      {inversor && (
        <>
          <div>
            <label className="rotulo" htmlFor="potencia_kw">
              Potência (kW)
            </label>
            <input id="potencia_kw" required inputMode="decimal" className="campo" value={f.potencia_kw} onChange={decimal("potencia_kw")} />
          </div>
          <div>
            <label className="rotulo" htmlFor="fase">
              Fase
            </label>
            <select id="fase" required className="campo" value={f.fase} onChange={mudar("fase")}>
              <option value="" disabled>
                Escolha…
              </option>
              <option value="mono">Monofásico</option>
              <option value="tri">Trifásico</option>
            </select>
          </div>
        </>
      )}
      {f.categoria === "Estruturas" && (
        <>
          <div>
            <label className="rotulo" htmlFor="modulos_por_estrutura">
              Módulos por estrutura
            </label>
            <input
              id="modulos_por_estrutura"
              required
              inputMode="numeric"
              className="campo"
              value={f.modulos_por_estrutura}
              onChange={decimal("modulos_por_estrutura")}
            />
          </div>
          <div>
            <label className="rotulo" htmlFor="tipo_telhado">
              Tipo de telhado
            </label>
            <select id="tipo_telhado" required className="campo" value={f.tipo_telhado} onChange={mudar("tipo_telhado")}>
              <option value="" disabled>
                Escolha…
              </option>
              {TELHADOS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.rotulo}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      <div>
        <label className="rotulo" htmlFor="preco">
          Preço base (R$)
        </label>
        <input id="preco" inputMode="decimal" placeholder="0,00" className="campo" value={f.preco} onChange={decimal("preco")} />
        <p className="mt-1 text-xs text-suave">O preço em cada CD é este valor × o fator de preço do CD. Em branco = sem preço (não vendável).</p>
      </div>
      <div>
        <label className="rotulo" htmlFor="imagem_path">
          Imagem (caminho ou URL, opcional)
        </label>
        <input id="imagem_path" className="campo" value={f.imagem_path} onChange={mudar("imagem_path")} />
      </div>

      <label className="flex items-start gap-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 accent-titan"
          checked={f.ativo}
          onChange={(e) => setF((v) => ({ ...v, ativo: e.target.checked }))}
        />
        <span>
          <span className="font-semibold">Produto ativo</span>
          <span className="block text-suave">Inativos somem do catálogo e do portal, mas continuam nos pedidos antigos.</span>
        </span>
      </label>

      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button className="btn-primario" disabled={pendente}>
          {novo ? "Cadastrar produto" : "Salvar alterações"}
        </button>
        {novo && <p className="self-center text-xs text-suave">Ao cadastrar, o estoque é aberto zerado em todos os CDs ativos.</p>}
      </div>
    </form>
  );
}
