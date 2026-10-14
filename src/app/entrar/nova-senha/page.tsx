import { redirect } from "next/navigation";
import { supabaseServidor } from "@/lib/supabase/server";
import { CascaPublica } from "@/components/portal/CascaPublica";
import { FormNovaSenha } from "./FormNovaSenha";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nova senha · Titan Distribuidora Solar" };

export default async function NovaSenha() {
  const {
    data: { user },
  } = await supabaseServidor().auth.getUser();
  if (!user) redirect("/entrar?erro=link");

  return (
    <CascaPublica estreito>
      <div className="cartao flex flex-col gap-5 p-6">
        <div>
          <h1 className="text-[26px] font-light leading-tight">Criar nova senha</h1>
          <p className="text-sm text-suave">Conta {user.email}</p>
        </div>
        <FormNovaSenha />
      </div>
    </CascaPublica>
  );
}
