import Link from "next/link";
import { ShellPortal } from "@/components/portal/ShellPortal";
import { SeletorCd } from "@/components/portal/SeletorCd";
import { WhatsFlutuante } from "@/components/portal/WhatsFlutuante";
import { AvisoCadastro } from "@/components/portal/AvisoCadastro";
import { cdAtual, sessaoPortal } from "@/components/portal/servidor";

export const dynamic = "force-dynamic";

export default async function LayoutPortal({ children }: { children: React.ReactNode }) {
  const s = await sessaoPortal();
  const empresa = s.empresa!; // exigirIntegrador garante a empresa
  const { cd, cds } = await cdAtual(empresa.cd_padrao);
  const nomeEmpresa = empresa.nome_fantasia || empresa.razao_social;
  const aprovada = empresa.status === "aprovada";

  return (
    <ShellPortal
      usuario={s.perfil.nome}
      acoes={
        <div className="flex flex-wrap items-center gap-3">
          {cd && <SeletorCd atual={cd.id} cds={cds.map((c) => ({ id: c.id, nome: c.nome, uf: c.uf }))} />}
          <Link href="/portal/kit" className="btn-primario py-1.5 text-sm tracking-wide">
            NOVO ORÇAMENTO
          </Link>
        </div>
      }
    >
      {!aprovada && <AvisoCadastro status={empresa.status} />}
      {children}
      {s.vendedora?.telefone && <WhatsFlutuante telefone={s.vendedora.telefone} nome={s.vendedora.nome} empresa={nomeEmpresa} />}
    </ShellPortal>
  );
}
