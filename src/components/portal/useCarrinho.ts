"use client";
import { useCallback, useEffect, useMemo, useState } from "react";

export interface ItemCarrinho {
  produto_id: string;
  sku: string;
  nome: string;
  marca: string;
  unidade: string;
  preco: number | null;     // preço visto no momento em que entrou no carrinho (o pedido usa o preço do banco)
  quantidade: number;
}

const EVENTO = "titan:carrinho";
const chave = (cd: string) => `titan:carrinho:${cd}`;

// Cópia em memória para quando o navegador bloqueia o localStorage (aba anônima, cookies bloqueados).
const memoria = new Map<string, ItemCarrinho[]>();

function valido(x: unknown): x is ItemCarrinho {
  if (!x || typeof x !== "object") return false;
  const i = x as Record<string, unknown>;
  return typeof i.produto_id === "string" && typeof i.nome === "string" && typeof i.quantidade === "number" && i.quantidade > 0;
}

function ler(cd: string): ItemCarrinho[] {
  try {
    const bruto = window.localStorage.getItem(chave(cd));
    if (bruto == null) return memoria.get(cd) ?? [];
    const v: unknown = JSON.parse(bruto);
    return Array.isArray(v) ? v.filter(valido) : [];
  } catch {
    return memoria.get(cd) ?? [];
  }
}

function gravar(cd: string, itens: ItemCarrinho[]) {
  memoria.set(cd, itens);
  try {
    window.localStorage.setItem(chave(cd), JSON.stringify(itens));
  } catch {
    // sem localStorage: segue só com a memória desta aba
  }
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: cd }));
}

/** Carrinho do integrador, separado por CD e guardado no navegador. */
export function useCarrinho(cd: string) {
  const [itens, setItens] = useState<ItemCarrinho[]>([]);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    const sincronizar = () => setItens(ler(cd));
    const aoArmazenar = (e: StorageEvent) => {
      if (e.key === chave(cd)) sincronizar();
    };
    sincronizar();
    setPronto(true);
    window.addEventListener(EVENTO, sincronizar);
    window.addEventListener("storage", aoArmazenar);
    return () => {
      window.removeEventListener(EVENTO, sincronizar);
      window.removeEventListener("storage", aoArmazenar);
    };
  }, [cd]);

  const alterar = useCallback((fn: (atual: ItemCarrinho[]) => ItemCarrinho[]) => gravar(cd, fn(ler(cd))), [cd]);

  const adicionar = useCallback(
    (item: Omit<ItemCarrinho, "quantidade">, quantidade: number) => {
      const q = Math.max(1, Math.floor(quantidade));
      alterar((atual) => {
        const existe = atual.find((i) => i.produto_id === item.produto_id);
        if (existe) return atual.map((i) => (i.produto_id === item.produto_id ? { ...i, ...item, quantidade: i.quantidade + q } : i));
        return [...atual, { ...item, quantidade: q }];
      });
    },
    [alterar]
  );

  const definirQuantidade = useCallback(
    (produtoId: string, quantidade: number) => {
      const q = Math.floor(quantidade);
      alterar((atual) =>
        q <= 0 ? atual.filter((i) => i.produto_id !== produtoId) : atual.map((i) => (i.produto_id === produtoId ? { ...i, quantidade: q } : i))
      );
    },
    [alterar]
  );

  const remover = useCallback((produtoId: string) => alterar((atual) => atual.filter((i) => i.produto_id !== produtoId)), [alterar]);
  const limpar = useCallback(() => alterar(() => []), [alterar]);

  /** Atualiza o preço de referência dos itens com o valor atual do catálogo. */
  const atualizarPrecos = useCallback(
    (precos: Record<string, number | null>) =>
      alterar((atual) => atual.map((i) => (i.produto_id in precos ? { ...i, preco: precos[i.produto_id] } : i))),
    [alterar]
  );

  const resumo = useMemo(() => {
    const totalItens = itens.reduce((s, i) => s + i.quantidade, 0);
    const semPreco = itens.some((i) => i.preco == null);
    const subtotal = Math.round(itens.reduce((s, i) => s + (i.preco ?? 0) * i.quantidade, 0) * 100) / 100;
    return { totalItens, subtotal, semPreco };
  }, [itens]);

  return { itens, pronto, adicionar, definirQuantidade, remover, limpar, atualizarPrecos, ...resumo };
}
