export interface EntradaPayback {
  investimento: number;        // R$
  geracaoKwhMes: number;       // geração no 1º ano
  tarifa: number;              // R$/kWh
  reajusteAnual: number;       // ex.: 0.06
  degradacaoAnual?: number;    // ex.: 0.005
  anos?: number;               // padrão 25
}

export interface AnoPayback {
  ano: number;
  economia: number;
  acumulado: number;           // saldo: começa em -investimento
}

export interface ResultadoPayback {
  anos: AnoPayback[];
  paybackAnos: number | null;  // fracionário; null se não paga no horizonte
  economiaPrimeiroAno: number;
  saldoFinal: number;
}

export function calcularPayback(e: EntradaPayback): ResultadoPayback {
  const n = e.anos ?? 25;
  const deg = e.degradacaoAnual ?? 0.005;
  let acumulado = -e.investimento;
  let paybackAnos: number | null = null;
  const anos: AnoPayback[] = [];
  for (let a = 1; a <= n; a++) {
    const geracaoAno = e.geracaoKwhMes * 12 * Math.pow(1 - deg, a - 1);
    const economia = geracaoAno * e.tarifa * Math.pow(1 + e.reajusteAnual, a - 1);
    const antes = acumulado;
    acumulado += economia;
    if (paybackAnos === null && acumulado >= 0) paybackAnos = a - 1 + -antes / economia;
    anos.push({ ano: a, economia, acumulado });
  }
  return { anos, paybackAnos, economiaPrimeiroAno: anos[0]?.economia ?? 0, saldoFinal: acumulado };
}
