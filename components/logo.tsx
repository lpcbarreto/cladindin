/** Marca Cladindin: moeda sorridente com "c" + nome em minúsculas. */
export function LogoMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <circle cx="32" cy="32" r="30" fill="var(--primary)" />
      <circle cx="32" cy="32" r="24" fill="none" stroke="var(--primary-fg)" strokeOpacity=".25" strokeWidth="2" strokeDasharray="3 5" />
      {/* "c" formando um sorriso */}
      <path d="M41 24.5a12 12 0 1 0 0 15" fill="none" stroke="var(--primary-fg)" strokeWidth="6" strokeLinecap="round" />
      <circle cx="47" cy="17" r="5" fill="var(--accent)" />
    </svg>
  );
}

export function Logo({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`group inline-flex items-center gap-2 ${className}`}>
      <span className="coin-hover inline-flex">
        <LogoMark size={size} />
      </span>
      <span className="wave font-extrabold tracking-tight" style={{ fontSize: size * 0.62 }} aria-label="cladindin">
        {"cladindin".split("").map((ch, i) => (
          <span key={i} aria-hidden="true" className={`inline-block ${i >= 6 ? "text-primary" : ""}`} style={{ animationDelay: `${i * 40}ms` }}>
            {ch}
          </span>
        ))}
      </span>
    </span>
  );
}
