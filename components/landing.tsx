import Link from "next/link";
import { Logo, LogoMark } from "@/components/logo";
import { Icon, type IconName } from "@/components/icon";
import { ThemeToggle } from "@/components/theme-toggle";
import { LegalFooter } from "@/components/legal-footer";
import { LEGAL } from "@/lib/legal";
import { FAQ } from "@/lib/faq";

// Só funções que existem no sistema; nada de depoimentos, números de clientes ou promessas.
const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: "inbox", title: "Importe extratos", text: "OFX, CSV e PDF de bancos e cartões, com revisão antes de gravar e sem duplicar o que já foi importado." },
  { icon: "receipt", title: "Contas a pagar e receber", text: "Vencimentos, baixas parciais, juros, descontos e comprovantes anexados a cada lançamento." },
  { icon: "repeat", title: "Recorrências", text: "Aluguel, salário e assinaturas cadastrados uma vez; os próximos meses são criados para você." },
  { icon: "bank", title: "Cartões e faturas", text: "Cada compra cai na fatura certa, parcelas futuras são projetadas e o pagamento não conta em dobro." },
  { icon: "chart", title: "Relatórios", text: "Fluxo de caixa, categorias, comparativo mês a mês, DRE simplificado e apoio para o Imposto de Renda." },
  { icon: "target", title: "Metas e projeção", text: "Quanto guardar por mês para cada objetivo e quando o saldo pode ficar negativo." },
];

const SECURITY = [
  "Cada workspace é visível só para quem você convidar.",
  "Verificação em duas etapas opcional.",
  "Sem venda de dados, sem publicidade e sem rastreamento.",
  "Baixe seus dados ou exclua a conta quando quiser.",
];

