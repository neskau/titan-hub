import Link from "next/link";

type Icone = "pedidos" | "faturar" | "cadastro" | "estoque";

const ICONES: Record<Icone, React.ReactNode> = {
  pedidos: <path d="M6 2h12l2 4v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6l2-4Zm-2 4h16M9 11h6M9 15h6" />,
  faturar: <path d="M7 3h10v18l-2.5-1.5L12 21l-2.5-1.5L7 21V3Zm3 5h4m-4 4h4m-4 4h2" />,
  cadastro: <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm10-3v6m3-3h-6" />,
  estoque: <path d="M21 8 12 3 3 8v8l9 5 9-5V8ZM3 8l9 5 9-5M12 13v8" />,
};

/** Cartão de indicador: número grande + rótulo + ícone em círculo + valor/observação. */
export function Indicador({
  numero,
  rotulo,
  icone,
  detalhe,
  href,
  destaque,
}: {
  numero: string;
  rotulo: string;
  icone: Icone;
  detalhe?: string;
  href?: string;
  destaque?: boolean;
}) {
  const conteudo = (
    <>
      <span
        aria-hidden="true"
        className={`grid h-12 w-12 shrink-0 place-items-center rounded-full ${destaque ? "bg-titan text-white" : "bg-titan-tinta text-titan"}`}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          {ICONES[icone]}
        </svg>
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-[30px] font-light leading-none">{numero}</span>
        <span className="mt-1 text-sm font-semibold">{rotulo}</span>
        {detalhe && <span className="text-sm text-suave">{detalhe}</span>}
      </span>
    </>
  );
  const classe = "cartao flex items-center gap-4 p-4";
  return href ? (
    <Link href={href} className={`${classe} hover:border-suave`}>
      {conteudo}
    </Link>
  ) : (
    <div className={classe}>{conteudo}</div>
  );
}
