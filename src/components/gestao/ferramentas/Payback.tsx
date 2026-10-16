"use client";
import { useState } from "react";
import { CIDADE_PADRAO, cidadePorId } from "@/lib/dominio/irradiacao";
import { geracaoPorKwp, kwpParaConsumo } from "@/lib/dominio/kit";
import { calcularPayback, type AnoPayback } from "@/lib/dominio/payback";
import { brl, num } from "@/lib/formato";
import { Numero } from "./Numero";
import { AvisoReferencia, SeletorCidade } from "./SeletorCidade";
import { useLargura } from "./useLargura";

const DEGRADACAO = 0.005;
const ANOS = 25;

/** Lê "1.234,56" ou "1234.56" como número; vazio ou inválido vira NaN. */
function lerNumero(s: string): number {
  const t = s.trim();
  if (!t) return NaN;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : NaN;
}

const decimal = (s: string) => s.replace(/[^\d.,]/g, "").slice(0, 14);

function textoPayback(anos: number | null) {
  if (anos === null) return `Mais de ${ANOS} anos`;
  const a = Math.floor(anos);
  const m = Math.round((anos - a) * 12);
  const ajust = m === 12 ? { a: a + 1, m: 0 } : { a, m };
  const partes = [];
  if (ajust.a > 0) partes.push(`${ajust.a} ano${ajust.a > 1 ? "s" : ""}`);
  if (ajust.m > 0) partes.push(`${ajust.m} ${ajust.m > 1 ? "meses" : "mês"}`);
  return partes.join(" e ") || "Menos de 1 mês";
}

