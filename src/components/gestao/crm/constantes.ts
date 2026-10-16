// Rótulos, regras e utilitários de data do CRM (servidor e navegador).

export type Etapa = "novo" | "contato" | "orcamento" | "negociacao" | "ganho" | "perdido";
export type TipoAtividade = "nota" | "ligacao" | "whatsapp" | "email" | "visita" | "tarefa" | "sistema";
export type Origem = "portal" | "manual" | "indicacao" | "instagram" | "whatsapp" | "feira" | "prospeccao" | "site" | "outro";

export const ETAPAS: { id: Etapa; rotulo: string; chip: string; fechada: boolean }[] = [
  { id: "novo", rotulo: "Novo lead", chip: "chip-info", fechada: false },
  { id: "contato", rotulo: "Primeiro contato", chip: "chip-info", fechada: false },
  { id: "orcamento", rotulo: "Orçamento enviado", chip: "chip-alerta", fechada: false },
  { id: "negociacao", rotulo: "Negociação", chip: "chip-alerta", fechada: false },
  { id: "ganho", rotulo: "Ganho", chip: "chip-ok", fechada: true },
  { id: "perdido", rotulo: "Perdido", chip: "chip-erro", fechada: true },
];
export const IDS_ETAPA = ETAPAS.map((e) => e.id) as [Etapa, ...Etapa[]];
export const ETAPAS_ABERTAS: Etapa[] = ["novo", "contato", "orcamento", "negociacao"];
export const etapaInfo = (id: Etapa) => ETAPAS.find((e) => e.id === id) ?? ETAPAS[0];

export const ORIGENS: { id: Origem; rotulo: string }[] = [
  { id: "manual", rotulo: "Cadastro manual" },
  { id: "portal", rotulo: "Cadastro no portal" },
  { id: "site", rotulo: "Site" },
  { id: "whatsapp", rotulo: "WhatsApp" },
  { id: "instagram", rotulo: "Instagram" },
  { id: "indicacao", rotulo: "Indicação" },
  { id: "prospeccao", rotulo: "Prospecção ativa" },
  { id: "feira", rotulo: "Feira / evento" },
  { id: "outro", rotulo: "Outro" },
];
export const IDS_ORIGEM = ORIGENS.map((o) => o.id) as [Origem, ...Origem[]];
export const rotuloOrigem = (id: string) => ORIGENS.find((o) => o.id === id)?.rotulo ?? id;

export const TIPOS_ATIVIDADE: Record<TipoAtividade, string> = {
  nota: "Nota",
  ligacao: "Ligação",
  whatsapp: "WhatsApp",
  email: "E-mail",
  visita: "Visita",
  tarefa: "Tarefa",
  sistema: "Sistema",
};
/** Tipos que a equipe registra manualmente na linha do tempo (além de tarefa). */
export const TIPOS_REGISTRO = ["nota", "ligacao", "whatsapp", "email", "visita"] as const;

/** A partir de quantos dias sem atividade o card fica em alerta. */
export const DIAS_ALERTA = 3;

// ---------- Datas no fuso de Brasília ----------
const FUSO = "America/Sao_Paulo";

/** AAAA-MM-DD do instante no fuso de Brasília. */
export const diaSP = (d: Date | string = new Date()) => new Date(d).toLocaleDateString("en-CA", { timeZone: FUSO });
export const hojeSP = () => diaSP(new Date());

/** Soma dias a uma data AAAA-MM-DD. */
export function somarDias(dia: string, n: number) {
  const t = new Date(`${dia}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

/** Dias de calendário (Brasília) entre a data informada e hoje. */
export function diasDesde(iso: string, hoje = hojeSP()) {
  const a = Date.parse(`${diaSP(iso)}T12:00:00Z`);
  const b = Date.parse(`${hoje}T12:00:00Z`);
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** Instante ISO de uma data + hora digitadas no fuso de Brasília (sem horário de verão desde 2019). */
export const instanteSP = (dia: string, hora = "09:00") => `${dia}T${hora}:00-03:00`;

export const horaSP = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });
export const dataCurta = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit" });

/** Dias úteis (seg–sex) do mês AAAA-MM e quantos já passaram até `hoje` (inclusive). Feriados não são considerados. */
export function diasUteis(mes: string, hoje = hojeSP()) {
  const [a, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  let total = 0;
  let decorridos = 0;
  for (let d = 1; d <= ultimo; d++) {
    const dia = new Date(Date.UTC(a, m - 1, d));
    const sem = dia.getUTCDay();
    if (sem === 0 || sem === 6) continue;
    total++;
    if (dia.toISOString().slice(0, 10) <= hoje) decorridos++;
  }
  return { total, decorridos };
}

/** Nome do mês por extenso: "outubro de 2026". */
export const nomeMes = (mes: string) =>
  new Date(`${mes}-15T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

/** Compara o % atingido com o ritmo esperado do mês. */
export function situacaoRitmo(atingido: number, ritmo: number, meta: number): { rotulo: string; chip: string } {
  if (meta <= 0) return { rotulo: "Sem meta", chip: "chip-info" };
  if (atingido >= 1) return { rotulo: "Meta batida", chip: "chip-ok" };
  if (atingido >= ritmo) return { rotulo: "No ritmo", chip: "chip-ok" };
  if (atingido >= ritmo * 0.8) return { rotulo: "Pouco abaixo do ritmo", chip: "chip-alerta" };
  return { rotulo: "Abaixo do ritmo", chip: "chip-erro" };
}

export const pct = (v: number) => `${Math.round(v * 100)}%`;
