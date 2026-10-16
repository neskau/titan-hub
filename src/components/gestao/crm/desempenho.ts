import "server-only";
import { supabaseServidor } from "@/lib/supabase/server";
import { diasUteis, hojeSP } from "./constantes";

export interface Desempenho {
  vendedora_id: string;
  nome: string;
  meta: number;
  realizado: number;
  pedidos: number;
  oportunidades_abertas: number;
  valor_em_aberto: number;
  ganhos: number;
}

/** Mês AAAA-MM válido ou o mês atual (Brasília). */
export function mesValido(m?: string) {
  return m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : hojeSP().slice(0, 7);
}

/** Desempenho do mês (função desempenho_equipe: a vendedora recebe só a própria linha) e ritmo esperado. */
export async function carregarDesempenho(mes: string) {
  const { data, error } = await supabaseServidor().rpc("desempenho_equipe", { p_mes: `${mes}-01` });
  const linhas: Desempenho[] = ((data as Record<string, unknown>[] | null) ?? []).map((r) => ({
    vendedora_id: String(r.vendedora_id),
    nome: String(r.nome ?? ""),
    meta: Number(r.meta ?? 0),
    realizado: Number(r.realizado ?? 0),
    pedidos: Number(r.pedidos ?? 0),
    oportunidades_abertas: Number(r.oportunidades_abertas ?? 0),
    valor_em_aberto: Number(r.valor_em_aberto ?? 0),
    ganhos: Number(r.ganhos ?? 0),
  }));
  const { total, decorridos } = diasUteis(mes);
  const ritmo = total ? decorridos / total : 0;
  return { linhas, ritmo, diasUteis: total, decorridos, erro: !!error };
}

export const atingido = (realizado: number, meta: number) => (meta > 0 ? realizado / meta : 0);
