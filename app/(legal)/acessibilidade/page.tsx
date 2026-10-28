import type { Metadata } from "next";
import { LEGAL, formatVersion } from "@/lib/legal";

export const metadata: Metadata = { title: "Acessibilidade · Cladindin" };

export default function AccessibilityPage() {
  return (
    <>
      <h1>Acessibilidade</h1>
      <p className="text-sm text-muted">Versão de {formatVersion(LEGAL.versao)}</p>

      <p>
        Queremos que todas as pessoas consigam usar o {LEGAL.marca}, conforme a Lei Brasileira de Inclusão (Lei 13.146/2015, art. 63). Nossa referência é
        o nível AA das Diretrizes de Acessibilidade para Conteúdo Web (WCAG 2.1).
      </p>

      <h2>O que já fazemos</h2>
      <ul>
        <li>Todo o site funciona pelo teclado, com foco visível e o atalho “Pular para o conteúdo”.</li>
        <li>Textos e botões com contraste mínimo de 4,5:1, nos temas claro e escuro.</li>
        <li>Campos de formulário com rótulos, mensagens de erro anunciadas por leitores de tela e imagens com texto alternativo.</li>
        <li>Gráficos acompanhados de tabela com os mesmos valores, e cores escolhidas para quem tem daltonismo.</li>
        <li>Animações desligadas automaticamente quando o sistema pede para reduzir movimento.</li>
        <li>Verificação automática de acessibilidade nos testes do site.</li>
      </ul>

      <h2>Limitações conhecidas</h2>
      <ul>
        <li>A prévia de comprovantes em PDF depende do leitor de PDF do navegador.</li>
        <li>A leitura de extratos em PDF escaneado (imagem) não é suportada.</li>
      </ul>

      <h2>Encontrou uma barreira?</h2>
      <p>
        Conte para nós em <a href={`mailto:${LEGAL.emailContato}`}>{LEGAL.emailContato}</a>, dizendo a página e o que aconteceu. Respondemos em até 5 dias
        úteis.
      </p>
    </>
  );
}
