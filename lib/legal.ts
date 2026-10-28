/**
 * Dados legais do Cladindin — ÚNICO lugar para preencher.
 * Tudo entre colchetes [ ] é um campo a preencher antes de divulgar o site ao público
 * (Decreto 7.962/2013 exige nome/razão social, CNPJ/CPF, endereço e contato visíveis).
 * Enquanto houver campo vazio, as páginas legais mostram um aviso.
 */
export const LEGAL = {
  /** Nome comercial exibido */
  marca: "Cladindin",
  /** Razão social (empresa) ou nome completo (pessoa física) */
  razaoSocial: "[RAZÃO SOCIAL]",
  /** CNPJ (empresa). Pessoa física: deixe "" — o CPF não é publicado. */
  cnpj: "[CNPJ]",
  /** Endereço completo (rua, número, bairro, cidade/UF, CEP) */
  endereco: "[ENDEREÇO COMPLETO]",
  /** E-mail de atendimento geral */
  emailContato: "[E-MAIL DE CONTATO]",
  /** Encarregado pelo tratamento de dados (LGPD art. 41) */
  encarregadoNome: "[NOME DO ENCARREGADO]",
  encarregadoEmail: "[E-MAIL DO ENCARREGADO]",
  /** Cidade/UF do foro (Termos de Serviço) */
  foro: "[CIDADE/UF]",
  /** Data da versão atual dos documentos (mude ao alterar o texto) */
  versao: "2026-10-28",
} as const;

/** Versão aceita no cadastro: mudou o texto dos Termos/Política? Atualize `versao`. */
export const TERMS_VERSION = LEGAL.versao;

export const LEGAL_LINKS = [
  { href: "/termos", label: "Termos de Serviço" },
  { href: "/privacidade", label: "Política de Privacidade" },
  { href: "/cookies", label: "Cookies" },
  { href: "/reembolso", label: "Reembolso e cancelamento" },
  { href: "/lgpd", label: "Seus direitos (LGPD)" },
  { href: "/acessibilidade", label: "Acessibilidade" },
] as const;

/** Campos ainda não preenchidos (mostrados como aviso nas páginas legais). */
export function missingLegalFields(): string[] {
  return Object.entries(LEGAL)
    .filter(([, v]) => typeof v === "string" && /^\[.*\]$/.test(v))
    .map(([k]) => k);
}

export function formatVersion(v: string) {
  const [y, m, d] = v.split("-");
  return `${d}/${m}/${y}`;
}
