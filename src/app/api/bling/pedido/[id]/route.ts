import { NextResponse } from "next/server";
import { obterSessao } from "@/lib/sessao";
import { comLog, enviarPedido, respostaErro } from "@/lib/bling";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Equipe logada envia um pedido do Titan para o Bling (pedido de venda). */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ ok: false, erro: "Faça login" }, { status: 401 });
  if (!["vendedora", "gestor", "admin"].includes(sessao.perfil.papel)) {
    return NextResponse.json({ ok: false, erro: "Apenas a equipe Titan pode enviar pedidos ao Bling" }, { status: 403 });
  }
  if (!UUID.test(params.id)) return NextResponse.json({ ok: false, erro: "Pedido inválido" }, { status: 400 });

  try {
    const r = await comLog("pedido", () => enviarPedido(params.id));
    return NextResponse.json({ ok: true, bling_pedido_id: r.bling_pedido_id, mensagem: r.mensagem });
  } catch (e) {
    return respostaErro(e);
  }
}
