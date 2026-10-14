import { redirect } from "next/navigation";
import { obterSessao } from "@/lib/sessao";

// Entrada: visitante vai ao catálogo público; integrador ao portal; equipe à gestão.
export default async function Inicio() {
  const s = await obterSessao();
  if (!s) redirect("/catalogo");
  redirect(s.perfil.papel === "integrador" ? "/portal" : "/gestao");
}
