import Link from "next/link";
import { CabecalhoPagina } from "@/components/Shell";
import { Aviso } from "@/components/gestao/Aviso";
import { FormNovoIntegrador, type DadosNovoIntegrador } from "@/components/gestao/cadastro/FormNovoIntegrador";
import { UFS } from "@/components/gestao/cadastro/mascaras";
import { chaveServicoConfigurada, SEM_CHAVE_SERVICO } from "@/components/gestao/cadastro/convite";
import { ehUuid, listarCdsGestao, sessaoGestao } from "@/components/gestao/servidor";
import { soDigitos } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";

export const metadata = { title: "Novo integrador · Gestão · Titan" };

type Params = { oportunidade?: string; cnpj?: string; nome?: string; telefone?: string; cidade?: string; uf?: string; email?: string; razao?: string };

type Oportunidade = {
  id: string;
  titulo: string;
  empresa_id: string | null;
  contato_nome: string | null;
  contato_telefone: string | null;
  cidade: string | null;
  uf: string | null;
  cnpj: string | null;
  vendedora_id: string | null;
};

const texto = (v: string | undefined, max: number) => (v ?? "").trim().slice(0, max);

export default async function NovoIntegrador({ searchParams }: { searchParams: Params }) {
  const s = await sessaoGestao();
  const gestor = s.perfil.papel === "gestor" || s.perfil.papel === "admin";
  const sb = supabaseServidor();

  const idOport = searchParams.oportunidade && ehUuid(searchParams.oportunidade) ? searchParams.oportunidade : null;
  const [cds, { data: equipe }, { data: oport }] = await Promise.all([
    listarCdsGestao(),
    gestor
      ? sb.from("perfis").select("id, nome, papel").eq("ativo", true).in("papel", ["vendedora", "gestor", "admin"]).order("nome")
      : Promise.resolve({ data: [] }),
    idOport
      ? sb
          .from("oportunidades")
          .select("id, titulo, empresa_id, contato_nome, contato_telefone, cidade, uf, cnpj, vendedora_id")
          .eq("id", idOport)
          .maybeSingle<Oportunidade>()
      : Promise.resolve({ data: null }),
  ]);
  const cdsAtivos = cds.filter((c) => c.ativo);
  const vendedoras = (equipe as { id: string; nome: string; papel: string }[] | null) ?? [];
  const o = oport as Oportunidade | null;

  const ufParam = texto(searchParams.uf, 2).toUpperCase() || (o?.uf ?? "").toUpperCase();
  const vendedoraPadrao =
    (o?.vendedora_id && vendedoras.some((v) => v.id === o.vendedora_id) ? o.vendedora_id : null) ??
    (vendedoras.some((v) => v.id === s.userId) ? s.userId : vendedoras[0]?.id ?? "");

  const inicial: DadosNovoIntegrador = {
    cnpj: soDigitos(texto(searchParams.cnpj, 20) || o?.cnpj || "").slice(0, 14),
    razao: texto(searchParams.razao, 200),
    fantasia: "",
    cidade: texto(searchParams.cidade, 120) || o?.cidade || "",
    uf: (UFS as readonly string[]).includes(ufParam) ? ufParam : "",
    telefone: soDigitos(texto(searchParams.telefone, 20) || o?.contato_telefone || "").slice(0, 11),
    segmento: "",
    cd: cdsAtivos.find((c) => c.matriz)?.id ?? cdsAtivos[0]?.id ?? "cascavel",
    nome: texto(searchParams.nome, 120) || o?.contato_nome || "",
    email: texto(searchParams.email, 254),
    vendedora: gestor ? vendedoraPadrao : "",
    // Só vincula a oportunidade que a pessoa enxerga e que ainda não tem empresa.
    oportunidade: o && !o.empresa_id ? o.id : "",
  };

  return (
    <>
      <Link href="/gestao/integradores" className="text-sm font-semibold text-titan hover:underline">
        ← Integradores
      </Link>
      <CabecalhoPagina
        titulo="Novo integrador"
        sub={gestor ? "Cadastre a empresa, escolha a vendedora responsável e envie o acesso ao portal" : "Cadastre a empresa na sua carteira e envie o acesso ao portal"}
      />
      <div className="flex max-w-3xl flex-col gap-4">
        {!chaveServicoConfigurada() && <Aviso tipo="erro">{SEM_CHAVE_SERVICO}</Aviso>}
        {o && !o.empresa_id && (
          <Aviso tipo="info">
            Cadastro a partir da oportunidade <strong>{o.titulo}</strong>. Ao salvar, a oportunidade fica ligada à nova empresa.
          </Aviso>
        )}
        {o?.empresa_id && (
          <Aviso tipo="info">
            A oportunidade <strong>{o.titulo}</strong> já está ligada a um integrador.{" "}
            <Link href={`/gestao/integradores/${o.empresa_id}`} className="font-semibold underline">
              Abrir a ficha
            </Link>
          </Aviso>
        )}
        {cdsAtivos.length === 0 ? (
          <Aviso tipo="erro">Nenhum CD ativo cadastrado. Fale com o administrador.</Aviso>
        ) : (
          <FormNovoIntegrador inicial={inicial} cds={cdsAtivos} vendedoras={gestor ? vendedoras : []} />
        )}
      </div>
    </>
  );
}
