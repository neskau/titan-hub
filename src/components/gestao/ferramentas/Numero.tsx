/** Cartão de resultado das ferramentas: rótulo, número grande e detalhe. */
export function Numero({ rotulo, valor, detalhe, tom }: { rotulo: string; valor: string; detalhe?: string; tom?: "ok" | "erro" }) {
  const cor = tom === "ok" ? "text-emerald-700" : tom === "erro" ? "text-red-700" : "";
  return (
    <div className="cartao flex min-w-0 flex-col p-4">
      <span className="text-sm font-semibold">{rotulo}</span>
      <span className={`text-[26px] font-light leading-tight [overflow-wrap:anywhere] ${cor}`}>{valor}</span>
      {detalhe && <span className="text-sm text-suave">{detalhe}</span>}
    </div>
  );
}
