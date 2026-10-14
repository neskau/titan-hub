import Link from "next/link";
import { CATEGORIAS } from "./categorias";

/** Busca (GET) + chips de categoria. Funciona sem JavaScript. */
export function FiltrosCatalogo({ base, q, categoria, total }: { base: string; q?: string; categoria?: string; total: number }) {
  const link = (cat?: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (cat) p.set("categoria", cat);
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };
  const chip = (ativo: boolean) =>
    `chip border px-3 py-1 text-[13px] ${
      ativo ? "border-titan bg-titan text-white" : "border-linha bg-white text-grafite hover:border-suave"
    }`;

  return (
    <div className="flex flex-col gap-3">
      <form action={base} method="get" className="flex gap-2" role="search">
        {categoria && <input type="hidden" name="categoria" value={categoria} />}
        <label htmlFor="busca" className="sr-only">
          Buscar produto
        </label>
        <input
          id="busca"
          name="q"
          defaultValue={q}
          placeholder="Buscar por nome, marca ou SKU"
          className="campo"
          maxLength={60}
          type="search"
        />
        <button className="btn-primario shrink-0">Buscar</button>
      </form>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={link()} className={chip(!categoria)}>
          Todos
        </Link>
        {CATEGORIAS.map((c) => (
          <Link key={c} href={link(c)} className={chip(categoria === c)}>
            {c}
          </Link>
        ))}
        <span className="ml-auto text-sm text-suave">
          {total} {total === 1 ? "produto" : "produtos"}
          {q ? ` para “${q}”` : ""}
        </span>
      </div>
    </div>
  );
}
