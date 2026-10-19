import { LogoMark } from "@/components/logo";
import { CountUp } from "@/components/count-up";

const HEADLINE = "Seu dindin organizado, sem planilha e sem susto.".split(" ");
const HIGHLIGHTS = [
  "Importe extratos OFX sem duplicar nada",
  "Contas a pagar e a receber num só lugar",
  "Pessoal e empresa separados, com login para cada pessoa",
];

// Moedas caindo: posição, duração, atraso, tamanho e balanço variados (determinístico)
const COINS = Array.from({ length: 12 }, (_, i) => ({
  left: `${(i * 37 + 7) % 96}%`,
  dur: `${8 + ((i * 5) % 7)}s`,
  delay: `${-((i * 1.7) % 9).toFixed(1)}s`,
  size: 14 + ((i * 7) % 18),
  sway: `${((i % 2 ? 1 : -1) * (20 + ((i * 13) % 40))).toFixed(0)}px`,
  opacity: 0.35 + ((i * 3) % 5) / 10,
}));

const BARS = [38, 62, 45, 80, 58, 92];

/** Painel verde do login: tudo decorativo (aria-hidden), exceto o texto. */
export function LoginHero() {
  return (
    <section className="relative hidden overflow-hidden bg-primary p-12 text-primary-fg lg:flex lg:flex-col lg:justify-between">
      {/* Fundo: manchas orgânicas e moedas caindo */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="blob absolute -top-24 -left-20 h-80 w-80 bg-primary-fg/10" />
        <div className="blob absolute -right-28 -bottom-28 h-[26rem] w-[26rem] bg-accent/20" style={{ animationDelay: "-6s" }} />
        {COINS.map((c, i) => (
          <span
            key={i}
            className="coin-fall absolute top-0"
            style={
              {
                left: c.left,
                "--dur": c.dur,
                "--delay": c.delay,
                "--sway": c.sway,
                opacity: c.opacity,
              } as React.CSSProperties
            }
          >
            <svg width={c.size} height={c.size} viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="11" fill="var(--accent)" />
              <circle cx="12" cy="12" r="7.5" fill="none" stroke="#7a5200" strokeOpacity=".35" strokeWidth="1.5" />
              <text x="12" y="16" textAnchor="middle" fontSize="10" fontWeight="900" fill="#7a5200" fillOpacity=".55">
                $
              </text>
            </svg>
          </span>
        ))}
      </div>

      <div className="relative z-10 flex items-center gap-2 text-2xl font-extrabold tracking-tight">
        <span className="coin-hover rounded-full bg-primary-fg/15 p-1">
          <LogoMark size={36} />
        </span>
        cladindin
      </div>

      <div className="relative z-10 grid items-center gap-10 xl:grid-cols-[1fr_auto]">
        <div className="max-w-md space-y-6">
          <h1 className="text-4xl leading-tight font-extrabold">
            {HEADLINE.map((w, i) => (
              <span key={i} className="word-in mr-[0.25em]" style={{ animationDelay: `${150 + i * 70}ms` }}>
                {w}
              </span>
            ))}
          </h1>
          <ul className="space-y-3 text-base">
            {HIGHLIGHTS.map((h, i) => (
              <li key={h} className="word-in flex items-start gap-3" style={{ animationDelay: `${800 + i * 160}ms` }}>
                <span
                  className="check-pop mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent text-xs font-black text-foreground"
                  style={{ animationDelay: `${950 + i * 160}ms` }}
                  aria-hidden="true"
                >
                  ✓
                </span>
                {h}
              </li>
            ))}
          </ul>
        </div>

        {/* Mini painel flutuante (ilustração) */}
        <div aria-hidden="true" className="float-card hidden w-64 xl:block">
          <div className="rounded-3xl bg-surface p-5 text-foreground shadow-2xl" style={{ animation: "pop-in 600ms var(--ease-spring) 600ms both" }}>
            <p className="text-xs font-semibold text-muted">Saldo do mês</p>
            <CountUp cents={482350} duration={1800} className="block text-2xl font-extrabold tabular-nums" />
            <svg viewBox="0 0 200 60" className="mt-3 h-14 w-full">
              <path
                className="draw-line"
                style={{ animationDelay: "900ms" }}
                d="M2 50 C 30 46, 40 30, 62 34 S 100 12, 120 22 S 160 8, 198 6"
                fill="none"
                stroke="var(--series-income)"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
            <div className="mt-3 flex h-16 items-end gap-2">
              {BARS.map((h, i) => (
                <span
                  key={i}
                  className="bar-rise flex-1 rounded-t-md"
                  style={{
                    height: `${h}%`,
                    background: i % 2 ? "var(--series-expense)" : "var(--series-income)",
                    animationDelay: `${1100 + i * 90}ms`,
                  }}
                />
              ))}
            </div>
          </div>
          <div
            className="-mt-4 ml-10 flex w-fit items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-xs font-bold text-foreground shadow-xl"
            style={{ animation: "pop-in 500ms var(--ease-spring) 2.1s both" }}
          >
            <span className="pulse-ring grid h-4 w-4 place-items-center rounded-full bg-accent text-[10px]">✓</span>
            Fatura importada
          </div>
        </div>
      </div>

      <p className="word-in relative z-10 text-sm opacity-75" style={{ animationDelay: "1.4s" }}>
        Finanças pessoais e da sua pequena empresa.
      </p>
    </section>
  );
}
