"use client";
import { useMemo, useState } from "react";
import { CIDADE_PADRAO, cidadePorId, extremos, perfilMensal } from "@/lib/dominio/irradiacao";
import { geracaoPorKwp } from "@/lib/dominio/kit";
import { num } from "@/lib/formato";
import { Numero } from "./Numero";
import { AvisoReferencia, SeletorCidade } from "./SeletorCidade";

const lerNumero = (s: string) => {
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/** Incidência solar de referência: HSP, geração por kWp e barras mensais. */
export function Incidencia() {
  const [cidadeId, setCidadeId] = useState(CIDADE_PADRAO);
  const [kwpTexto, setKwpTexto] = useState("1");
  const cidade = cidadePorId(cidadeId);
  const kwp = lerNumero(kwpTexto) > 0 ? lerNumero(kwpTexto) : 1;
  const meses = useMemo(() => perfilMensal(cidade), [cidade]);
  const { melhor, pior } = extremos(meses);
  const maximo = melhor.geracaoKwp;
  const mediaKwp = geracaoPorKwp(cidade.hsp);

  return (
    <div className="flex flex-col gap-4">
      <div className="cartao grid gap-3 p-4 sm:grid-cols-[1fr_180px] sm:items-end">
        <div>
          <label className="rotulo" htmlFor="cidade">
            Cidade
          </label>
          <SeletorCidade id="cidade" valor={cidadeId} onChange={setCidadeId} />
        </div>
        <div>
          <label className="rotulo" htmlFor="kwp">
            Sistema (kWp)
          </label>
          <input
            id="kwp"
            inputMode="decimal"
            className="campo"
            value={kwpTexto}
            onChange={(e) => setKwpTexto(e.target.value.replace(/[^\d.,]/g, "").slice(0, 8))}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Numero rotulo="HSP médio anual" valor={`${num(cidade.hsp, 2)} h/dia`} detalhe="horas de sol pleno" />
        <Numero rotulo="Geração por kWp" valor={`${num(mediaKwp, 0)} kWh/mês`} detalhe={`${num(mediaKwp * 12, 0)} kWh/ano`} />
        <Numero rotulo="Melhor mês" valor={melhor.mes} detalhe={`${num(melhor.geracaoKwp * kwp, 0)} kWh${kwp !== 1 ? ` (${num(kwp, 2)} kWp)` : "/kWp"}`} />
        <Numero rotulo="Pior mês" valor={pior.mes} detalhe={`${num(pior.geracaoKwp * kwp, 0)} kWh${kwp !== 1 ? ` (${num(kwp, 2)} kWp)` : "/kWp"}`} />
      </div>

      <section className="cartao flex flex-col gap-3 p-4" aria-labelledby="titulo-mensal">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="titulo-mensal" className="font-semibold">
            Geração estimada mês a mês
          </h2>
          <p className="text-xs text-suave">
            {num(kwp, 2)} kWp em {cidade.nome} – {cidade.uf} · perfil sazonal {cidade.regiao} · rendimento 80%
          </p>
        </div>
        <div className="flex h-56 items-end gap-1 sm:gap-2" role="list" aria-label="Geração por mês">
          {meses.map((m) => {
            const cor = m === melhor ? "bg-emerald-600" : m === pior ? "bg-amber-500" : "bg-titan";
            return (
              <div key={m.mes} role="listitem" className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[10px] font-semibold leading-none text-grafite sm:text-xs">{num(m.geracaoKwp * kwp, 0)}</span>
                <div
                  className={`w-full rounded-t ${cor}`}
                  style={{ height: `${(m.geracaoKwp / maximo) * 80}%` }}
                  title={`${m.mes}: ${num(m.hsp, 2)} h/dia · ${num(m.geracaoKwp * kwp, 0)} kWh`}
                />
                <span className="text-[10px] text-suave sm:text-xs">{m.mes}</span>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-suave">kWh no mês. Verde: melhor mês; laranja: pior mês.</p>
      </section>

      <AvisoReferencia />
    </div>
  );
}

