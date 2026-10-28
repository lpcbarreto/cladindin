import type { Metadata } from "next";
import { LEGAL, formatVersion } from "@/lib/legal";

export const metadata: Metadata = { title: "Política de Cookies · Cladindin" };

export default function CookiesPage() {
  return (
    <>
      <h1>Política de Cookies</h1>
      <p className="text-sm text-muted">Versão de {formatVersion(LEGAL.versao)}</p>

      <p>
        O {LEGAL.marca} usa somente cookies e armazenamento local <b>essenciais</b>: sem eles o login e as suas preferências não funcionam. Não usamos
        cookies de publicidade, de análise de navegação nem de terceiros. Por isso não pedimos consentimento para cookies — apenas informamos quais são.
      </p>

      <h2>Cookies</h2>
      <table>
        <thead>
          <tr>
            <th>Nome</th>
            <th>Para quê</th>
            <th>Duração</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>sb-…-auth-token</td>
            <td>Mantém você conectado. Inacessível a scripts da página.</td>
            <td>Até sair da conta ou a sessão expirar</td>
          </tr>
          <tr>
            <td>sb-…-code-verifier</td>
            <td>Confirma com segurança o login por link e a recuperação de senha.</td>
            <td>Alguns minutos</td>
          </tr>
          <tr>
            <td>desfazer</td>
            <td>Permite desfazer uma exclusão de lançamentos.</td>
            <td>30 segundos</td>
          </tr>
        </tbody>
      </table>

      <h2>Armazenamento local do navegador</h2>
      <table>
        <thead>
          <tr>
            <th>Nome</th>
            <th>Para quê</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>tema</td>
            <td>Lembra se você escolheu o tema claro ou escuro.</td>
          </tr>
          <tr>
            <td>painel-oculto</td>
            <td>Lembra os blocos que você escondeu na tela inicial.</td>
          </tr>
          <tr>
            <td>primeiros-passos</td>
            <td>Lembra se você dispensou o guia de primeiros passos.</td>
          </tr>
          <tr>
            <td>aviso-cookies</td>
            <td>Lembra que você já viu o aviso de cookies.</td>
          </tr>
        </tbody>
      </table>

      <h2>Como apagar</h2>
      <p>
        Você pode apagar cookies e armazenamento local nas configurações do seu navegador. Ao apagar o cookie de sessão, você sai da conta.
      </p>
      <p>
        Se um dia passarmos a usar cookies não essenciais (por exemplo, de análise), eles só serão ativados com o seu consentimento, e esta página será
        atualizada antes.
      </p>
    </>
  );
}
