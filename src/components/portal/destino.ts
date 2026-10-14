import type { Papel } from "@/lib/tipos";

/** Caminho interno seguro (evita redirecionamento aberto para outro site). */
export function caminhoSeguro(v: string | null | undefined): string | null {
  if (!v || !v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return null;
  return v;
}

/** Para onde mandar depois do login: respeita ?voltar= quando combina com o papel. */
export function destinoPosLogin(papel: Papel | null | undefined, voltar?: string | null): string {
  const inicio = papel && papel !== "integrador" ? "/gestao" : "/portal";
  const v = caminhoSeguro(voltar);
  if (!v || v.startsWith("/entrar") || v === "/") return inicio;
  if (papel === "integrador" && v.startsWith("/gestao")) return inicio;
  if (papel !== "integrador" && v.startsWith("/portal")) return inicio;
  return v;
}
