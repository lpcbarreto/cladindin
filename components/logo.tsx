/**
 * Marca Cladindin — "C que cresce": o C abraça uma linha de crescimento verde.
 * Cores vêm de variáveis do tema (--logo-*), então funciona no claro e no escuro.
 */
export function LogoMark({ size = 32, className = "", animate = false }: { size?: number; className?: string; animate?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <rect x="0.5" y="0.5" width="47" height="47" rx="13.5" fill="var(--logo-bg)" stroke="var(--logo-ring)" />
      <path
        d="M32 15.5A12 12 0 1 0 32 32.5"
        fill="none"
        stroke="var(--logo-c)"
        strokeWidth="5"
        strokeLinecap="round"
        pathLength={1}
        className={animate ? "draw-line" : undefined}
      />
      <path
        d="M19 28l5-5 4 3 7-8M30 18h5v5"
        fill="none"
        stroke="var(--logo-up)"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        className={animate ? "draw-line" : undefined}
        style={animate ? { animationDelay: "0.5s" } : undefined}
      />
    </svg>
  );
}

export function Logo({ size = 32, className = "", animate = false }: { size?: number; className?: string; animate?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} animate={animate} />
      <span className="font-display font-semibold tracking-[-0.035em]" style={{ fontSize: size * 0.66 }}>
        cladindin
      </span>
    </span>
  );
}
