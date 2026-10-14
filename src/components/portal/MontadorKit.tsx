"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { brl, num } from "@/lib/formato";
import { geracaoPorKwp, kwpParaConsumo, montarKit, type ResultadoKit } from "@/lib/dominio/kit";
import type { Fase, ItemCatalogo, TipoTelhado } from "@/lib/tipos";
import { TELHADOS } from "./categorias";
import { ChipEstoque } from "./ChipEstoque";
import { useCarrinho } from "./useCarrinho";

const HSP_PADRAO = 4.9;

/** Lê número digitado no padrão brasileiro ("8,5" ou "1.250"). */
function lerNumero(s: string): number {
  const limpo = s.trim().replace(/\s/g, "");
  if (!limpo) return 0;
  const normal = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  const v = Number(normal);
  return Number.isFinite(v) ? v : 0;
}

export function MontadorKit({
  cd,
  aprovado,
  modulos,
  inversores,
  estruturas,
  cabo,
  conector,
  stringBox,
}: {
  cd: string;
  aprovado: boolean;
  modulos: ItemCatalogo[];
  inversores: ItemCatalogo[];
  estruturas: ItemCatalogo[];
  cabo: ItemCatalogo | null;
  conector: ItemCatalogo | null;
  stringBox: ItemCatalogo | null;
}) {
  const { adicionar } = useCarrinho(cd);
  const [modoEntrada, setModoEntrada] = useState<"kwp" | "consumo">("consumo");
  const [kwpTexto, setKwpTexto] = useState("");
  const [consumoTexto, setConsumoTexto] = useState("");
  const [hspTexto, setHspTexto] = useState(num(HSP_PADRAO, 1));
  const [moduloId, setModuloId] = useState(modulos[0]?.id ?? "");
  const telhadosDisponiveis = TELHADOS.filter((t) => estruturas.some((e) => e.tipo_telhado === t.id));
  const [telhado, setTelhado] = useState<TipoTelhado>(telhadosDisponiveis[0]?.id ?? "ceramica");
  const fasesDisponiveis = (["mono", "tri"] as Fase[]).filter((f) => inversores.some((i) => i.fase === f));
  const [fase, setFase] = useState<Fase>(fasesDisponiveis[0] ?? "mono");
  const [incluidoEm, setIncluidoEm] = useState<number | null>(null);

  const hsp = lerNumero(hspTexto) || HSP_PADRAO;
  const kwpDesejado = modoEntrada === "kwp" ? lerNumero(kwpTexto) : kwpParaConsumo(lerNumero(consumoTexto), hsp);
  const modulo = modulos.find((m) => m.id === moduloId) ?? modulos[0];

  const calculo = useMemo((): { r: ResultadoKit | null; erro: string | null } => {
    if (!modulo) return { r: null, erro: "Nenhum módulo disponível neste CD." };
    if (!(kwpDesejado > 0)) return { r: null, erro: null };
    if (kwpDesejado > 500) return { r: null, erro: "Para usinas acima de 500 kWp, fale com sua vendedora para um projeto sob medida." };
    try {
      return {
        r: montarKit({
          kwpDesejado,
          modulo,
          inversores,
          estruturas,
          fase,
          telhado,
          cabo: cabo ?? undefined,
          conector: conector ?? undefined,
          stringBox: stringBox ?? undefined,
        }),
        erro: null,
      };
    } catch (e) {
      return { r: null, erro: e instanceof Error ? e.message : "Não foi possível montar o kit." };
    }
  }, [kwpDesejado, modulo, inversores, estruturas, fase, telhado, cabo, conector, stringBox]);

  const r = calculo.r;
  const geracao = r ? r.kwpReal * geracaoPorKwp(hsp) : 0;
  const rsWp = r && r.total != null && r.kwpReal > 0 ? r.total / (r.kwpReal * 1000) : null;
  const faltando = new Set(r?.faltaEstoque.map((l) => l.produto.id) ?? []);

  if (modulos.length === 0 || inversores.length === 0) {
    return (
      <div className="cartao p-6 text-suave">
        Este centro de distribuição ainda não tem módulos e inversores cadastrados para montar kits. Experimente o outro CD no seletor acima.
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
      <section className="cartao flex flex-col gap-4 p-4" aria-labelledby="titulo-dados">
        <h2 id="titulo-dados" className="font-semibold">
          Dados do projeto
        </h2>

        <div role="radiogroup" aria-label="Como informar o tamanho" className="grid grid-cols-2 rounded-md border border-linha p-1 text-sm">
          {(
            [
              ["consumo", "Pelo consumo"],
              ["kwp", "Pela potência"],
            ] as const
          ).map(([id, rotulo]) => (
            <button
              key={id}
              role="radio"
              aria-checked={modoEntrada === id}
              onClick={() => setModoEntrada(id)}
              className={`rounded px-2 py-1.5 font-semibold ${modoEntrada === id ? "bg-titan text-white" : "text-suave hover:text-grafite"}`}
            >
              {rotulo}
            </button>
          ))}
        </div>

        {modoEntrada === "consumo" ? (
          <div className="grid grid-cols-[1fr_96px] gap-3">
            <div>
              <label className="rotulo" htmlFor="consumo">
                Consumo médio (kWh/mês)
              </label>
              <input id="consumo" className="campo" inputMode="decimal" placeholder="Ex.: 650" value={consumoTexto} onChange={(e) => setConsumoTexto(e.target.value)} />
            </div>
            <div>
              <label className="rotulo" htmlFor="hsp">
                HSP (h/dia)
              </label>
              <input id="hsp" className="campo" inputMode="decimal" value={hspTexto} onChange={(e) => setHspTexto(e.target.value)} />
            </div>
            {kwpDesejado > 0 && <p className="col-span-2 text-xs text-suave">Potência necessária: {num(kwpDesejado, 2)} kWp</p>}
          </div>
        ) : (
          <div>
            <label className="rotulo" htmlFor="kwp">
              Potência desejada (kWp)
            </label>
            <input id="kwp" className="campo" inputMode="decimal" placeholder="Ex.: 8,5" value={kwpTexto} onChange={(e) => setKwpTexto(e.target.value)} />
          </div>
        )}

        <div>
          <label className="rotulo" htmlFor="modulo">
            Módulo
          </label>
          <select id="modulo" className="campo" value={modulo?.id} onChange={(e) => setModuloId(e.target.value)}>
            {modulos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome} · {m.marca}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="rotulo" htmlFor="telhado">
            Telhado
          </label>
          <select id="telhado" className="campo" value={telhado} onChange={(e) => setTelhado(e.target.value as TipoTelhado)}>
            {(telhadosDisponiveis.length ? telhadosDisponiveis : TELHADOS).map((t) => (
              <option key={t.id} value={t.id}>
                {t.rotulo}
              </option>
            ))}
          </select>
        </div>

        <fieldset>
          <legend className="rotulo">Rede elétrica</legend>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["mono", "Monofásica"],
                ["tri", "Trifásica"],
              ] as const
            ).map(([id, rotulo]) => (
              <label
                key={id}
                className={`flex cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${
                  fase === id ? "border-titan bg-titan-tinta text-titan" : "border-linha"
                } ${fasesDisponiveis.includes(id) ? "" : "opacity-50"}`}
              >
                <input type="radio" name="fase" className="sr-only" checked={fase === id} onChange={() => setFase(id)} />
                {rotulo}
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="flex min-w-0 flex-col gap-4" aria-live="polite">
        {calculo.erro && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{calculo.erro}</div>}

        {!r && !calculo.erro && (
          <div className="cartao p-8 text-center text-suave">
            Informe o consumo mensal da conta de luz ou a potência em kWp para ver o kit sugerido.
          </div>
        )}

        {r && (
          <>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Indicador rotulo="Potência do kit" valor={`${num(r.kwpReal, 2)} kWp`} detalhe={`${r.quantidadeModulos} módulos`} />
              <Indicador rotulo="Geração estimada" valor={`${num(geracao)} kWh/mês`} detalhe={`HSP ${num(hsp, 1)}`} />
              <Indicador rotulo="Relação CC/CA" valor={num(r.relacaoCcCa, 2)} detalhe={`${num(r.kwInversores, 1)} kW em inversores`} />
              <Indicador
                rotulo="Total do kit"
                valor={r.total != null ? brl(r.total) : "—"}
                detalhe={rsWp != null ? `${brl(rsWp)}/Wp` : aprovado ? "Preço incompleto" : "Após aprovação"}
                destaque
              />
            </dl>

            {(r.avisos.length > 0 || r.faltaEstoque.length > 0) && (
              <ul className="flex flex-col gap-2">
                {r.avisos.map((a) => (
                  <li key={a} className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
                    {a}
                  </li>
                ))}
                {r.faltaEstoque.length > 0 && (
                  <li className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
                    Sem estoque suficiente neste CD: {r.faltaEstoque.map((l) => `${l.produto.nome} (pede ${l.quantidade}, há ${l.produto.estoque ?? 0})`).join("; ")}.
                    Troque o CD no topo da página ou fale com sua vendedora.
                  </li>
                )}
              </ul>
            )}

            <div className="cartao overflow-x-auto">
              <table className="tabela w-full min-w-[520px] text-sm">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="text-right">Qtd.</th>
                    <th className="text-right">Unitário</th>
                    <th className="text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {r.linhas.map((l) => (
                    <tr key={l.produto.id} className={faltando.has(l.produto.id) ? "bg-red-50/60" : undefined}>
                      <td>
                        <p className="font-semibold">{l.produto.nome}</p>
                        <p className="flex flex-wrap items-center gap-2 text-xs text-suave">
                          {l.produto.marca} · SKU {l.produto.sku}
                          <ChipEstoque estoque={l.produto.estoque} unidade={l.produto.unidade} />
                        </p>
                      </td>
                      <td className="text-right">
                        {num(l.quantidade)} {l.produto.unidade}
                      </td>
                      <td className="text-right">{brl(l.produto.preco)}</td>
                      <td className="text-right font-semibold">{l.produto.preco != null ? brl(l.produto.preco * l.quantidade) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {aprovado ? (
                <>
                  <button
                    className="btn-primario"
                    disabled={r.total == null}
                    onClick={() => {
                      for (const l of r.linhas) {
                        const p = l.produto;
                        adicionar({ produto_id: p.id, sku: p.sku, nome: p.nome, marca: p.marca, unidade: p.unidade, preco: p.preco }, l.quantidade);
                      }
                      setIncluidoEm(Date.now());
                    }}
                  >
                    Pôr tudo no carrinho
                  </button>
                  {incluidoEm && (
                    <span className="text-sm text-emerald-700">
                      Kit incluído no carrinho.{" "}
                      <Link href="/portal/carrinho" className="font-semibold underline">
                        Ver carrinho
                      </Link>
                    </span>
                  )}
                </>
              ) : (
                <p className="text-sm text-suave">Preços e compra liberados após a aprovação do cadastro.</p>
              )}
            </div>
            <p className="text-xs text-suave">
              Sugestão automática para conferência do integrador: valide string, tensão e dimensionamento elétrico no projeto antes da compra.
            </p>
          </>
        )}
      </section>
    </div>
  );
}

function Indicador({ rotulo, valor, detalhe, destaque }: { rotulo: string; valor: string; detalhe?: string; destaque?: boolean }) {
  return (
    <div className="cartao p-3">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-suave">{rotulo}</dt>
      <dd className={`text-lg font-semibold leading-tight ${destaque ? "text-titan" : ""}`}>{valor}</dd>
      {detalhe && <dd className="text-xs text-suave">{detalhe}</dd>}
    </div>
  );
}
