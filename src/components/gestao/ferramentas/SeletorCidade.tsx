"use client";
import { CIDADES } from "@/lib/dominio/irradiacao";

/** Lista de cidades de referência agrupadas por UF. */
export function SeletorCidade({ id, valor, onChange }: { id: string; valor: string; onChange: (id: string) => void }) {
  return (
    <select id={id} className="campo" value={valor} onChange={(e) => onChange(e.target.value)}>
      {(["PR", "SP"] as const).map((uf) => (
        <optgroup key={uf} label={uf === "PR" ? "Paraná" : "São Paulo"}>
          {CIDADES.filter((c) => c.uf === uf).map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome} – {c.uf}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/** Aviso padrão: valores de irradiação são aproximados. */
export function AvisoReferencia() {
  return (
    <p role="note" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      Valores <strong>aproximados</strong>, só para referência comercial. Para projetos, confira a irradiação da cidade no{" "}
      <a href="https://cresesb.cepel.br/index.php?section=sundata" target="_blank" rel="noopener noreferrer" className="font-semibold underline">
        CRESESB/SunData
      </a>
      .
    </p>
  );
}
