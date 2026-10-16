import { soDigitos } from "@/lib/formato";

// Mesmas máscaras e listas do formulário de empresa do portal (src/app/cadastro/empresa/FormEmpresa.tsx).

export const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"] as const;
export type UF = (typeof UFS)[number];

export function formatarTelefone(s: string) {
  const d = soDigitos(s).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Mensagem de sucesso exibida na ficha do integrador depois do cadastro pela equipe. */
export function mensagemCadastro(params: { convite?: string; vinculado?: string }): string | null {
  const email = (v?: string) => (v && /^[^\s@]{1,64}@[^\s@]{1,190}$/.test(v) ? v : null);
  const c = email(params.convite);
  if (c) return `Integrador cadastrado. Enviamos um convite para ${c} criar a senha.`;
  const v = email(params.vinculado);
  if (v) return `Integrador cadastrado. ${v} já tinha conta no portal e entra com a senha que já usa (ou em “Esqueci a senha”).`;
  return null;
}
