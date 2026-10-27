import { LogoMark } from "@/components/logo";

/** Painel escuro do login: marca, frase e um cartão de saldo ilustrativo com a linha se desenhando. */
export function LoginHero() {
  return (
    <section className="relative hidden flex-col justify-between overflow-hidden bg-[#111614] p-14 text-[#eef1ef] lg:flex">
      <div className="page-enter flex items-center gap-2.5">
        <LogoMark size={30} animate />
        <span className="font-display text-xl font-semibold tracking-[-0.03em]">cladindin</span>
      </div>

      <div className="stagger space-y-7">
        <h1 className="max-w-[460px] font-display text-[44px] leading-[1.1] font-semibold tracking-[-0.03em]">
          Suas finanças, num só lugar. Sem planilha.
        </h1>
        <div className="max-w-[400px] space-y-3.5 rounded-[14px] border border-[#262c29] bg-[#181d1b] px-5 py-5" aria-hidden="true">
          <div className="flex justify-between text-[13px] text-[#9aa39d]">
            <span>Saldo em contas</span>
            <span className="flex items-center gap-1.5">
              <span className="live h-1.5 w-1.5 rounded-full bg-[#2bc48a]" />
              exemplo
            </span>
          </div>
          <p className="font-display text-[32px] font-semibold tracking-[-0.02em] tabular-nums">R$ 12.480,90</p>
          <svg viewBox="0 0 360 60" className="h-[60px] w-full">
            <polyline
              className="draw-line"
              pathLength={1}
              points="0,48 40,44 80,46 120,36 160,38 200,28 240,30 280,20 320,22 360,10"
              fill="none"
              stroke="#2bc48a"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>

      <ul className="flex gap-6 text-[13px] text-[#9aa39d]" style={{ animation: "fade-in 600ms ease 400ms both" }}>
        <li>Importa OFX, CSV e PDF</li>
        <li>Contas a pagar</li>
        <li>Pessoal e empresa</li>
      </ul>
    </section>
  );
}
