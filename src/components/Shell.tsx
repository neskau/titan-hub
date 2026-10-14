import Link from "next/link";
import { Logo } from "./Logo";
import { BotaoSair } from "./BotaoSair";

export interface ItemMenu {
  href: string;
  rotulo: string;
  grupo?: string; // quando muda, mostra o título do grupo antes do item
}

/**
 * Casca das áreas logadas: menu lateral vinho (item ativo em vermelho) + barra superior branca.
 * `ativo` = href do item atual (o layout de cada área calcula a partir da rota).
 */
export function Shell({
  menu,
  ativo,
  titulo,
  usuario,
  acoes,
  children,
}: {
  menu: ItemMenu[];
  ativo?: string;
  titulo: string;
  usuario: string;
  acoes?: React.ReactNode;
  children: React.ReactNode;
}) {
  let grupoAtual: string | undefined;
  return (
    <div className="grid min-h-screen md:grid-cols-[260px_1fr]">
      <aside className="flex flex-col gap-5 bg-vinho-escuro py-5 text-white md:sticky md:top-0 md:h-screen">
        <div className="px-5">
          <Logo />
        </div>
        <nav className="flex gap-0 overflow-x-auto md:flex-col">
          {menu.map((m) => {
            const cabecalho = m.grupo && m.grupo !== grupoAtual;
            grupoAtual = m.grupo ?? grupoAtual;
            const marcado = ativo === m.href;
            return (
              <div key={m.href}>
                {cabecalho && (
                  <div className="hidden px-5 pb-1 pt-4 text-[11px] uppercase tracking-wider text-white/50 md:block">{m.grupo}</div>
                )}
                <Link
                  href={m.href}
                  aria-current={marcado ? "page" : undefined}
                  className={`block whitespace-nowrap px-5 py-3 text-[15px] ${
                    marcado ? "bg-[#8F0B10] font-semibold text-white" : "text-[#D9C5C8] hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {m.rotulo}
                </Link>
              </div>
            );
          })}
        </nav>
        <div className="mt-auto hidden px-5 md:block">
          <BotaoSair />
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-10 flex flex-wrap items-center gap-4 bg-white px-4 py-3 shadow-[0_2px_10px_rgba(61,0,14,.06)] md:px-7">
          <span className="font-semibold tracking-wide">{titulo}</span>
          <span className="flex-1" />
          {acoes}
          <span className="flex items-center gap-2 font-semibold">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-titan text-sm text-white">
              {usuario.slice(0, 2).toUpperCase()}
            </span>
            <span className="hidden sm:inline">{usuario.toUpperCase()}</span>
          </span>
        </header>
        <main className="flex flex-col gap-5 px-4 py-6 md:px-7">{children}</main>
      </div>
    </div>
  );
}

export function CabecalhoPagina({ titulo, sub, acoes }: { titulo: string; sub?: string; acoes?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div>
        <h1 className="text-[28px] font-light leading-tight">{titulo}</h1>
        {sub && <p className="text-sm text-suave">{sub}</p>}
      </div>
      <span className="flex-1" />
      {acoes}
    </div>
  );
}
