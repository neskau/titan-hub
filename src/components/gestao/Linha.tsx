/** Par rótulo/valor para listas de definição nos cartões laterais. */
export function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-suave">{rotulo}</dt>
      <dd className="text-right font-semibold [overflow-wrap:anywhere]">{valor}</dd>
    </div>
  );
}
