import { pct } from "./constantes";

/** Barra de % atingido com marcador do ritmo esperado para o dia. */
export function BarraMeta({ atingido, ritmo, rotulo }: { atingido: number; ritmo: number; rotulo: string }) {
  const largura = Math.min(100, Math.max(0, atingido * 100));
  const cor = atingido >= 1 || atingido >= ritmo ? "bg-emerald-600" : atingido >= ritmo * 0.8 ? "bg-amber-500" : "bg-titan";
  return (
    <div
      className="relative h-3 w-full overflow-visible rounded-full bg-fundo ring-1 ring-inset ring-linha"
      role="meter"
      aria-label={rotulo}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(atingido * 100)}
      aria-valuetext={`${pct(atingido)} atingido; ritmo esperado ${pct(ritmo)}`}
    >
      <div className={`h-full rounded-full ${cor}`} style={{ width: `${largura}%` }} />
      {ritmo > 0 && ritmo < 1 && (
        <span
          className="absolute -top-1 h-5 w-0.5 rounded bg-grafite"
          style={{ left: `calc(${ritmo * 100}% - 1px)` }}
          title={`Ritmo esperado hoje: ${pct(ritmo)}`}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
