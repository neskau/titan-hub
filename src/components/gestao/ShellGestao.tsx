"use client";
import { usePathname } from "next/navigation";
import { Shell, type ItemMenu } from "@/components/Shell";

const MENU_BASE: ItemMenu[] = [
  { href: "/gestao", rotulo: "Dashboard" },
  { href: "/gestao/funil", rotulo: "Funil de vendas", grupo: "Vendas" },
  { href: "/gestao/tarefas", rotulo: "Tarefas", grupo: "Vendas" },
  { href: "/gestao/integradores", rotulo: "Integradores", grupo: "Vendas" },
  { href: "/gestao/pedidos", rotulo: "Pedidos", grupo: "Vendas" },
  { href: "/gestao/metas", rotulo: "Metas", grupo: "Vendas" },
  { href: "/gestao/ferramentas/payback", rotulo: "Simulador de payback", grupo: "Ferramentas" },
  { href: "/gestao/ferramentas/incidencia", rotulo: "Incidência solar", grupo: "Ferramentas" },
  { href: "/gestao/estoque", rotulo: "Estoque por CD", grupo: "Gestão" },
  { href: "/gestao/produtos", rotulo: "Produtos e datasheets", grupo: "Gestão" },
];
const ITEM_EQUIPE: ItemMenu = { href: "/gestao/equipe", rotulo: "Equipe", grupo: "Gestão" };

/** Shell da área de gestão com o item de menu ativo calculado pela rota. "Equipe" só aparece para gestor/admin. */
export function ShellGestao({
  usuario,
  gestor,
  acoes,
  children,
}: {
  usuario: string;
  gestor: boolean;
  acoes?: React.ReactNode;
  children: React.ReactNode;
}) {
  const menu = gestor ? [...MENU_BASE, ITEM_EQUIPE] : MENU_BASE;
  const caminho = usePathname() ?? "/gestao";
  const ativo =
    menu.slice(1).find((m) => caminho === m.href || caminho.startsWith(m.href + "/"))?.href ??
    (caminho === "/gestao" ? "/gestao" : undefined);
  return (
    <Shell menu={menu} ativo={ativo} titulo="GESTÃO TITAN" usuario={usuario} acoes={acoes}>
      {children}
    </Shell>
  );
}
