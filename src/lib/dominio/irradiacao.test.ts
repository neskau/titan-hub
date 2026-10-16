import { describe, expect, it } from "vitest";
import { CIDADES, CIDADE_PADRAO, MESES, PERFIL_SAZONAL, cidadePorId, extremos, perfilMensal } from "./irradiacao";
import { geracaoPorKwp } from "./kit";

describe("irradiação de referência", () => {
  it("perfis sazonais têm 12 fatores com média 1 e verão acima do inverno", () => {
    for (const fatores of Object.values(PERFIL_SAZONAL)) {
      expect(fatores).toHaveLength(12);
      expect(fatores.reduce((s, f) => s + f, 0)).toBeCloseTo(12, 6);
      for (const f of fatores) expect(f).toBeGreaterThan(0.5);
      // Dezembro/janeiro (verão) acima de junho/julho (inverno)
      expect(fatores[0]).toBeGreaterThan(fatores[5]);
      expect(fatores[11]).toBeGreaterThan(fatores[6]);
    }
  });

  it("cidades ordenadas por UF e nome, sem ids repetidos", () => {
    const ordenadas = [...CIDADES].sort((a, b) => a.uf.localeCompare(b.uf) || a.nome.localeCompare(b.nome, "pt-BR"));
    expect(CIDADES.map((c) => c.id)).toEqual(ordenadas.map((c) => c.id));
    expect(new Set(CIDADES.map((c) => c.id)).size).toBe(CIDADES.length);
  });

  it("todas as cidades com HSP entre 3,5 e 6,5 e região coerente com a UF", () => {
    expect(CIDADES.length).toBeGreaterThanOrEqual(18);
    for (const c of CIDADES) {
      expect(c.hsp).toBeGreaterThanOrEqual(3.5);
      expect(c.hsp).toBeLessThanOrEqual(6.5);
      expect(c.regiao).toBe(c.uf === "PR" ? "Sul" : "Sudeste");
    }
  });

  it("inclui as cidades obrigatórias", () => {
    const nomes = CIDADES.map((c) => c.nome);
    for (const n of ["Cascavel", "Toledo", "Foz do Iguaçu", "Umuarama", "Maringá", "Londrina", "Curitiba", "Pato Branco", "Francisco Beltrão", "Guarapuava", "Piracicaba", "Campinas", "Ribeirão Preto", "Sorocaba", "São Paulo", "Bauru", "Presidente Prudente", "São José do Rio Preto"])
      expect(nomes).toContain(n);
  });

  it("perfil mensal preserva a média anual e acha melhor/pior mês", () => {
    const c = cidadePorId("cascavel-pr");
    const meses = perfilMensal(c);
    expect(meses.map((m) => m.mes)).toEqual([...MESES]);
    const mediaHsp = meses.reduce((s, m) => s + m.hsp, 0) / 12;
    expect(mediaHsp).toBeCloseTo(c.hsp, 6);
    const mediaGeracao = meses.reduce((s, m) => s + m.geracaoKwp, 0) / 12;
    expect(mediaGeracao).toBeCloseTo(geracaoPorKwp(c.hsp), 6);
    const { melhor, pior } = extremos(meses);
    expect(melhor.mes).toBe("Dez");
    expect(pior.mes).toBe("Jun");
  });

  it("id desconhecido cai na cidade padrão", () => {
    expect(cidadePorId("nao-existe").id).toBe(CIDADE_PADRAO);
  });
});
