"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moverEtapa } from "@/app/gestao/funil/acoes";
import { Aviso } from "@/components/gestao/Aviso";
import { brl, linkWhatsapp, num } from "@/lib/formato";
import { DIAS_ALERTA, ETAPAS, type Etapa } from "./constantes";
import { Icone } from "./Icone";
import { ModalMotivo } from "./ModalMotivo";
import type { CardFunil } from "./tipos";

/** Funil em colunas: arrastar (mouse) ou trocar a etapa pelo select do card (teclado/celular). */
export function Kanban({ cards, gestor }: { cards: CardFunil[]; gestor: boolean }) {
  const router = useRouter();
  const [itens, setItens] = useState(cards);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<Etapa | null>(null);
  const [perda, setPerda] = useState<CardFunil | null>(null);
  const [erroPerda, setErroPerda] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [mostrarFechados, setMostrarFechados] = useState(false);
  const [pendente, iniciar] = useTransition();

  useEffect(() => setItens(cards), [cards]);

  const porEtapa = useMemo(() => {
    const m = new Map<Etapa, CardFunil[]>(ETAPAS.map((e) => [e.id, []]));
    for (const c of itens) m.get(c.etapa)?.push(c);
    return m;
  }, [itens]);

  const aplicar = (card: CardFunil, etapa: Etapa, motivo?: string) => {
    const anterior = card.etapa;
    setMsg(null);
    setItens((l) => l.map((c) => (c.id === card.id ? { ...c, etapa } : c)));
    iniciar(async () => {
      const r = await moverEtapa(card.id, etapa, motivo);
      if (r.ok) {
        setPerda(null);
        setMsg({ tipo: "ok", texto: `“${card.titulo}” movida para ${ETAPAS.find((e) => e.id === etapa)?.rotulo}.` });
        router.refresh();
      } else {
        setItens((l) => l.map((c) => (c.id === card.id ? { ...c, etapa: anterior } : c)));
        if (etapa === "perdido") setErroPerda(r.erro);
        else setMsg({ tipo: "erro", texto: r.erro });
      }
    });
  };

  const mover = (id: string, etapa: Etapa) => {
    const card = itens.find((c) => c.id === id);
    if (!card || card.etapa === etapa) return;
    if (etapa === "perdido") {
      setErroPerda(null);
      setPerda(card);
      return;
    }
    aplicar(card, etapa);
  };

  const cancelarPerda = useCallback(() => setPerda(null), []);

  return (
    <div className="flex flex-col gap-3">
      {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <p className="text-suave">Arraste os cards entre as colunas ou use o seletor de etapa em cada card.</p>
        <span className="flex-1" />
        <button type="button" className="btn py-1.5 text-sm" aria-pressed={mostrarFechados} onClick={() => setMostrarFechados((v) => !v)}>
          {mostrarFechados ? "Recolher ganhos e perdidos" : "Mostrar ganhos e perdidos do mês"}
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-3" role="list" aria-label="Etapas do funil">
        {ETAPAS.map((e) => {
          const lista = porEtapa.get(e.id) ?? [];
          const soma = lista.reduce((s, c) => s + (c.valor ?? 0), 0);
          const recolhida = e.fechada && !mostrarFechados;
          const destacada = alvo === e.id && arrastando !== null;
          return (
            <section
              key={e.id}
              role="listitem"
              aria-label={`${e.rotulo}: ${lista.length} oportunidades`}
              className={`flex shrink-0 flex-col rounded-md border bg-white/60 ${recolhida ? "w-[150px]" : "w-[280px]"} ${
                destacada ? "border-titan bg-titan-tinta/60" : "border-linha"
              }`}
              onDragOver={(ev) => {
                if (!arrastando) return;
                ev.preventDefault();
                ev.dataTransfer.dropEffect = "move";
                if (alvo !== e.id) setAlvo(e.id);
              }}
              onDragLeave={(ev) => {
                if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) setAlvo((a) => (a === e.id ? null : a));
              }}
              onDrop={(ev) => {
                ev.preventDefault();
                const id = ev.dataTransfer.getData("text/plain") || arrastando;
                setAlvo(null);
                setArrastando(null);
                if (id) mover(id, e.id);
              }}
            >
              <header className="flex flex-col gap-0.5 border-b border-linha px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${corEtapa(e.id)}`} aria-hidden="true" />
                  <h2 className="text-sm font-semibold">{e.rotulo}</h2>
                  <span className="ml-auto text-xs font-semibold text-suave">{num(lista.length)}</span>
                </div>
                <span className="text-xs text-suave">
                  {brl(soma)}
                  {e.fechada ? " · no mês" : ""}
                </span>
              </header>
              {recolhida ? (
                <p className="flex-1 px-3 py-4 text-center text-xs text-suave">{arrastando ? "Solte aqui" : "Recolhida"}</p>
              ) : (
                <ol className="flex min-h-[120px] flex-1 flex-col gap-2 p-2">
                  {lista.length === 0 && <li className="px-1 py-6 text-center text-xs text-suave">{arrastando ? "Solte aqui" : "Nenhuma oportunidade"}</li>}
                  {lista.map((c) => (
                    <Card
                      key={c.id}
                      card={c}
                      gestor={gestor}
                      desabilitado={pendente}
                      arrastado={arrastando === c.id}
                      onArrastar={(id) => setArrastando(id)}
                      onSoltar={() => {
                        setArrastando(null);
                        setAlvo(null);
                      }}
                      onMover={mover}
                    />
                  ))}
                </ol>
              )}
            </section>
          );
        })}
      </div>

      <ModalMotivo
        aberto={!!perda}
        titulo={perda?.titulo ?? ""}
        pendente={pendente}
        erro={erroPerda}
        onCancelar={cancelarPerda}
        onConfirmar={(motivo) => perda && aplicar(perda, "perdido", motivo)}
      />
    </div>
  );
}

