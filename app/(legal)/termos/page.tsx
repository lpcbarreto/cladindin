import Link from "next/link";
import type { Metadata } from "next";
import { LEGAL, formatVersion } from "@/lib/legal";

export const metadata: Metadata = { title: "Termos de Serviço · Cladindin" };

export default function TermsPage() {
  return (
    <>
      <h1>Termos de Serviço</h1>
      <p className="text-sm text-muted">Versão de {formatVersion(LEGAL.versao)}</p>

      <p>
        Estes termos regem o uso do {LEGAL.marca}, serviço on-line de organização financeira oferecido por {LEGAL.razaoSocial}
        {LEGAL.cnpj && <>, CNPJ {LEGAL.cnpj}</>}, com endereço em {LEGAL.endereco} (“nós”). Ao criar uma conta, você declara que leu e aceita estes termos
        e a <Link href="/privacidade">Política de Privacidade</Link>.
      </p>

      <h2>1. O que o serviço faz</h2>
      <p>
        O {LEGAL.marca} permite registrar e importar lançamentos financeiros, organizar contas, cartões, categorias, metas e orçamentos, e gerar relatórios.
        A leitura automática de extratos e faturas (OFX, CSV e PDF) e as sugestões de categoria são aproximadas: confira os dados antes de confirmar.
      </p>

      <h2>2. Não é aconselhamento</h2>
      <p>
        O {LEGAL.marca} é uma ferramenta de organização. Ele não oferece consultoria financeira, de investimentos, contábil, jurídica ou tributária. O
        relatório de Imposto de Renda é apenas um apoio: confira sempre com seus comprovantes e informes oficiais e, se precisar, com um profissional.
      </p>

      <h2>3. Sua conta</h2>
      <ul>
        <li>Você precisa ter 18 anos ou mais.</li>
        <li>Mantenha sua senha em segredo e ative a verificação em duas etapas, se quiser mais proteção.</li>
        <li>Você é responsável pelas informações que cadastra e por ter base legal para registrar dados de terceiros (clientes, fornecedores).</li>
        <li>Ao convidar pessoas para um workspace, você decide o que elas podem ver e alterar.</li>
      </ul>

      <h2>4. Uso permitido</h2>
      <p>
        Não é permitido usar o serviço para atividades ilegais, tentar acessar dados de outras pessoas, sobrecarregar ou atacar o sistema, ou contornar
        as proteções de segurança. Podemos suspender contas que violem estas regras, avisando o motivo, salvo quando a lei impedir.
      </p>

      <h2>5. Assinatura e pagamento</h2>
      <p>
        O preço, o período de cobrança e a forma de pagamento são informados de forma clara antes da contratação. A assinatura é renovada
        automaticamente ao fim de cada período, e você pode cancelar a qualquer momento, sem multa. Cancelamento, direito de arrependimento e reembolsos
        seguem a <Link href="/reembolso">Política de Reembolso e Cancelamento</Link>. Mudanças de preço são avisadas com antecedência mínima de 30
        dias e só valem para o período seguinte.
      </p>

      <h2>6. Disponibilidade</h2>
      <p>
        Trabalhamos para manter o serviço disponível, mas podem ocorrer interrupções por manutenção, falhas de fornecedores ou motivos fora do nosso
        controle. Recomendamos baixar periodicamente a cópia dos seus dados (Configurações › Seus dados).
      </p>

      <h2>7. Responsabilidade</h2>
      <p>
        Respondemos pelos danos causados por falha do serviço nos termos do Código de Defesa do Consumidor. Não respondemos por decisões tomadas com base
        em dados cadastrados ou importados de forma incorreta pelo usuário, nem por indisponibilidade de serviços de terceiros que fujam ao nosso
        controle, nos limites permitidos pela lei.
      </p>

      <h2>8. Seus dados e o fim da conta</h2>
      <p>
        Os dados que você cadastra são seus. Você pode baixá-los e excluir a conta quando quiser, em Configurações. O tratamento de dados pessoais segue a{" "}
        <Link href="/privacidade">Política de Privacidade</Link>.
      </p>

      <h2>9. Propriedade intelectual</h2>
      <p>
        A marca, o código e o visual do {LEGAL.marca} pertencem a {LEGAL.razaoSocial}. O site não usa fotos ou ilustrações de terceiros: os ícones e a
        marca são próprios. As fontes Inter e Inter Tight (© The Inter Project Authors) são usadas sob a licença{" "}
        <a href="https://openfontlicense.org" target="_blank" rel="noopener noreferrer">
          SIL Open Font License 1.1
        </a>
        . Os valores mostrados na tela de entrada são ilustrativos.
      </p>

      <h2>10. Mudanças nestes termos</h2>
      <p>
        Se alterarmos estes termos de forma relevante, avisaremos dentro do app antes de a mudança valer. Se não concordar, você pode cancelar e excluir
        sua conta.
      </p>

      <h2>11. Contato e foro</h2>
      <p>
        Dúvidas e reclamações: <a href={`mailto:${LEGAL.emailContato}`}>{LEGAL.emailContato}</a>. Fica eleito o foro do domicílio do consumidor; nos
        demais casos, o foro de {LEGAL.foro}. Aplica-se a lei brasileira.
      </p>
    </>
  );
}
