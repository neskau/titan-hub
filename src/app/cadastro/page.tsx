import Link from "next/link";
import { redirect } from "next/navigation";
import { obterSessao } from "@/lib/sessao";
import { CascaPublica } from "@/components/portal/CascaPublica";
import { FormConta } from "./FormConta";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cadastro de integrador · Titan Distribuidora Solar" };

export default async function Cadastro() {
  const s = await obterSessao();
  if (s) redirect(s.perfil.papel === "integrador" ? (s.empresa ? "/portal" : "/cadastro/empresa") : "/gestao");

  return (
    <CascaPublica estreito>
      <div className="cartao flex flex-col gap-5 p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-titan">Passo 1 de 2</p>
          <h1 className="text-[26px] font-light leading-tight">Crie seu acesso</h1>
          <p className="text-sm text-suave">Depois você informa o CNPJ da empresa integradora. Nossa equipe aprova o cadastro e libera preços e compras.</p>
        </div>
        <p role="note" className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
          É da equipe Titan? Crie só a conta e não cadastre empresa; o gestor libera seu acesso.
        </p>
        <FormConta />
        <p className="text-center text-sm text-suave">
          Já tem conta?{" "}
          <Link href="/entrar" className="font-semibold text-titan hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </CascaPublica>
  );
}