export function Landing() {
  return (
    <div className="min-h-dvh">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm">
        Pular para o conteúdo
      </a>
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Logo size={26} />
          <nav aria-label="Principal" className="flex items-center gap-2 text-sm">
            <Link href="/ajuda" className="hidden rounded-lg px-3 py-2 text-muted hover:text-foreground sm:inline">
              Ajuda
            </Link>
            <Link href="/login" className="btn-ghost">
              Entrar
            </Link>
            <Link href="/login?modo=cadastrar" className="btn">
              Criar conta
            </Link>
          </nav>
        </div>
      </header>

      <main id="conteudo">
        {/* Abertura */}
        <section className="relative overflow-hidden">
          <div aria-hidden="true" className="login-dots pointer-events-none absolute inset-0 opacity-60 dark:opacity-100" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 md:grid-cols-2 md:py-24">
            <div className="stagger space-y-6">
              <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
                <span className="live h-1.5 w-1.5 rounded-full bg-brand" />
                Finanças pessoais e da sua pequena empresa
              </p>
              <h1 className="font-display text-[clamp(36px,5vw,56px)] leading-[1.05] font-semibold tracking-[-0.035em]">
                Suas finanças, num só lugar. <span className="text-primary">Sem planilha.</span>
              </h1>
              <p className="max-w-lg text-lg text-muted">
                Importe extratos, controle contas a pagar, cartões e metas, e veja relatórios claros do seu dinheiro.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/login?modo=cadastrar" className="group btn h-11 px-5 text-[15px]">
                  Criar minha conta
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-1">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </Link>
                <a href="#funcoes" className="btn-ghost h-11 px-5 text-[15px]">
                  Ver funções
                </a>
              </div>
            </div>

            <div className="relative" aria-hidden="true" style={{ animation: "fade-up 700ms var(--ease-out) 200ms both" }}>
              <div className="card space-y-4 p-6">
                <div className="flex justify-between text-[13px] text-muted">
                  <span>Saldo em contas</span>
                  <span>Valores ilustrativos</span>
                </div>
                <p className="font-display text-[34px] font-semibold tracking-[-0.02em] tabular-nums">R$ 12.480,90</p>
                <svg viewBox="0 0 360 70" className="h-[70px] w-full overflow-visible">
                  <polyline className="draw-line" pathLength={1} points="0,56 40,52 80,54 120,42 160,45 200,33 240,36 280,24 320,27 360,12" fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                  <circle cx="360" cy="12" r="4" fill="var(--brand)" className="ping" />
                </svg>
                <ul className="divide-y divide-border text-sm">
                  {[
                    ["28/10", "Aluguel", "R$ 1.800,00"],
                    ["30/10", "Energia", "R$ 187,32"],
                    ["05/11", "Fatura do cartão", "R$ 1.245,10"],
                  ].map(([d, t, v]) => (
                    <li key={t} className="flex justify-between gap-3 py-2">
                      <span className="text-muted tabular-nums">{d}</span>
                      <span className="flex-1">{t}</span>
                      <span className="tabular-nums">{v}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Funções */}
        <section id="funcoes" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16">
          <h2 className="font-display text-3xl font-semibold tracking-[-0.02em]">O que você faz no Cladindin</h2>
          <div className="stagger mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="card lift space-y-2">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary">
                  <Icon name={f.icon} size={20} />
                </span>
                <h3 className="pt-1 text-base font-semibold">{f.title}</h3>
                <p className="text-sm text-muted">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Privacidade */}
        <section className="border-y border-border bg-surface">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 md:grid-cols-2">
            <div className="space-y-3">
              <h2 className="font-display text-3xl font-semibold tracking-[-0.02em]">Seus dados são seus</h2>
              <p className="text-muted">
                Tratamos seus dados conforme a LGPD e explicamos tudo em linguagem simples na{" "}
                <Link href="/privacidade" className="text-primary underline underline-offset-2">
                  Política de Privacidade
                </Link>
                .
              </p>
            </div>
            <ul className="space-y-3">
              {SECURITY.map((s) => (
                <li key={s} className="flex items-start gap-3">
                  <Icon name="check" size={18} className="mt-0.5 text-primary" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Preço */}
        <section className="mx-auto max-w-6xl px-4 py-16">
          <div className="card mx-auto max-w-md space-y-4 p-8 text-center">
            <LogoMark size={36} className="mx-auto" />
            <h2 className="font-display text-2xl font-semibold">Assinatura Cladindin</h2>
            <p className="font-display text-3xl font-semibold tabular-nums">{LEGAL.preco}</p>
            <ul className="space-y-2 text-left text-sm">
              <li className="flex gap-2"><Icon name="check" size={16} className="mt-0.5 text-primary" />Todas as funções, sem limite de workspaces</li>
              <li className="flex gap-2"><Icon name="check" size={16} className="mt-0.5 text-primary" />Desista em até 7 dias e receba o valor de volta</li>
              <li className="flex gap-2"><Icon name="check" size={16} className="mt-0.5 text-primary" />Cancele quando quiser, sem multa</li>
            </ul>
            <Link href="/login?modo=cadastrar" className="btn h-11 w-full text-[15px]">
              Criar minha conta
            </Link>
            <p className="text-xs text-muted">
              Veja a{" "}
              <Link href="/reembolso" className="underline">
                Política de Reembolso e Cancelamento
              </Link>
              .
            </p>
          </div>
        </section>

        {/* Perguntas */}
        <section className="mx-auto max-w-3xl px-4 pb-20">
          <h2 className="font-display text-3xl font-semibold tracking-[-0.02em]">Perguntas frequentes</h2>
          <div className="mt-6 divide-y divide-border rounded-[14px] border border-border bg-surface">
            {FAQ.slice(0, 6).map((f) => (
              <details key={f.q} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {f.q}
                  <span aria-hidden="true" className="text-muted transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2 text-sm text-muted">{f.a}</p>
              </details>
            ))}
          </div>
          <p className="mt-4 text-sm">
            <Link href="/ajuda" className="text-primary underline underline-offset-2">
              Ver todas as perguntas na Central de Ajuda
            </Link>
          </p>
        </section>
      </main>

      <div className="mx-auto max-w-6xl px-4 pb-10">
        <div className="mb-6 flex justify-end">
          <div className="w-32">
            <ThemeToggle />
          </div>
        </div>
        <LegalFooter />
      </div>
    </div>
  );
}
