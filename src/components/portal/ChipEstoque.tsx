import { num } from "@/lib/formato";
import { POUCO_ESTOQUE } from "./categorias";

/** Situação do estoque no CD: sem estoque / últimas unidades (< 10) / em estoque. */
export function ChipEstoque({ estoque, unidade = "un" }: { estoque: number | null; unidade?: string }) {
  if (estoque == null) return null;
  if (estoque <= 0) return <span className="chip-erro">Sem estoque</span>;
  if (estoque < POUCO_ESTOQUE)
    return (
      <span className="chip-alerta">
        Últimas unidades · {num(estoque)} {unidade}
      </span>
    );
  return (
    <span className="chip-ok">
      Em estoque · {num(estoque)} {unidade}
    </span>
  );
}
