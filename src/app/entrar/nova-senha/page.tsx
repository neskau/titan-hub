import { redirect } from "next/navigation";
import { supabaseServidor } from "@/lib/supabase/server";
import { CascaPublica } from "@/components/portal/CascaPublica";
import { FormNovaSenha } from "./FormNovaSenha";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nova senha · Titan Distribuidora Solar" };

export default async function NovaSenha() {
  const sb = supabaseServidor();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/entrar?erro=link");

  // Integrador convidado pela equipe (já com empresa): depois de criar a senha vai direto ao portal.
  const { data: perfil } = await sb.from("perfis").select("nome, papel, empresa_id").eq("id", user.id).maybeSingle<{ nome: string; papel: string; empresa_id: string | null }>();
  const convidado = Boolean(user.invited_at) && perfil?.papel === "integrador" && Boolean(perfil.empresa_id);

  return (
    <CascaPublica estreito>
      <div className="cartao flex flex-col gap-5 p-6">
        <div>
          <h1 className="text-[26px] font-light leading-tight">{convidado ? "Crie sua senha" : "Criar nova senha"}</h1>
          {convidado ? (
            <p className="text-sm text-suave">
              Olá, {perfil?.nome.split(" ")[0]}! A equipe Titan liberou seu acesso ao portal ({user.email}). Crie uma senha para entrar.
            </p>
          ) : (
            <p className="text-sm text-suave">Conta {user.email}</p>
          )}
        </div>
        <FormNovaSenha aposSalvar={convidado ? "/portal" : null} />
      </div>
    </CascaPublica>
  );
}
