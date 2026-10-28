import type { Metadata } from "next";
import { LEGAL, formatVersion } from "@/lib/legal";

export const metadata: Metadata = { title: "Reembolso e cancelamento · Cladindin" };

export default function RefundPage() {
  return (
    <>
      <h1>Política de Reembolso e Cancelamento</h1>
      <p className="text-sm text-muted">Versão de {formatVersion(LEGAL.versao)}</p>

      <h2>1. Direito de arrependimento (7 dias)</h2>
      <p>
        Como a contratação é feita pela internet, você pode desistir em até 7 dias corridos a partir da contratação ou da primeira cobrança, sem precisar
        explicar o motivo (Código de Defesa do Consumidor, art. 49). Nesse caso devolvemos o valor pago integralmente, pelo mesmo meio de pagamento.
      </p>

      <h2>2. Cancelamento depois de 7 dias</h2>
      <ul>
        <li>Você pode cancelar a qualquer momento, sem multa nem fidelidade.</li>
        <li>O acesso continua até o fim do período já pago, e não há nova cobrança.</li>
        <li>Não devolvemos valores proporcionais do período em andamento, exceto nos casos do item 3.</li>
      </ul>

      <h2>3. Quando devolvemos fora do prazo de arrependimento</h2>
      <ul>
        <li>Cobrança indevida ou em duplicidade: devolvemos conforme o art. 42 do Código de Defesa do Consumidor.</li>
        <li>Falha do serviço que impeça o uso por período relevante, comprovada pelo nosso suporte: devolução proporcional ao período afetado.</li>
      </ul>

      <h2>4. Como pedir</h2>
      <p>
        Escreva para <a href={`mailto:${LEGAL.emailContato}`}>{LEGAL.emailContato}</a> com o e-mail da sua conta e a data da cobrança. Respondemos em
        até 5 dias úteis. Depois de aprovado, o estorno é feito em até 10 dias úteis; no cartão de crédito, pode aparecer em até duas faturas, conforme a
        operadora.
      </p>

      <h2>5. Seus dados depois do cancelamento</h2>
      <p>
        Cancelar a assinatura não apaga seus dados. Para apagá-los, exclua a conta em Configurações. Antes disso, você pode baixar uma cópia completa.
      </p>
    </>
  );
}
