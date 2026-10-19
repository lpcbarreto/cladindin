"use client";

import { useEffect, useRef, useState } from "react";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Valor em reais que "conta" até o número final ao aparecer.
 * Respeita "reduzir movimento" e mostra o valor final para leitores de tela desde o início.
 */
export function CountUp({ cents, duration = 900, className }: { cents: number; duration?: number; className?: string }) {
  const [shown, setShown] = useState(cents);
  const from = useRef(0);

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(cents);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(origin + (cents - origin) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = cents;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cents, duration]);

  return (
    <span className={className}>
      <span aria-hidden="true">{brl.format(shown / 100)}</span>
      <span className="sr-only">{brl.format(cents / 100)}</span>
    </span>
  );
}
