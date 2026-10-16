import { CabecalhoPagina } from "@/components/Shell";
import { Payback } from "@/components/gestao/ferramentas/Payback";
import { sessaoGestao } from "@/components/gestao/servidor";

export const metadata = { title: "Simulador de payback · Gestão · Titan" };

export default async function PaginaPayback() {
  await sessaoGestao();
  return (
    <>
      <CabecalhoPagina titulo="Simulador de payback" sub="Em quanto tempo o sistema solar se paga, com reajuste da tarifa e perda de rendimento" />
      <Payback />
    </>
  );
}
