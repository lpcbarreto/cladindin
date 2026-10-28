import Link from "next/link";
import type { Metadata } from "next";
import { LEGAL } from "@/lib/legal";
import { PrivacyRequestForm } from "./request-form";

export const metadata: Metadata = { title: "Seus direitos (LGPD) · Cladindin" };

export default function LgpdPage() {
  return (
    <>
      <h1>Seus direitos sobre seus dados</h1>
      <p>
        Pela LGPD (art. 18), você pode pedir confirmação de tratamento, acesso, correção, eliminação, portabilidade, informação sobre compartilhamentos,
        revogação de consentimento e oposição. Respondemos em até 15 dias.
      </p>

      <h2>Se você tem conta</h2>
      <p>Em Configurações › Seus dados, você mesmo faz na hora:</p>
      <ul>
        <li>baixar uma cópia dos seus dados pessoais e de cada workspace (portabilidade e acesso);</li>
        <li>corrigir seu nome e preferências;</li>
        <li>excluir sua conta e todos os workspaces que só você usa (eliminação).</li>
      </ul>
      <p>
        <Link href="/login">Entrar na minha conta</Link>
      </p>

      <h2>Fazer um pedido</h2>
      <p>
        Para os demais pedidos, ou se você não tem conta, use o formulário abaixo ou escreva ao Encarregado ({LEGAL.encarregadoNome}):{" "}
        <a href={`mailto:${LEGAL.encarregadoEmail}`}>{LEGAL.encarregadoEmail}</a>.
      </p>
      <PrivacyRequestForm />

      <p className="text-sm text-muted">
        Se não ficar satisfeito com a resposta, você pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD), em gov.br/anpd.
      </p>
    </>
  );
}
