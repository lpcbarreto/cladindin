// Perguntas frequentes: usadas na página inicial e na Central de Ajuda.
// Só descrevem o que o sistema faz de verdade.
export type Faq = { q: string; a: string; topic: "comecar" | "importar" | "organizar" | "conta" };

export const FAQ: Faq[] = [
  {
    topic: "comecar",
    q: "Por onde começo?",
    a: "Cadastre suas contas e cartões em Contas e cartões, importe um extrato em Importar e cadastre as contas fixas em Recorrências. O guia de primeiros passos na tela inicial mostra o que falta.",
  },
  {
    topic: "comecar",
    q: "Como faço um lançamento rápido?",
    a: "Aperte a tecla N (ou o botão + no canto da tela) e escreva algo como “mercado 120 nubank”. Valor com “+” vira receita; dá para citar a conta e a data (ontem, 05/11). A busca geral abre com Ctrl+K.",
  },
  {
    topic: "importar",
    q: "Quais arquivos posso importar?",
    a: "Extratos e faturas em OFX, CSV ou PDF com texto, e comprovantes de Pix, boleto e transferência em PDF. PDFs escaneados (imagem) não são lidos. A leitura é aproximada: confira os lançamentos na revisão antes de confirmar.",
  },
  {
    topic: "importar",
    q: "Se eu importar o mesmo extrato duas vezes, duplica?",
    a: "Não. Lançamentos já importados são reconhecidos e ficam de fora. Os que parecem iguais a um lançamento feito à mão aparecem como “possível duplicada” para você decidir. Uma importação também pode ser desfeita em Importações.",
  },
  {
    topic: "importar",
    q: "Como a categoria é sugerida?",
    a: "Primeiro pelas suas regras de categorização, depois pelo seu histórico e, quando o extrato traz um CNPJ, pela atividade da empresa na base pública da Receita Federal. Você pode trocar qualquer sugestão.",
  },
  {
    topic: "organizar",
    q: "Como funcionam cartões e faturas?",
    a: "Cadastre o cartão com os dias de fechamento e vencimento. Cada compra cai na fatura certa e compras parceladas geram as parcelas futuras. Pague a fatura em Cartões: isso vira uma transferência da conta para o cartão, sem contar a despesa duas vezes.",
  },
  {
    topic: "organizar",
    q: "O relatório de Imposto de Renda substitui o contador?",
    a: "Não. Ele reúne rendimentos, despesas possivelmente dedutíveis e pagamentos por CPF/CNPJ para ajudar na declaração. Confira sempre com seus informes e comprovantes.",
  },
  {
    topic: "organizar",
    q: "Posso separar finanças pessoais e da empresa?",
    a: "Sim. Crie um workspace para cada uma em Configurações e convide pessoas com permissão de administrador, editor ou leitor.",
  },
  {
    topic: "conta",
    q: "Meus dados ficam visíveis para outras pessoas?",
    a: "Cada workspace só é visível para os membros que você convidou, com a regra aplicada no próprio banco de dados. Não vendemos dados nem usamos rastreamento. Detalhes na Política de Privacidade.",
  },
  {
    topic: "conta",
    q: "Como baixo meus dados ou excluo minha conta?",
    a: "Em Configurações › Seus dados: baixe a cópia da sua conta e de cada workspace e, se quiser, exclua a conta. Os pedidos também podem ser feitos na página Seus direitos (LGPD).",
  },
  {
    topic: "conta",
    q: "Como protejo mais minha conta?",
    a: "Ative a verificação em duas etapas em Configurações › Segurança. Lá também dá para sair de todos os dispositivos.",
  },
  {
    topic: "conta",
    q: "Posso desistir da assinatura?",
    a: "Sim. Em até 7 dias da contratação você recebe o valor de volta; depois disso, pode cancelar quando quiser, sem multa. Veja a Política de Reembolso e Cancelamento.",
  },
];

export const FAQ_TOPICS: Record<Faq["topic"], string> = {
  comecar: "Primeiros passos",
  importar: "Importação de extratos",
  organizar: "Organização e relatórios",
  conta: "Conta, privacidade e assinatura",
};
