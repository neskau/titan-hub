import { geracaoPorKwp } from "./kit";

/**
 * Irradiação solar de REFERÊNCIA para cidades atendidas pela Titan (PR e SP).
 *
 * ATENÇÃO: os valores são APROXIMADOS (média anual de horas de sol pleno no plano horizontal,
 * arredondada) e servem só para conversa comercial e estimativas rápidas. Para dimensionar
 * projetos, confira sempre a irradiação da localidade no CRESESB/SunData
 * (https://cresesb.cepel.br/index.php?section=sundata) ou em outra base oficial.
 */

export type Regiao = "Sul" | "Sudeste";

export interface CidadeIrradiacao {
  id: string;
  nome: string;
  uf: "PR" | "SP";
  regiao: Regiao;
  /** HSP médio anual aproximado (kWh/m²·dia). */
  hsp: number;
}

export const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"] as const;

/**
 * Fator sazonal de cada mês em relação à média anual (a média dos 12 fatores é 1).
 * Perfis típicos aproximados: no Sul o inverno é mais fraco que no interior de SP.
 */
export const PERFIL_SAZONAL: Record<Regiao, readonly number[]> = {
  Sul: [1.2, 1.17, 1.08, 0.93, 0.78, 0.7, 0.76, 0.92, 0.93, 1.07, 1.2, 1.26],
  Sudeste: [1.1, 1.13, 1.05, 0.97, 0.85, 0.8, 0.86, 0.98, 0.98, 1.06, 1.1, 1.12],
};

const BASE: Omit<CidadeIrradiacao, "id" | "regiao">[] = [
  { nome: "Cascavel", uf: "PR", hsp: 4.75 },
  { nome: "Curitiba", uf: "PR", hsp: 4.15 },
  { nome: "Foz do Iguaçu", uf: "PR", hsp: 4.75 },
  { nome: "Francisco Beltrão", uf: "PR", hsp: 4.55 },
  { nome: "Guarapuava", uf: "PR", hsp: 4.45 },
  { nome: "Londrina", uf: "PR", hsp: 4.95 },
  { nome: "Maringá", uf: "PR", hsp: 5.0 },
  { nome: "Pato Branco", uf: "PR", hsp: 4.55 },
  { nome: "Toledo", uf: "PR", hsp: 4.8 },
  { nome: "Umuarama", uf: "PR", hsp: 4.95 },
  { nome: "Bauru", uf: "SP", hsp: 5.1 },
  { nome: "Campinas", uf: "SP", hsp: 4.95 },
  { nome: "Piracicaba", uf: "SP", hsp: 5.0 },
  { nome: "Presidente Prudente", uf: "SP", hsp: 5.15 },
  { nome: "Ribeirão Preto", uf: "SP", hsp: 5.25 },
  { nome: "São José do Rio Preto", uf: "SP", hsp: 5.3 },
  { nome: "São Paulo", uf: "SP", hsp: 4.55 },
  { nome: "Sorocaba", uf: "SP", hsp: 4.85 },
];

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Cidades ordenadas por UF (PR, depois SP) e nome. */
export const CIDADES: CidadeIrradiacao[] = BASE.map((c) => ({
  ...c,
  id: `${slug(c.nome)}-${c.uf.toLowerCase()}`,
  regiao: (c.uf === "PR" ? "Sul" : "Sudeste") as Regiao,
})).sort((a, b) => a.uf.localeCompare(b.uf) || a.nome.localeCompare(b.nome, "pt-BR"));

export const CIDADE_PADRAO = "cascavel-pr";

export function cidadePorId(id: string | null | undefined): CidadeIrradiacao {
  return CIDADES.find((c) => c.id === id) ?? CIDADES.find((c) => c.id === CIDADE_PADRAO)!;
}

export interface MesIrradiacao {
  mes: (typeof MESES)[number];
  hsp: number;
  /** Geração estimada por kWp instalado no mês (kWh). */
  geracaoKwp: number;
}

/** Perfil mês a mês de uma cidade: HSP do mês e geração por kWp (rendimento padrão de 80%). */
export function perfilMensal(c: CidadeIrradiacao, rendimento = 0.8): MesIrradiacao[] {
  return PERFIL_SAZONAL[c.regiao].map((f, i) => {
    const hsp = c.hsp * f;
    return { mes: MESES[i], hsp, geracaoKwp: geracaoPorKwp(hsp, rendimento) };
  });
}

/** Melhor e pior mês de geração. */
export function extremos(meses: MesIrradiacao[]): { melhor: MesIrradiacao; pior: MesIrradiacao } {
  let melhor = meses[0];
  let pior = meses[0];
  for (const m of meses) {
    if (m.geracaoKwp > melhor.geracaoKwp) melhor = m;
    if (m.geracaoKwp < pior.geracaoKwp) pior = m;
  }
  return { melhor, pior };
}
