import Link from "next/link";
import type { Metadata } from "next";
import { FAQ, FAQ_TOPICS, type Faq } from "@/lib/faq";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Central de Ajuda · Cladindin", description: "Perguntas frequentes sobre o Cladindin." };

export default function HelpPage() {
  const topics = Object.keys(FAQ_TOPICS) as Faq["topic"][];
  return (
    <>
      <h1>Central de Ajuda</h1>
      <p>Respostas rápidas sobre como usar o Cladindin. Não achou o que precisava? Fale com a gente no fim da página.</p>

      <nav aria-label="Assuntos" className="flex flex-wrap gap-2 not-prose">
        {topics.map((t) => (
          <a key={t} href={`#${t}`} className="rounded-full border border-border px-3 py-1 text-sm no-underline">
            {FAQ_TOPICS[t]}
          </a>
        ))}
      </nav>

      {topics.map((t) => (
        <section key={t} id={t} className="scroll-mt-6 space-y-2">
          <h2>{FAQ_TOPICS[t]}</h2>
          <div className="divide-y divide-border rounded-[14px] border border-border bg-surface">
            {FAQ.filter((f) => f.topic === t).map((f) => (
              <details key={f.q} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {f.q}
                  <span aria-hidden="true" className="text-muted transition group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-2 text-sm text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      ))}

      <h2>Fale com a gente</h2>
      <p>
        Escreva para <a href={`mailto:${LEGAL.emailContato}`}>{LEGAL.emailContato}</a> contando o que aconteceu e, se possível, a página em que estava.
        Respondemos em até 5 dias úteis. Assuntos de privacidade vão pela página <Link href="/lgpd">Seus direitos (LGPD)</Link>.
      </p>
    </>
  );
}