/** Simulador de retorno do investimento em energia solar (cálculo todo no navegador). */
export function Payback() {
  const [f, setF] = useState({ cidade: CIDADE_PADRAO, consumo: "500", tarifa: "0,89", valor: "", reajuste: "6" });
  const mudar = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((v) => ({ ...v, [k]: decimal(e.target.value) }));

  const cidade = cidadePorId(f.cidade);
  const consumo = lerNumero(f.consumo);
  const tarifa = lerNumero(f.tarifa);
  const valor = lerNumero(f.valor);
  const reajuste = lerNumero(f.reajuste);

  const erros: string[] = [];
  if (!(consumo > 0)) erros.push("Informe o consumo médio em kWh/mês.");
  if (!(tarifa > 0)) erros.push("Informe a tarifa em R$/kWh.");
  if (!(valor > 0)) erros.push("Informe o valor do sistema.");
  if (!(reajuste >= 0 && reajuste <= 30)) erros.push("Reajuste anual entre 0% e 30%.");

  const calculo = (() => {
    if (erros.length) return null;
    const kwp = kwpParaConsumo(consumo, cidade.hsp);
    const geracao = kwp * geracaoPorKwp(cidade.hsp);
    const r = calcularPayback({
      investimento: valor,
      geracaoKwhMes: geracao,
      tarifa,
      reajusteAnual: reajuste / 100,
      degradacaoAnual: DEGRADACAO,
      anos: ANOS,
    });
    return { kwp, geracao, ...r };
  })();

  return (
    <div className="flex flex-col gap-4">
      <form className="cartao grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(e) => e.preventDefault()} aria-label="Dados da simulação">
        <div>
          <label className="rotulo" htmlFor="cidade">
            Cidade
          </label>
          <SeletorCidade id="cidade" valor={f.cidade} onChange={(id) => setF((v) => ({ ...v, cidade: id }))} />
        </div>
        <div>
          <label className="rotulo" htmlFor="consumo">
            Consumo médio (kWh/mês)
          </label>
          <input id="consumo" inputMode="decimal" className="campo" value={f.consumo} onChange={mudar("consumo")} />
        </div>
        <div>
          <label className="rotulo" htmlFor="tarifa">
            Tarifa com impostos (R$/kWh)
          </label>
          <input id="tarifa" inputMode="decimal" className="campo" value={f.tarifa} onChange={mudar("tarifa")} />
        </div>
        <div>
          <label className="rotulo" htmlFor="valor">
            Valor do sistema instalado (R$)
          </label>
          <input id="valor" inputMode="decimal" placeholder="Ex.: 18.500" className="campo" value={f.valor} onChange={mudar("valor")} />
        </div>
        <div>
          <label className="rotulo" htmlFor="reajuste">
            Reajuste anual da tarifa (%)
          </label>
          <input id="reajuste" inputMode="decimal" className="campo" value={f.reajuste} onChange={mudar("reajuste")} />
        </div>
        <div>
          <span className="rotulo">Perda de rendimento dos módulos</span>
          <p className="campo bg-fundo text-suave">0,5% ao ano</p>
        </div>
      </form>

      {!calculo ? (
        <div className="cartao p-4 text-sm text-suave">
          <ul className="list-disc pl-5">
            {erros.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Numero rotulo="Sistema necessário" valor={`${num(calculo.kwp, 2)} kWp`} detalhe={`HSP ${num(cidade.hsp, 2)} em ${cidade.nome}`} />
            <Numero rotulo="Geração estimada" valor={`${num(calculo.geracao, 0)} kWh/mês`} detalhe="no 1º ano" />
            <Numero rotulo="Economia no 1º ano" valor={brl(calculo.economiaPrimeiroAno)} detalhe={`≈ ${brl(calculo.economiaPrimeiroAno / 12)} por mês`} />
            <Numero
              rotulo="Retorno do investimento"
              valor={textoPayback(calculo.paybackAnos)}
              detalhe={`Saldo em ${ANOS} anos: ${brl(calculo.saldoFinal)}`}
              tom={calculo.paybackAnos === null ? "erro" : "ok"}
            />
          </div>

          <section className="cartao flex flex-col gap-2 p-4" aria-labelledby="titulo-grafico">
            <h2 id="titulo-grafico" className="font-semibold">
              Saldo acumulado ano a ano
            </h2>
            <p className="text-xs text-suave">Começa negativo (o investimento) e sobe com a economia de cada ano. Vermelho: ainda pagando; verde: lucro.</p>
            <GraficoSaldo anos={calculo.anos} />
          </section>

          <details className="cartao p-4">
            <summary className="cursor-pointer font-semibold">Tabela ano a ano</summary>
            <div className="mt-3 overflow-x-auto">
              <table className="tabela w-full min-w-[360px] text-sm">
                <thead>
                  <tr>
                    <th>Ano</th>
                    <th className="text-right">Economia no ano</th>
                    <th className="text-right">Saldo acumulado</th>
                  </tr>
                </thead>
                <tbody>
                  {calculo.anos.map((a) => (
                    <tr key={a.ano}>
                      <td>{a.ano}º</td>
                      <td className="text-right">{brl(a.economia)}</td>
                      <td className={`text-right font-semibold ${a.acumulado < 0 ? "text-red-700" : "text-emerald-700"}`}>{brl(a.acumulado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}

      <p className="text-xs text-suave">
        Estimativa simplificada: considera que toda a geração compensa consumo à tarifa informada e não inclui a taxa mínima da distribuidora, a
        regra de transição do Marco Legal (Lei 14.300) nem custos de manutenção. Use como referência na conversa com o cliente.
      </p>
      <AvisoReferencia />
    </div>
  );
}

/** Abrevia valores do eixo: R$ 12 mil, R$ 1,2 mi. */
function rotuloEixo(v: number) {
  const a = Math.abs(v);
  const sinal = v < 0 ? "−" : "";
  if (a >= 1_000_000) return `${sinal}R$ ${num(a / 1_000_000, 1)} mi`;
  if (a >= 1_000) return `${sinal}R$ ${num(a / 1_000, a >= 10_000 ? 0 : 1)} mil`;
  return `${sinal}R$ ${num(a, 0)}`;
}

/** Passo "redondo" para as linhas de grade (1, 2, 2,5 ou 5 × 10^n). */
function passoRedondo(intervalo: number, linhas: number) {
  const bruto = intervalo / Math.max(1, linhas);
  const pot = Math.pow(10, Math.floor(Math.log10(bruto || 1)));
  const n = bruto / pot;
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return m * pot;
}

function GraficoSaldo({ anos }: { anos: AnoPayback[] }) {
  const { ref, largura } = useLargura<HTMLDivElement>();
  const altura = 260;
  const esq = 72;
  const dir = 8;
  const topo = 10;
  const base = 26;
  const valores = anos.map((a) => a.acumulado);
  const passo = passoRedondo(Math.max(...valores, 0) - Math.min(...valores, 0), 5);
  const min = Math.floor(Math.min(...valores, 0) / passo) * passo;
  const max = Math.ceil(Math.max(...valores, 0) / passo) * passo || passo;
  const alturaUtil = altura - topo - base;
  const y = (v: number) => topo + ((max - v) / (max - min)) * alturaUtil;
  const larguraUtil = largura - esq - dir;
  const fatia = larguraUtil / anos.length;
  const barra = Math.max(2, fatia * 0.7);
  const ticks: number[] = [];
  for (let v = min; v <= max + passo / 2; v += passo) ticks.push(v);
  const cadaX = largura < 420 ? 5 : largura < 640 ? 2 : 1;

  return (
    <div ref={ref} className="w-full">
      <svg width={largura} height={altura} role="img" aria-label="Gráfico de barras do saldo acumulado por ano" className="block">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={esq} x2={largura - dir} y1={y(v)} y2={y(v)} stroke={v === 0 ? "#333333" : "#E8DFE0"} strokeWidth={v === 0 ? 1.2 : 1} />
            <text x={esq - 6} y={y(v)} textAnchor="end" dominantBaseline="middle" fontSize="11" fill="#6E6466">
              {rotuloEixo(v)}
            </text>
          </g>
        ))}
        {anos.map((a, i) => {
          const x = esq + i * fatia + (fatia - barra) / 2;
          const y0 = y(0);
          const y1 = y(a.acumulado);
          return (
            <g key={a.ano}>
              <rect x={x} y={Math.min(y0, y1)} width={barra} height={Math.max(1, Math.abs(y1 - y0))} rx={1.5} fill={a.acumulado < 0 ? "#B91C1C" : "#047857"}>
                <title>
                  {a.ano}º ano: {brl(a.acumulado)}
                </title>
              </rect>
              {(a.ano === 1 || a.ano % cadaX === 0) && (
                <text x={x + barra / 2} y={altura - 8} textAnchor="middle" fontSize="11" fill="#6E6466">
                  {a.ano}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <p className="text-right text-xs text-suave">ano</p>
    </div>
  );
}
