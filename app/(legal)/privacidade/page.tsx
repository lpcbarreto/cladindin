import Link from "next/link";
import type { Metadata } from "next";
import { LEGAL, formatVersion } from "@/lib/legal";

export const metadata: Metadata = { title: "Política de Privacidade · Cladindin" };

export default function PrivacyPage() {
  return (
    <>
      <h1>Política de Privacidade</h1>
      <p className="text-sm text-muted">Versão de {formatVersion(LEGAL.versao)}</p>

      <p>
        Esta política explica quais dados pessoais o {LEGAL.marca} trata, por quê, com quem compartilha e como você exerce seus direitos, conforme a
        Lei Geral de Proteção de Dados (Lei 13.709/2018 — LGPD) e o Marco Civil da Internet (Lei 12.965/2014).
      </p>

      <h2>1. Quem é o responsável</h2>
      <p>
        O controlador dos dados é {LEGAL.razaoSocial}
        {LEGAL.cnpj && <>, CNPJ {LEGAL.cnpj}</>}, com endereço em {LEGAL.endereco}. O Encarregado pelo tratamento de dados pessoais (LGPD, art. 41) é{" "}
        {LEGAL.encarregadoNome}, contato: <a href={`mailto:${LEGAL.encarregadoEmail}`}>{LEGAL.encarregadoEmail}</a>.
      </p>
      <p>
        Quando uma empresa usa o {LEGAL.marca} para registrar dados de clientes ou fornecedores dela, essa empresa é a controladora desses dados e o{" "}
        {LEGAL.marca} atua como operador, tratando-os apenas para prestar o serviço.
      </p>

      <h2>2. Quais dados tratamos</h2>
      <table>
        <thead>
          <tr>
            <th>Dado</th>
            <th>Para quê</th>
            <th>Base legal (LGPD)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>E-mail e senha (guardada só como código criptográfico, nunca em texto)</td>
            <td>Criar e acessar sua conta</td>
            <td>Execução de contrato (art. 7º, V)</td>
          </tr>
          <tr>
            <td>Nome (opcional)</td>
            <td>Identificar você para outros membros do workspace</td>
            <td>Execução de contrato (art. 7º, V)</td>
          </tr>
          <tr>
            <td>Dados financeiros que você cadastra ou importa: contas, lançamentos, categorias, metas, orçamentos, comprovantes</td>
            <td>Prestar o serviço de organização financeira</td>
            <td>Execução de contrato (art. 7º, V)</td>
          </tr>
          <tr>
            <td>Contatos que você cadastra (nome, CPF/CNPJ, e-mail, telefone de clientes e fornecedores)</td>
            <td>Organizar lançamentos e relatórios, inclusive o de Imposto de Renda</td>
            <td>Execução de contrato e, para empresas, a base legal definida pela empresa controladora</td>
          </tr>
          <tr>
            <td>Registros de acesso: data, hora e endereço IP de cada entrada na conta</td>
            <td>Cumprir a guarda obrigatória de registros de acesso e proteger a conta</td>
            <td>Obrigação legal (art. 7º, II; Marco Civil, art. 15) e legítimo interesse em segurança (art. 7º, IX)</td>
          </tr>
          <tr>
            <td>Histórico de alterações (quem alterou o quê e quando dentro do workspace)</td>
            <td>Auditoria e segurança dos dados do workspace</td>
            <td>Legítimo interesse (art. 7º, IX)</td>
          </tr>
          <tr>
            <td>Preferências (tema, avisos por e-mail, verificação em duas etapas)</td>
            <td>Lembrar suas escolhas</td>
            <td>Execução de contrato (art. 7º, V)</td>
          </tr>
        </tbody>
      </table>
      <p>
        Não usamos seus dados para publicidade, não vendemos dados e não usamos ferramentas de rastreamento ou análise de navegação. Não tratamos dados
        pessoais sensíveis (art. 5º, II) de propósito; evite registrar esse tipo de informação nas descrições e observações.
      </p>

      <h2>3. Com quem compartilhamos</h2>
      <p>Somente com fornecedores necessários para o serviço funcionar (operadores), cada um limitado à sua função:</p>
      <ul>
        <li>
          <b>Supabase</b> — banco de dados, autenticação e armazenamento de comprovantes (servidores nos Estados Unidos).
        </li>
        <li>
          <b>Vercel</b> — hospedagem do site (servidores nos Estados Unidos).
        </li>
        <li>
          <b>Resend</b> — envio dos e-mails de aviso de vencimento e resumo semanal, apenas se você os mantiver ligados.
        </li>
        <li>
          <b>BrasilAPI</b> — consulta pública de empresas: recebe somente números de CNPJ que aparecem nos extratos importados, nunca CPF, valores ou
          descrições.
        </li>
        <li>
          <b>Have I Been Pwned</b> — verificação de senhas vazadas no cadastro: recebe apenas os 5 primeiros caracteres de um código derivado da senha,
          que não permitem descobrir a senha nem identificar você.
        </li>
      </ul>
      <p>
        Também podemos compartilhar dados quando exigido por lei ou por ordem de autoridade competente.
      </p>

      <h2>4. Transferência internacional</h2>
      <p>
        Como Supabase, Vercel e Resend mantêm servidores nos Estados Unidos, há transferência internacional de dados (LGPD, art. 33). Ela é feita para a
        execução do contrato com você e com fornecedores que adotam garantias contratuais e técnicas de proteção de dados.
      </p>

      <h2>5. Por quanto tempo guardamos</h2>
      <ul>
        <li>Dados da conta e dos workspaces: enquanto a conta existir. Ao excluir a conta, eles são apagados do banco de dados na hora.</li>
        <li>Cópias de segurança mantidas pelo provedor do banco podem conter os dados até o fim do ciclo de retenção desse provedor.</li>
        <li>Registros de acesso: 6 meses, como exige o art. 15 do Marco Civil da Internet; depois disso são apagados automaticamente.</li>
        <li>Pedidos de privacidade enviados pelo formulário: pelo tempo necessário para atender e comprovar o atendimento.</li>
      </ul>

      <h2>6. Como protegemos</h2>
      <ul>
        <li>Conexão sempre criptografada (HTTPS) e criptografia dos dados armazenados oferecida pelo provedor do banco.</li>
        <li>Cada workspace só é visível para seus membros, com a regra aplicada dentro do próprio banco de dados.</li>
        <li>Verificação em duas etapas opcional, recusa de senhas vazadas e limite de tentativas de acesso.</li>
        <li>Cookie de sessão inacessível a scripts da página.</li>
      </ul>
      <p>Nenhum sistema é totalmente imune a falhas. Em caso de incidente com risco relevante, comunicaremos você e a ANPD (LGPD, art. 48).</p>

      <h2>7. Seus direitos</h2>
      <p>
        Você pode pedir a qualquer momento (LGPD, art. 18): confirmação de que tratamos seus dados, acesso, correção, anonimização ou eliminação de dados
        desnecessários, portabilidade, informação sobre compartilhamentos, revogação de consentimento e eliminação dos dados. Também pode reclamar à
        Autoridade Nacional de Proteção de Dados (ANPD).
      </p>
      <p>
        Dentro do app, em Configurações, você mesmo baixa seus dados e exclui sua conta. Para os demais pedidos, use a página{" "}
        <Link href="/lgpd">Seus direitos (LGPD)</Link> ou escreva para <a href={`mailto:${LEGAL.encarregadoEmail}`}>{LEGAL.encarregadoEmail}</a>.
        Respondemos em até 15 dias.
      </p>

      <h2>8. Cookies</h2>
      <p>
        Usamos apenas cookies e armazenamento local essenciais para o login e para lembrar suas preferências. Detalhes na{" "}
        <Link href="/cookies">Política de Cookies</Link>.
      </p>

      <h2>9. Crianças e adolescentes</h2>
      <p>O {LEGAL.marca} é destinado a maiores de 18 anos. Não coletamos dados de menores de propósito.</p>

      <h2>10. Mudanças nesta política</h2>
      <p>
        Se mudarmos esta política de forma relevante, avisaremos dentro do app antes de a mudança valer. A data da versão fica no topo desta página.
      </p>
    </>
  );
}
