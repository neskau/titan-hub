"use client";
import { useEffect, useRef, useState } from "react";

/** Mede a largura de um elemento (para desenhar gráficos SVG em pixels reais, com texto legível em qualquer tela). */
export function useLargura<T extends HTMLElement>(inicial = 640) {
  const ref = useRef<T>(null);
  const [largura, setLargura] = useState(inicial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setLargura(Math.max(260, Math.floor(el.clientWidth)));
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, largura };
}
