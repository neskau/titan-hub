import Link from "next/link";
import { CabecalhoPagina } from "@/components/Shell";
import { ehUuid, sessaoGestao } from "@/components/gestao/servidor";
import { empresasDaCarteira } from "@/components/gestao/crm/carteira";
import { FormOportunidade, VALORES_VAZIOS } from "@/components/gestao/crm/FormOportunidade";
import { ehGestor, listarEquipe } from "@/components/gestao/crm/servidor";

export const metadata = { title: "Nova oportunidade · Gestão · Titan" };

export default async function NovaOportunidade({ searchParams }: { searchParams: { empresa?: string } }) {
  const s = await sessaoGestao();
  const gestor = ehGestor(s);
  const [empresas, equipe] = await Promise.all([empresasDaCarteira(), listarEquipe()]);
  const empresa = searchParams.empresa && ehUuid(searchParams.empresa) ? empresas.find((e) => e.id === searchParams.empresa) : undefined;
  const voltar = empresa ? `/gestao/integradores/${empresa.id}` : "/gestao/funil";

  return (
    <>
      <Link href={voltar} className="text-sm font-semibold text-titan hover:underline">
        ← {empresa ? empresa.nome : "Funil de vendas"}
      </Link>
      <CabecalhoPagina titulo="Nova oportunidade" sub={gestor ? "Escolha a vendedora ou deixe para distribuir depois" : "A oportunidade entra na sua carteira"} />
      <div className="cartao max-w-4xl p-5">
        <FormOportunidade
          inicial={{
            ...VALORES_VAZIOS,
            empresa_id: empresa?.id ?? "",
            titulo: empresa ? `Projeto – ${empresa.nome}`.slice(0, 160) : "",
            vendedora_id: gestor ? (empresa?.vendedora_id ?? "") : s.userId,
          }}
          empresas={empresas}
          equipe={equipe.filter((m) => m.ativo).map(({ id, nome, papel }) => ({ id, nome, papel }))}
          gestor={gestor}
          vendedoraAtualNome={s.perfil.nome}
        />
      </div>
    </>
  );
}
