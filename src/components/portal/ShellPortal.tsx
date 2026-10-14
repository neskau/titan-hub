"use client";
import { usePathname } from "next/navigation";
import { Shell, type ItemMenu } from "@/components/Shell";

const MENU: ItemMenu[] = [
  { href: "/portal", rotulo: "Catálogo" },
  { href: "/portal/kit", rotulo: "Monte seu kit" },
  { href: "/portal/carrinho", rotulo: "Carrinho" },
  { href: "/portal/pedidos", rotulo: "Meus pedidos" },
];

/** Shell do portal com o item de menu ativo calculado pela rota. */
export function ShellPortal({ usuario, acoes, children }: { usuario: string; acoes?: React.ReactNode; children: React.ReactNode }) {
  const caminho = usePathname() ?? "/portal";
  const ativo =
    MENU.slice(1).find((m) => caminho === m.href || caminho.startsWith(m.href + "/"))?.href ?? (caminho === "/portal" ? "/portal" : undefined);
  return (
    <Shell menu={MENU} ativo={ativo} titulo="PORTAL DO INTEGRADOR" usuario={usuario} acoes={acoes}>
      {children}
    </Shell>
  );
}
