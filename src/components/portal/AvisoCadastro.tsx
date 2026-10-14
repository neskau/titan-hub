import type { StatusEmpresa } from "@/lib/tipos";

const TEXTOS: Record<Exclude<StatusEmpresa, "aprovada">, { titulo: string; texto: string; cor: string }> = {
  pendente: {
    titulo: "Cadastro em análise",
    texto: "Nossa equipe está conferindo os dados da sua empresa. Assim que o cadastro for aprovado, os preços, o estoque e as compras são liberados aqui no portal.",
    cor: "border-amber-200 bg-amber-50 text-amber-900",
  },
  recusada: {
    titulo: "Cadastro não aprovado",
    texto: "Não foi possível aprovar o cadastro da sua empresa. Fale com a equipe comercial da Titan para entender o motivo e regularizar.",
    cor: "border-red-200 bg-red-50 text-red-900",
  },
  bloqueada: {
    titulo: "Cadastro bloqueado",
    texto: "As compras pelo portal estão suspensas para a sua empresa. Fale com a equipe comercial da Titan.",
    cor: "border-red-200 bg-red-50 text-red-900",
  },
};

export function AvisoCadastro({ status }: { status: StatusEmpresa }) {
  if (status === "aprovada") return null;
  const t = TEXTOS[status];
  return (
    <div role="status" className={`rounded-md border px-4 py-3 ${t.cor}`}>
      <p className="font-semibold">{t.titulo}</p>
      <p className="text-sm">{t.texto}</p>
    </div>
  );
}
