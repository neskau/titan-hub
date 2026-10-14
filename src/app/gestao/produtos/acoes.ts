"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { supabaseServidor } from "@/lib/supabase/server";
import { mensagemErro, sessaoAcao } from "@/components/gestao/servidor";

export type Resultado = { ok: true; id: string; msg?: string } | { ok: false; erro: string };

const CATEGORIAS = ["Módulos", "Inversores", "Microinversores", "Estruturas", "Elétrica", "Baterias"] as const;
const TELHADOS = ["ceramica", "metalica", "fibrocimento", "solo", "laje"] as const;

/** Texto vazio vira null; aceita vírgula decimal. */
const numeroOpcional = (rotulo: string, inteiro: boolean) =>
  z
    .string()
    .trim()
    .transform((s) => (s === "" ? null : Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s)))
    .refine((n) => n === null || (Number.isFinite(n) && n > 0), `${rotulo}: informe um número maior que zero.`)
    .refine((n) => n === null || !inteiro || Number.isInteger(n), `${rotulo}: use um número inteiro.`);

const Produto = z
  .object({
    id: z.union([z.literal(""), z.string().uuid()]),
    sku: z
      .string()
      .trim()
      .min(2, "Informe o SKU.")
      .max(60, "SKU muito longo.")
      .regex(/^[A-Za-z0-9._\-/]+$/, "SKU: use letras, números, ponto, hífen, barra ou sublinhado (sem espaços)."),
    nome: z.string().trim().min(3, "Informe o nome do produto.").max(200, "Nome muito longo."),
    marca: z.string().trim().min(1, "Informe a marca.").max(80, "Marca muito longa."),
    categoria: z.enum(CATEGORIAS, { errorMap: () => ({ message: "Escolha a categoria." }) }),
    especificacao: z.string().trim().max(500, "Especificação muito longa."),
    unidade: z.string().trim().min(1, "Informe a unidade.").max(10, "Unidade muito longa."),
    imagem_path: z.string().trim().max(300, "Caminho da imagem muito longo."),
    potencia_w: numeroOpcional("Potência (W)", true),
    potencia_kw: numeroOpcional("Potência (kW)", false),
    fase: z.enum(["", "mono", "tri"], { errorMap: () => ({ message: "Fase inválida." }) }),
    modulos_por_estrutura: numeroOpcional("Módulos por estrutura", true),
    tipo_telhado: z.enum(["", ...TELHADOS], { errorMap: () => ({ message: "Tipo de telhado inválido." }) }),
    preco: z
      .string()
      .trim()
      .transform((s) => (s === "" ? null : Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s)))
      .refine((n) => n === null || (Number.isFinite(n) && n >= 0 && n < 100_000_000), "Preço inválido."),
    ativo: z.boolean(),
  })
  .superRefine((d, ctx) => {
    if (d.categoria === "Módulos" && d.potencia_w == null) ctx.addIssue({ code: "custom", message: "Informe a potência do módulo (W)." });
    if ((d.categoria === "Inversores" || d.categoria === "Microinversores") && d.potencia_kw == null)
      ctx.addIssue({ code: "custom", message: "Informe a potência do inversor (kW)." });
    if ((d.categoria === "Inversores" || d.categoria === "Microinversores") && !d.fase)
      ctx.addIssue({ code: "custom", message: "Informe se o inversor é monofásico ou trifásico." });
    if (d.categoria === "Estruturas" && d.modulos_por_estrutura == null)
      ctx.addIssue({ code: "custom", message: "Informe quantos módulos a estrutura comporta." });
    if (d.categoria === "Estruturas" && !d.tipo_telhado) ctx.addIssue({ code: "custom", message: "Escolha o tipo de telhado da estrutura." });
  });

function revalidar(id?: string) {
  revalidatePath("/gestao/produtos");
  if (id) revalidatePath(`/gestao/produtos/${id}`);
  revalidatePath("/gestao/estoque");
  revalidatePath("/portal");
  revalidatePath("/catalogo");
}

