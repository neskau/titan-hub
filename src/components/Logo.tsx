/** Marca Titan: logotipo em texto + fênix estilizada (aproximação para a interface; trocar pelo SVG oficial do manual quando disponível). */
export function Logo({ claro = true, compacto = false }: { claro?: boolean; compacto?: boolean }) {
  return (
    <span className="inline-flex items-end gap-2" aria-label="Titan Distribuidora Solar">
      <span className="leading-none">
        <span className={`block text-[28px] font-semibold tracking-[0.06em] ${claro ? "text-white" : "text-grafite"}`}>TITAN</span>
        {!compacto && (
          <span className={`block text-[10px] tracking-[0.12em] ${claro ? "text-white/60" : "text-suave"}`}>distribuidora solar</span>
        )}
      </span>
      <svg viewBox="0 0 120 70" className="mb-3 h-6 w-10 text-[#E2353D]" aria-hidden="true">
        <path
          fill="currentColor"
          d="M2 2c3 4 4 9 9 12l48 30c-14 4-29 3-34-2 2 5 4 9 9 11l20 11c7 4 15 2 19-5 6-12 17-21 31-24l14-1c-4-2-9-3-14-3l-5-3h-17c4 1 9 1 12 2-6 0-13 1-19 3L2 2Zm9 22c2 4 2 8 6 10l25 15c2 1 4 0 4-1L11 24Z"
        />
      </svg>
    </span>
  );
}
