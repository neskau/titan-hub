import { CabecalhoPagina } from "@/components/Shell";
import { Incidencia } from "@/components/gestao/ferramentas/Incidencia";
import { sessaoGestao } from "@/components/gestao/servidor";

export const metadata = { title: "Incidência solar · Gestão · Titan" };

export default async function PaginaIncidencia() {
  await sessaoGestao();
  return (
    <>
      <CabecalhoPagina titulo="Incidência solar" sub="Horas de sol pleno e geração por kWp nas cidades do PR e de SP (valores de referência)" />
      <Incidencia />
    </>
  );
}
