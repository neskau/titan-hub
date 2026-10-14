import Link from "next/link";
import { Logo } from "@/components/Logo";

/** Casca das páginas públicas (catálogo, login, cadastro): faixa vinho com a marca. */
export function CascaPublica({ children, acoes, estreito }: { children: React.ReactNode; acoes?: React.ReactNode; estreito?: boolean }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-vinho-escuro text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-4 md:px-7">
          <Link href="/catalogo" aria-label="Titan Distribuidora Solar – catálogo">
            <Logo />
          </Link>
          <span className="flex-1" />
          {acoes}
        </div>
      </header>
      <main className={`mx-auto flex w-full flex-1 flex-col gap-5 px-4 py-6 md:px-7 ${estreito ? "max-w-md justify-center" : "max-w-6xl"}`}>{children}</main>
      <footer className="border-t border-linha bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap gap-x-6 gap-y-1 px-4 py-4 text-xs text-suave md:px-7">
          <span className="font-semibold text-grafite">Titan Distribuidora Solar</span>
          <span>Matriz Cascavel – PR</span>
          <span>Filial Piracicaba – SP</span>
          <a href="https://www.titandistribuidora.com.br" className="hover:text-titan" target="_blank" rel="noopener noreferrer">
            titandistribuidora.com.br
          </a>
        </div>
      </footer>
    </div>
  );
}
