import { isValidCNPJ, onlyDigits } from "@/lib/finance/document";

/** CNPJ (válido) que aparece no histórico do extrato. Nunca devolve CPF. */
export function extractCnpj(description: string): string | null {
  const candidates = description.match(/\d{2}\.?\d{3}\.?\d{3}\s?\/?\s?\d{4}\s?-?\s?\d{2}/g) ?? [];
  for (const c of candidates) {
    const d = onlyDigits(c);
    if (d.length === 14 && isValidCNPJ(d)) return d;
  }
  return null;
}

/**
 * Atividade principal (CNAE) → nomes de categoria, do mais específico ao mais geral.
 * Os nomes são os das categorias padrão (pessoa física e empresa); a primeira que existir no workspace é usada.
 */
const CNAE_CATEGORIES: [string, string[]][] = [
  ["4711", ["Supermercado", "Alimentação"]],
  ["4712", ["Supermercado", "Alimentação"]],
  ["4721", ["Supermercado", "Alimentação"]],
  ["4722", ["Supermercado", "Alimentação"]],
  ["4723", ["Supermercado", "Alimentação"]],
  ["4724", ["Supermercado", "Alimentação"]],
  ["4729", ["Supermercado", "Alimentação"]],
  ["1091", ["Supermercado", "Alimentação"]],
  ["5611", ["Restaurantes", "Alimentação"]],
  ["5612", ["Restaurantes", "Alimentação"]],
  ["5620", ["Restaurantes", "Alimentação"]],
  ["4731", ["Combustível", "Transporte"]],
  ["4732", ["Combustível", "Transporte"]],
  ["4771", ["Farmácia", "Saúde"]],
  ["4773", ["Farmácia", "Saúde"]],
  ["6550", ["Plano de saúde", "Saúde"]],
  ["86", ["Consultas", "Saúde"]],
  ["75", ["Consultas", "Saúde"]],
  ["8599", ["Cursos", "Educação"]],
  ["8593", ["Cursos", "Educação"]],
  ["85", ["Mensalidades", "Educação"]],
  ["4761", ["Livros", "Educação"]],
  ["4781", ["Vestuário", "Compras"]],
  ["4782", ["Vestuário", "Compras"]],
  ["4783", ["Vestuário", "Compras"]],
  ["4752", ["Eletrônicos", "Compras"]],
  ["4753", ["Eletrônicos", "Compras"]],
  ["4751", ["Eletrônicos", "Softwares", "Compras"]],
  ["4744", ["Manutenção", "Casa", "Compras"]],
  ["4754", ["Casa", "Compras"]],
  ["4755", ["Casa", "Compras"]],
  ["4759", ["Casa", "Compras"]],
  ["47", ["Compras"]],
  ["351", ["Energia", "Moradia"]],
  ["36", ["Água", "Moradia"]],
  ["37", ["Água", "Moradia"]],
  ["61", ["Internet", "Moradia"]],
  ["6022", ["Streaming", "Lazer"]],
  ["5911", ["Streaming", "Lazer"]],
  ["5914", ["Eventos", "Lazer"]],
  ["90", ["Eventos", "Lazer"]],
  ["93", ["Eventos", "Lazer"]],
  ["5510", ["Viagens", "Lazer"]],
  ["5590", ["Viagens", "Lazer"]],
  ["7911", ["Viagens", "Lazer"]],
  ["511", ["Viagens", "Lazer"]],
  ["4921", ["Transporte público", "Transporte"]],
  ["4922", ["Transporte público", "Transporte"]],
  ["4912", ["Transporte público", "Transporte"]],
  ["4923", ["Aplicativos", "Transporte"]],
  ["5223", ["Estacionamento", "Transporte"]],
  ["452", ["Manutenção do veículo", "Transporte"]],
  ["453", ["Manutenção do veículo", "Transporte"]],
  ["681", ["Aluguel", "Moradia"]],
  ["682", ["Aluguel", "Moradia"]],
  ["8112", ["Condomínio", "Moradia"]],
  ["6920", ["Contabilidade", "Despesas administrativas"]],
  ["62", ["Softwares", "Internet", "Despesas administrativas"]],
  ["631", ["Softwares", "Streaming", "Despesas administrativas"]],
  ["73", ["Marketing", "Despesas comerciais"]],
  ["64", ["Tarifas bancárias", "Despesas financeiras", "Impostos e taxas"]],
  ["66", ["Tarifas bancárias", "Despesas financeiras", "Impostos e taxas"]],
  ["493", ["Frete", "Custos"]],
  ["53", ["Frete", "Custos"]],
  ["46", ["Fornecedores", "Custos", "Compras"]],
];

export function categoryNamesForCnae(cnae: string | number | null | undefined): string[] {
  const code = String(cnae ?? "").replace(/\D/g, "");
  if (!code) return [];
  // Prefixo mais longo primeiro
  const hit = [...CNAE_CATEGORIES].sort((a, b) => b[0].length - a[0].length).find(([prefix]) => code.startsWith(prefix));
  return hit?.[1] ?? [];
}

export type CompanyInfo = { cnpj: string; name: string; activity: string | null; cnae: string | null };
