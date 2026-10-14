import type { StatusPedido } from "@/lib/tipos";

/** Etapas do pedido: concluídas em vermelho titan, a atual destacada, as próximas em cinza. */
export function LinhaDoTempo({ status, etapas }: { status: StatusPedido; etapas: { id: StatusPedido; rotulo: string }[] }) {
  if (status === "cancelado") {
    return <p className="font-semibold text-red-700">Este pedido foi cancelado. Fale com sua vendedora se precisar de ajuda.</p>;
  }
  const atual = etapas.findIndex((e) => e.id === status);
  return (
    <ol className="flex flex-col gap-3 sm:flex-row sm:gap-0">
      {etapas.map((e, i) => {
        const feito = i <= atual;
        const corrente = i === atual;
        return (
          <li key={e.id} className="relative flex items-center gap-3 sm:flex-1 sm:flex-col sm:gap-2 sm:text-center" aria-current={corrente ? "step" : undefined}>
            {i > 0 && (
              <span
                aria-hidden="true"
                className={`absolute hidden h-0.5 sm:left-[-50%] sm:right-1/2 sm:top-[13px] sm:block ${i <= atual ? "bg-titan" : "bg-linha"}`}
              />
            )}
            <span
              className={`relative z-[1] grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 text-xs font-semibold ${
                feito ? "border-titan bg-titan text-white" : "border-linha bg-white text-suave"
              } ${corrente ? "ring-4 ring-titan/20" : ""}`}
            >
              {feito && !corrente ? "✓" : i + 1}
            </span>
            <span className={`text-sm ${corrente ? "font-semibold text-titan" : feito ? "" : "text-suave"}`}>{e.rotulo}</span>
          </li>
        );
      })}
    </ol>
  );
}
