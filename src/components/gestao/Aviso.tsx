/** Faixa de mensagem (sucesso/erro) usada nos formulários da gestão. */
export function Aviso({ tipo, children }: { tipo: "ok" | "erro" | "info"; children: React.ReactNode }) {
  const cor =
    tipo === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : tipo === "erro"
        ? "border-red-200 bg-red-50 text-red-800"
        : "border-sky-200 bg-sky-50 text-sky-900";
  return (
    <p role={tipo === "erro" ? "alert" : "status"} className={`rounded-md border px-3 py-2 text-sm ${cor}`}>
      {children}
    </p>
  );
}
