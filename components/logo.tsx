/** Marca Cladindin: quadrado arredondado verde com o "c" fechando como uma moeda. */
export function LogoMark({ size = 32, className = "", animate = false }: { size?: number; className?: string; animate?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" className={className}>
      <rect width="40" height="40" rx="11" fill="var(--brand)" />
      <path
        d="M26 14.5a8 8 0 1 0 0 11"
        fill="none"
        stroke="var(--primary-fg)"
        strokeWidth="4"
        strokeLinecap="round"
        pathLength={1}
        className={animate ? "draw-line" : undefined}
      />
      <circle cx="29" cy="20" r="2.4" fill="var(--primary-fg)" />
    </svg>
  );
}

export function Logo({ size = 32, className = "", animate = false }: { size?: number; className?: string; animate?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} animate={animate} />
      <span className="font-display font-semibold tracking-[-0.03em]" style={{ fontSize: size * 0.66 }}>
        cladindin
      </span>
    </span>
  );
}
