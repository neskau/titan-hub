import { ShellGestao } from "@/components/gestao/ShellGestao";
import { sessaoGestao } from "@/components/gestao/servidor";

export const dynamic = "force-dynamic";

export default async function LayoutGestao({ children }: { children: React.ReactNode }) {
  const s = await sessaoGestao();
  const gestor = s.perfil.papel === "gestor" || s.perfil.papel === "admin";
  if (!s.perfil.ativo) {
    return (
      <ShellGestao usuario={s.perfil.nome} gestor={false}>
        <div role="alert" className="cartao p-6">
          <p className="text-lg font-semibold">Acesso desativado</p>
          <p className="text-sm text-suave">Seu usuário da equipe está inativo. Fale com o gestor para reativar o acesso.</p>
        </div>
      </ShellGestao>
    );
  }
  return (
    <ShellGestao usuario={s.perfil.nome} gestor={gestor}>
      {children}
    </ShellGestao>
  );
}
