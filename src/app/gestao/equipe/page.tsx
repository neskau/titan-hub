import { CabecalhoPagina } from "@/components/Shell";
import { LinhaMembro } from "@/components/gestao/LinhaMembro";
import { data } from "@/components/gestao/rotulos";
import { sessaoGestor } from "@/components/gestao/servidor";
import { supabaseServidor } from "@/lib/supabase/server";
import type { Perfil } from "@/lib/tipos";

export const metadata = { title: "Equipe · Gestão · Titan" };

type PerfilData = Perfil & { criado_em: string };

const ORDEM = { admin: 0, gestor: 1, vendedora: 2, integrador: 3 } as const;

export default async function Equipe() {
  // Só gestor/admin; vendedora que abrir a URL direto volta para /gestao.
  const s = await sessaoGestor();
  const sb = supabaseServidor();
  const [{ data: membros }, { data: candidatos }] = await Promise.all([
    sb.from("perfis").select("*").neq("papel", "integrador").order("nome"),
    sb.from("perfis").select("*").eq("papel", "integrador").is("empresa_id", null).order("criado_em", { ascending: false }).limit(200),
  ]);
  const equipe = ((membros as PerfilData[] | null) ?? []).sort(
    (a, b) => Number(b.ativo) - Number(a.ativo) || ORDEM[a.papel] - ORDEM[b.papel] || a.nome.localeCompare(b.nome, "pt-BR")
  );
  const semEmpresa = (candidatos as PerfilData[] | null) ?? [];
  const souAdmin = s.perfil.papel === "admin";

  const tabela = (lista: PerfilData[]) => (
    <div className="cartao overflow-x-auto">
      <table className="tabela w-full min-w-[640px] text-sm">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Cadastro</th>
            <th>Papel</th>
            <th>Acesso</th>
            <th>
              <span className="sr-only">Salvar</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {lista.map((p) => (
            <LinhaMembro
              key={`${p.id}|${p.papel}|${p.ativo}`}
              id={p.id}
              nome={p.nome}
              email={p.email}
              desde={data(p.criado_em)}
              papel={p.papel}
              ativo={p.ativo}
              eu={p.id === s.userId}
              souAdmin={souAdmin}
            />
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      <CabecalhoPagina titulo="Equipe" sub="Vendedoras, gestores e administradores com acesso à gestão" />

      <div role="note" className="rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        <p className="font-semibold">Como incluir alguém na equipe</p>
        <ol className="mt-1 list-decimal pl-5">
          <li>
            A pessoa cria a conta em <strong>/cadastro</strong> (como se fosse um integrador) e confirma o e-mail.
          </li>
          <li>
            <strong>Não</strong> precisa cadastrar empresa: ela aparece em &quot;Candidatos&quot; abaixo.
          </li>
          <li>Aqui, mude o papel para Vendedora ou Gestor e salve. No próximo acesso ela entra direto na gestão.</li>
        </ol>
        <p className="mt-2">
          Desmarcar &quot;Ativo&quot; corta o acesso aos dados internos imediatamente. Só administradores concedem o papel de administrador.
        </p>
      </div>

      <section className="flex flex-col gap-2" aria-labelledby="membros">
        <h2 id="membros" className="text-lg font-semibold">
          Membros da equipe ({equipe.length})
        </h2>
        {equipe.length === 0 ? <p className="cartao p-4 text-sm text-suave">Nenhum membro.</p> : tabela(equipe)}
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="candidatos">
        <h2 id="candidatos" className="text-lg font-semibold">
          Candidatos ({semEmpresa.length})
        </h2>
        <p className="text-sm text-suave">Contas criadas em /cadastro que ainda não vincularam empresa. Podem ser novos membros da equipe ou integradores que não terminaram o cadastro.</p>
        {semEmpresa.length === 0 ? <p className="cartao p-4 text-sm text-suave">Nenhum candidato no momento.</p> : tabela(semEmpresa)}
      </section>
    </>
  );
}