/** Cria ou atualiza o produto, grava o preço base e (na criação) abre o estoque zerado nos CDs ativos. */
export async function salvarProduto(entrada: unknown): Promise<Resultado> {
  if (!(await sessaoAcao())) return { ok: false, erro: "Sua sessão expirou ou você não tem acesso." };
  const v = Produto.safeParse(entrada);
  if (!v.success) return { ok: false, erro: v.error.issues[0]?.message ?? "Dados inválidos." };
  const d = v.data;
  const inversor = d.categoria === "Inversores" || d.categoria === "Microinversores";

  // Só grava os campos técnicos que valem para a categoria; os demais ficam nulos.
  const linha = {
    sku: d.sku,
    nome: d.nome,
    marca: d.marca,
    categoria: d.categoria,
    especificacao: d.especificacao || null,
    unidade: d.unidade,
    imagem_path: d.imagem_path || null,
    potencia_w: d.categoria === "Módulos" ? d.potencia_w : null,
    potencia_kw: inversor ? d.potencia_kw : null,
    fase: inversor ? d.fase || null : null,
    modulos_por_estrutura: d.categoria === "Estruturas" ? d.modulos_por_estrutura : null,
    tipo_telhado: d.categoria === "Estruturas" ? d.tipo_telhado || null : null,
    ativo: d.ativo,
    atualizado_em: new Date().toISOString(),
  };

  const sb = supabaseServidor();
  let id = d.id;
  if (id) {
    const { data, error } = await sb.from("produtos").update(linha).eq("id", id).select("id");
    if (error) return { ok: false, erro: /unique|duplicate/i.test(error.message) ? "Já existe um produto com este SKU." : mensagemErro(error.message) };
    if (!data || data.length === 0) return { ok: false, erro: "Produto não encontrado." };
  } else {
    const { data, error } = await sb.from("produtos").insert(linha).select("id").single();
    if (error || !data) return { ok: false, erro: error && /unique|duplicate/i.test(error.message) ? "Já existe um produto com este SKU." : mensagemErro(error?.message) };
    id = data.id as string;
    const { data: cds } = await sb.from("cds").select("id").eq("ativo", true);
    if (cds && cds.length > 0) {
      const { error: errEst } = await sb
        .from("estoque")
        .upsert(
          cds.map((c) => ({ produto_id: id, cd_id: c.id as string, quantidade: 0, minimo: 0 })),
          { onConflict: "produto_id,cd_id", ignoreDuplicates: true }
        );
      if (errEst) return { ok: false, erro: "Produto criado, mas não foi possível abrir o estoque nos CDs. Ajuste em Estoque por CD." };
    }
  }

  if (d.preco != null) {
    const { error } = await sb
      .from("precos")
      .upsert({ produto_id: id, preco_base: Math.round(d.preco * 100) / 100, atualizado_em: new Date().toISOString() }, { onConflict: "produto_id" });
    if (error) return { ok: false, erro: "Produto salvo, mas o preço não foi gravado. Tente salvar de novo." };
  }

  revalidar(id);
  return { ok: true, id, msg: d.id ? "Produto atualizado." : "Produto cadastrado." };
}

const Datasheet = z.object({
  id: z.string().uuid("Produto inválido."),
  path: z.union([z.literal(""), z.string().max(300).regex(/^produtos\/[0-9a-f-]{36}\/[A-Za-z0-9._-]+\.pdf$/, "Caminho do datasheet inválido.")]),
});

/** Grava (ou limpa) o caminho do datasheet depois do upload feito pelo navegador no bucket 'datasheets'. */
export async function definirDatasheet(entrada: unknown): Promise<Resultado> {
  if (!(await sessaoAcao())) return { ok: false, erro: "Sua sessão expirou ou você não tem acesso." };
  const v = Datasheet.safeParse(entrada);
  if (!v.success) return { ok: false, erro: v.error.issues[0]?.message ?? "Dados inválidos." };
  const { id, path } = v.data;
  if (path && !path.startsWith(`produtos/${id}/`)) return { ok: false, erro: "O arquivo não pertence a este produto." };
  const { error } = await supabaseServidor()
    .from("produtos")
    .update({ datasheet_path: path || null, atualizado_em: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, erro: mensagemErro(error.message) };
  revalidar(id);
  return { ok: true, id, msg: path ? "Datasheet enviado." : "Datasheet removido do produto." };
}