function corEtapa(e: Etapa) {
  return e === "ganho" ? "bg-emerald-600" : e === "perdido" ? "bg-red-600" : e === "novo" || e === "contato" ? "bg-sky-600" : "bg-amber-500";
}

function Card({
  card: c,
  gestor,
  desabilitado,
  arrastado,
  onArrastar,
  onSoltar,
  onMover,
}: {
  card: CardFunil;
  gestor: boolean;
  desabilitado: boolean;
  arrastado: boolean;
  onArrastar: (id: string) => void;
  onSoltar: () => void;
  onMover: (id: string, etapa: Etapa) => void;
}) {
  const aberta = c.etapa !== "ganho" && c.etapa !== "perdido";
  const alerta = aberta && c.diasSemAtividade >= DIAS_ALERTA;
  return (
    <li
      draggable
      onDragStart={(ev) => {
        ev.dataTransfer.setData("text/plain", c.id);
        ev.dataTransfer.effectAllowed = "move";
        onArrastar(c.id);
      }}
      onDragEnd={onSoltar}
      className={`cartao flex cursor-grab flex-col gap-1.5 p-3 text-sm shadow-sm active:cursor-grabbing ${arrastado ? "opacity-50" : ""} ${
        alerta ? "border-l-4 border-l-red-500" : ""
      }`}
    >
      <Link href={`/gestao/oportunidades/${c.id}`} className="font-semibold leading-snug text-grafite hover:text-titan hover:underline [overflow-wrap:anywhere]">
        {c.titulo}
      </Link>
      <span className="text-suave [overflow-wrap:anywhere]">
        {c.nome}
        {c.cidade ? ` · ${c.cidade}` : ""}
      </span>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="font-semibold">{c.valor != null ? brl(c.valor) : "Sem valor"}</span>
        {c.kwp != null && <span className="text-suave">{num(c.kwp, c.kwp % 1 ? 2 : 0)} kWp</span>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {gestor && <span className="chip bg-fundo text-grafite">{c.vendedora ?? "Sem vendedora"}</span>}
        {aberta && (
          <span className={alerta ? "chip-erro" : "chip bg-fundo text-suave"} title="Dias desde a última atividade">
            {c.diasSemAtividade === 0 ? "Atividade hoje" : `${c.diasSemAtividade} ${c.diasSemAtividade === 1 ? "dia" : "dias"} sem atividade`}
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <select
          aria-label={`Etapa de ${c.titulo}`}
          className="campo min-w-0 flex-1 px-2 py-1 text-xs"
          value={c.etapa}
          disabled={desabilitado}
          onChange={(e) => onMover(c.id, e.target.value as Etapa)}
        >
          {ETAPAS.map((e) => (
            <option key={e.id} value={e.id}>
              {e.rotulo}
            </option>
          ))}
        </select>
        {c.telefone && (
          <a
            href={linkWhatsapp(c.telefone, `Olá! Aqui é da Titan Distribuidora Solar.`)}
            target="_blank"
            rel="noreferrer"
            className="btn-whats px-2 py-1 text-xs"
            aria-label={`WhatsApp de ${c.nome}`}
          >
            <Icone tipo="whats" tamanho={14} />
            WhatsApp
          </a>
        )}
      </div>
    </li>
  );
}
