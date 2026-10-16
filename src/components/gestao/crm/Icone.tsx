import type { TipoAtividade } from "./constantes";

const CAMINHOS: Record<TipoAtividade | "whats" | "relogio", React.ReactNode> = {
  nota: <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Zm0 0v6h6M8 13h8M8 17h5" />,
  ligacao: (
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z" />
  ),
  whatsapp: <path d="M3 21l1.7-5A9 9 0 1 1 8 19.3L3 21Zm6-12c0 3.5 2.5 6 6 6l1-1.5-2-1-1 1c-1.2-.5-2-1.3-2.5-2.5l1-1-1-2L9 9Z" />,
  whats: <path d="M3 21l1.7-5A9 9 0 1 1 8 19.3L3 21Zm6-12c0 3.5 2.5 6 6 6l1-1.5-2-1-1 1c-1.2-.5-2-1.3-2.5-2.5l1-1-1-2L9 9Z" />,
  email: <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm18 2-10 7L2 6" />,
  visita: <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />,
  tarefa: <path d="M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />,
  sistema: <path d="M12 8v4l3 2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z" />,
  relogio: <path d="M12 7v5l3 2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z" />,
};

/** Ícone de linha (stroke) dos tipos de atividade do CRM. */
export function Icone({ tipo, tamanho = 16, className }: { tipo: keyof typeof CAMINHOS; tamanho?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={tamanho}
      height={tamanho}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {CAMINHOS[tipo]}
    </svg>
  );
}
