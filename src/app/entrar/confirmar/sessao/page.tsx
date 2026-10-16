import { CascaPublica } from "@/components/portal/CascaPublica";
import { GravarSessao } from "./GravarSessao";

export const dynamic = "force-dynamic";
export const metadata = { title: "Confirmando acesso · Titan Distribuidora Solar" };

export default function ConfirmarSessao({ searchParams }: { searchParams: { proximo?: string } }) {
  return (
    <CascaPublica estreito>
      <div className="cartao flex flex-col gap-3 p-6">
        <h1 className="text-[26px] font-light leading-tight">Confirmando seu acesso…</h1>
        <GravarSessao proximo={searchParams.proximo ?? null} />
      </div>
    </CascaPublica>
  );
}
