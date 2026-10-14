import { redirect } from "next/navigation";
import { obterSessao } from "@/lib/sessao";
import { CascaPublica } from "@/components/portal/CascaPublica";
import { destinoPosLogin } from "@/components/portal/destino";
import { FormEntrar } from "./FormEntrar";

export const dynamic = "force-dynamic";
export const metadata = { title: "Entrar · Titan Distribuidora Solar" };

export default async function Entrar({ searchParams }: { searchParams: { voltar?: string; erro?: string; senha?: string } }) {
  const s = await obterSessao();
  if (s) redirect(destinoPosLogin(s.perfil.papel, searchParams.voltar));

  return (
    <CascaPublica estreito>
      <div className="cartao flex flex-col gap-5 p-6">
        <div>
          <h1 className="text-[26px] font-light leading-tight">Entrar no Titan Hub</h1>
          <p className="text-sm text-suave">Portal do integrador e área da equipe Titan</p>
        </div>
        {searchParams.erro === "link" && (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            O link que você abriu expirou ou já foi usado. Entre com sua senha ou peça um novo link.
          </p>
        )}
        {searchParams.senha === "ok" && (
          <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Senha alterada. Entre com a nova senha.
          </p>
        )}
        <FormEntrar voltar={searchParams.voltar ?? null} />
      </div>
    </CascaPublica>
  );
}
