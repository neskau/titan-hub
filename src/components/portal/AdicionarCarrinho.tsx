"use client";
import { useEffect, useState } from "react";
import { useCarrinho, type ItemCarrinho } from "./useCarrinho";

/** Quantidade + "Adicionar ao carrinho" de um produto no CD atual. */
export function AdicionarCarrinho({
  cd,
  produto,
  estoque,
}: {
  cd: string;
  produto: Omit<ItemCarrinho, "quantidade">;
  estoque: number | null;
}) {
  const { itens, adicionar } = useCarrinho(cd);
  const [qtd, setQtd] = useState(1);
  const [ok, setOk] = useState(false);
  const noCarrinho = itens.find((i) => i.produto_id === produto.produto_id)?.quantidade ?? 0;
  const semEstoque = estoque != null && estoque <= 0;
  const max = estoque != null ? Math.max(estoque - noCarrinho, 0) : undefined;

  useEffect(() => {
    if (!ok) return;
    const t = setTimeout(() => setOk(false), 1800);
    return () => clearTimeout(t);
  }, [ok]);

  if (semEstoque) {
    return (
      <button className="btn w-full" disabled>
        Sem estoque neste CD
      </button>
    );
  }

  const excede = max != null && qtd > max;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <label className="sr-only" htmlFor={`qtd-${produto.produto_id}`}>
          Quantidade
        </label>
        <input
          id={`qtd-${produto.produto_id}`}
          type="number"
          inputMode="numeric"
          min={1}
          max={max}
          value={qtd}
          onChange={(e) => setQtd(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
          className="campo w-20 shrink-0 text-center"
        />
        <button
          className="btn-primario flex-1 px-3"
          disabled={excede}
          onClick={() => {
            adicionar(produto, qtd);
            setQtd(1);
            setOk(true);
          }}
        >
          {ok ? "Adicionado" : "Adicionar ao carrinho"}
        </button>
      </div>
      {(noCarrinho > 0 || excede) && (
        <p className={`text-xs ${excede ? "text-red-700" : "text-suave"}`}>
          {excede ? `Só há ${max} ${produto.unidade} disponíveis além do que já está no carrinho.` : `${noCarrinho} ${produto.unidade} no carrinho`}
        </p>
      )}
    </div>
  );
}
