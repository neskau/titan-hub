import { Aviso } from "@/components/gestao/Aviso";
import { mensagemCadastro } from "./mascaras";

/**
 * Faixa verde da ficha do integrador logo após o cadastro pela equipe
 * (lê ?convite=<email> ou ?vinculado=<email>, que o cadastro coloca no redirecionamento).
 * Uso: <AvisoCadastro params={searchParams} />
 */
export function AvisoCadastro({ params }: { params: { convite?: string; vinculado?: string } }) {
  const texto = mensagemCadastro(params);
  return texto ? <Aviso tipo="ok">{texto}</Aviso> : null;
}
