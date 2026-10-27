import { LogoMark } from "@/components/logo";
import { Icon } from "@/components/icon";

// Lançamentos ilustrativos que entram um a um e flutuam devagar
const CHIPS = [
  { icon: "inbox" as const, title: "Pix recebido", value: "+ R$ 350,00", positive: true, pos: "top-[4%] -right-[4%]", delay: "900ms", float: "0s" },
  { icon: "receipt" as const, title: "Mercado", value: "− R$ 120,40", positive: false, pos: "top-[40%] -right-[8%]", delay: "1150ms", float: "-2s" },
  { icon: "target" as const, title: "Meta: Viagem", value: "62%", positive: true, pos: "top-[76%] -right-[2%]", delay: "1400ms", float: "-4s" },
];

/** Painel escuro do login: frase com palavra que alterna, saldo ilustrativo e lançamentos flutuando. */
export function LoginHero() {
  return (
    <section className="relative hidden flex-col justify-between gap-10 overflow-hidden border-r border-white/5 bg-[#0c0f0e] p-14 text-[#eef1ef] lg:flex">
      {/* Fundo: grade de pontos que some nas bordas + brilho verde que se move devagar */}
      <div aria-hidden="true" className="login-dots pointer-events-none absolute inset-0" />
      <div aria-hidden="true" className="login-glow pointer-events-none absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full" />

      <div className="page-enter relative flex items-center gap-2.5">
        <LogoMark size={30} animate />
        <span className="font-display text-xl font-semibold tracking-[-0.03em]">cladindin</span>
      </div>

      <div className="relative space-y-8">
        <h1 className="max-w-[480px] font-display text-[clamp(34px,3.2vw,46px)] leading-[1.08] font-semibold tracking-[-0.035em]" style={{ animation: "fade-up 600ms var(--ease-out) 100ms both" }}>
          Suas finanças, num só lugar.
          <span className="mt-1 block h-[1.08em] overflow-hidden text-[#2bc48a]" aria-label="Sem planilha. Sem susto. Sem bagunça.">
            <span className="word-cycle block" aria-hidden="true">
              <span className="block">Sem planilha.</span>
              <span className="block">Sem susto.</span>
              <span className="block">Sem bagunça.</span>
              <span className="block">Sem planilha.</span>
            </span>
          </span>
        </h1>

        <div className="relative mr-16 max-w-[400px]" aria-hidden="true">
          <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm" style={{ animation: "fade-up 700ms var(--ease-out) 300ms both" }}>
            <div className="flex justify-between text-[13px] text-[#9aa39d]">
              <span>Saldo em contas</span>
              <span className="flex items-center gap-1.5">
                <span className="live h-1.5 w-1.5 rounded-full bg-[#2bc48a]" />
                exemplo
              </span>
            </div>
            <p className="font-display text-[34px] font-semibold tracking-[-0.02em] tabular-nums">R$ 12.480,90</p>
            <svg viewBox="0 0 360 70" className="h-[70px] w-full overflow-visible">
              <defs>
                <linearGradient id="login-area" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="#2bc48a" stopOpacity="0.25" />
                  <stop offset="1" stopColor="#2bc48a" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M0,56 40,52 80,54 120,42 160,45 200,33 240,36 280,24 320,27 360,12 L360,70 L0,70Z" fill="url(#login-area)" style={{ animation: "fade-in 900ms ease 1.2s both" }} />
              <polyline className="draw-line" pathLength={1} points="0,56 40,52 80,54 120,42 160,45 200,33 240,36 280,24 320,27 360,12" fill="none" stroke="#2bc48a" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
              <circle cx="360" cy="12" r="4" fill="#2bc48a" style={{ animation: "fade-in 300ms ease 1.5s both" }} />
              <circle cx="360" cy="12" r="4" fill="#2bc48a" className="ping" />
            </svg>
            <div className="flex gap-2 text-[11px] text-[#9aa39d]">
              <span className="rounded-md bg-white/5 px-2 py-1">Receitas R$ 8.200</span>
              <span className="rounded-md bg-white/5 px-2 py-1">Despesas R$ 5.613</span>
            </div>
          </div>

          {CHIPS.map((c) => (
            <div key={c.title} className={`absolute ${c.pos}`} style={{ animation: `chip-in 600ms var(--ease-out) ${c.delay} both` }}>
              <div className="float-slow flex items-center gap-2.5 rounded-xl border border-white/10 bg-[#151917]/95 py-2 pr-3.5 pl-2 shadow-[0_12px_30px_-12px_rgba(0,0,0,0.6)]" style={{ animationDelay: c.float }}>
                <span className={`grid h-7 w-7 place-items-center rounded-lg ${c.positive ? "bg-[#2bc48a]/15 text-[#2bc48a]" : "bg-[#f07a47]/15 text-[#f07a47]"}`}>
                  <Icon name={c.icon} size={15} />
                </span>
                <span className="text-xs leading-tight">
                  <span className="block text-[#9aa39d]">{c.title}</span>
                  <span className="block font-display font-semibold tabular-nums">{c.value}</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <ul className="relative flex gap-6 text-[13px] text-[#9aa39d]" style={{ animation: "fade-in 600ms ease 1.6s both" }}>
        <li className="flex items-center gap-2"><Icon name="inbox" size={15} />Importa OFX, CSV e PDF</li>
        <li className="flex items-center gap-2"><Icon name="receipt" size={15} />Contas a pagar</li>
        <li className="flex items-center gap-2"><Icon name="bank" size={15} />Pessoal e empresa</li>
      </ul>
    </section>
  );
}
