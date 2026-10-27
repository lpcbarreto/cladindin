"use client";

import { useRef, useState } from "react";

type Tip = { x: number; y: number; title: string; rows: [string, string, string][] };

/**
 * Camada de hover dos gráficos (~1 kB): qualquer filho com data-tip='{"t":"título","r":[["cor","nome","valor"]]}'
 * mostra o tooltip; data-col marca a coluna sob o cursor (faixa de destaque).
 */
export function ChartHover({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);

  function onMove(e: React.PointerEvent) {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-tip]");
    const box = ref.current?.getBoundingClientRect();
    if (!el || !box) return setTip(null);
    try {
      const d = JSON.parse(el.dataset.tip!) as { t: string; r: [string, string, string][] };
      setTip({ x: e.clientX - box.left, y: e.clientY - box.top, title: d.t, rows: d.r });
    } catch {
      setTip(null);
    }
  }

  const flip = tip && ref.current && tip.x > ref.current.clientWidth - 180;
  return (
    <div ref={ref} className={`relative ${className ?? ""}`} onPointerMove={onMove} onPointerLeave={() => setTip(null)}>
      {children}
      {tip && (
        <div
          role="status"
          className="pointer-events-none absolute z-10 min-w-36 rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-lg"
          style={{ left: flip ? tip.x - 12 : tip.x + 12, top: Math.max(0, tip.y - 12), transform: flip ? "translateX(-100%)" : undefined }}
        >
          <p className="mb-1 font-bold text-foreground">{tip.title}</p>
          {tip.rows.map(([color, name, value]) => (
            <p key={name} className="flex items-center gap-2 text-foreground">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
              {name}: <b className="ml-auto tabular-nums">{value}</b>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
