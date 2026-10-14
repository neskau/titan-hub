import Link from "next/link";
import { redirect } from "next/navigation";
import { obterSessao } from "@/lib/sessao";
import { formatarCnpj, linkWhatsapp } from "@/lib/formato";
import { CascaPublica } from "@/components/portal/CascaPublica";
import { BotaoSair } from "@/components/BotaoSair";
import { FormEmpresa } from "./FormEmpresa";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dados da empresa · Titan Distribuidora Solar" };

export default async function CadastroEmpresa() {
  const s = await obterSessao();
  if (!s) redirect("/entrar?voltar=/cadastro/empresa");
  if (s.perfil.papel !== "integrador") redirect("/gestao");

  const sair = (
    <span className="[&_button]:text-sm">
      <BotaoSair />
    </span>
  );

  if (s.empresa) {
    if (s.empresa.status === "aprovada") redirect("/portal");
    const e = s.empresa;
    return (
      <CascaPublica estreito acoes={sair}>
        <div className="cartao flex flex-col gap-4 p-6">
          <span className={e.status === "pendente" ? "chip-alerta w-fit" : "chip-erro w-fit"}>
            {e.status === "pendente" ? "Em análise" : e.status === "recusada" ? "Não aprovado" : "Bloqueado"}
          </span>
          <h1 className="text-[26px] font-light leading-tight">{e.status === "pendente" ? "Cadastro em análise" : "Cadastro não liberado"}</h1>
          <p className="text-sm">
            {e.status === "pendente"
              ? "Recebemos os dados da sua empresa. A equipe comercial da Titan confere o CNPJ e libera o acesso aos preços, ao estoque e às compras, normalmente em até 1 dia útil."
              : "O acesso da sua empresa às compras não está liberado. Fale com a equipe comercial da Titan para regularizar."}
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md bg-fundo p-3 text-sm">
            <dt className="text-suave">Empresa</dt>
            <dd className="font-semibold">{e.nome_fantasia || e.razao_social}</dd>
            <dt className="text-suave">CNPJ</dt>
            <dd>{formatarCnpj(e.cnpj)}</dd>
            {e.cidade && (
              <>
                <dt className="text-suave">Cidade</dt>
                <dd>
                  {e.cidade}
                  {e.uf ? ` – ${e.uf}` : ""}
                </dd>
              </>
            )}
          </dl>
          <div className="flex flex-wrap gap-2">
            <Link href="/portal" className="btn-primario">
              Ver o portal
            </Link>
            <Link href="/catalogo" className="btn">
              Ver o catálogo
            </Link>
            {s.vendedora?.telefone && (
              <a className="btn-whats" target="_blank" rel="noopener noreferrer" href={linkWhatsapp(s.vendedora.telefone, `Olá! Acabei de cadastrar a ${e.razao_social} (CNPJ ${formatarCnpj(e.cnpj)}) no portal da Titan.`)}>
                Falar no WhatsApp
              </a>
            )}
          </div>
        </div>
      </CascaPublica>
    );
  }

  return (
    <CascaPublica acoes={sair}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-titan">Passo 2 de 2</p>
          <h1 className="text-[28px] font-light leading-tight">Dados da empresa integradora</h1>
          <p className="text-sm text-suave">Olá, {s.perfil.nome.split(" ")[0]}! Informe o CNPJ da empresa que vai comprar na Titan.</p>
        </div>
        <FormEmpresa />
      </div>
    </CascaPublica>
  );
}
