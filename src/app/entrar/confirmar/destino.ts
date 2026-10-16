import { caminhoSeguro } from "@/components/portal/destino";

/** Destino quando o link não diz para onde ir (confirmação de cadastro feito no site). */
export const PROXIMO_PADRAO = "/cadastro/empresa";

/**
 * Para onde ir depois de confirmar um link de e-mail.
 * Convite e recuperação sempre terminam em /entrar/nova-senha; os demais respeitam ?proximo (validado).
 */
export function destinoConfirmacao(tipo: string | null | undefined, proximo: string | null | undefined): string {
  if (tipo === "invite" || tipo === "recovery") return "/entrar/nova-senha";
  const p = caminhoSeguro(proximo);
  if (!p || p.startsWith("/entrar/confirmar")) return PROXIMO_PADRAO;
  return p;
}
