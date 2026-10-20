import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompanyInfo } from "@/lib/finance/cnpj";

const MAX_LOOKUPS = 25;

const titleCase = (s: string) =>
  s
    .toLowerCase()
    .replace(/(^|\s)(\p{L})/gu, (_, sp: string, c: string) => sp + c.toUpperCase())
    .replace(/\b(Ltda|S\.?a|Me|Epp|Eireli)\b/gi, (m) => m.toUpperCase());

/**
 * Dados públicos da empresa pelo CNPJ (BrasilAPI, base da Receita Federal).
 * Só CNPJ sai do sistema — nunca CPF nem valores. Resposta fica em cache por 30 dias.
 */
async function fetchCompany(cnpj: string): Promise<CompanyInfo | null> {
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
      signal: AbortSignal.timeout(4000),
      next: { revalidate: 60 * 60 * 24 * 30 },
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { razao_social?: string; nome_fantasia?: string; cnae_fiscal?: number | string; cnae_fiscal_descricao?: string };
    // Nome fantasia é o mais reconhecível ("Padaria Pão Bom"), mas às vezes é só "Matriz"/"Direção Geral"
    const fantasy = (d.nome_fantasia ?? "").trim();
    const generic = /^(dire[cç][aã]o geral|matriz|sede|filial|escrit[oó]rio|loja \d+)?$/i.test(fantasy);
    const name = (generic ? d.razao_social : fantasy) || d.razao_social || "";
    if (!name) return null;
    return {
      cnpj,
      name: titleCase(name).slice(0, 120),
      activity: d.cnae_fiscal_descricao ?? null,
      cnae: d.cnae_fiscal ? String(d.cnae_fiscal) : null,
    };
  } catch {
    return null;
  }
}

/** Empresas dos CNPJs (com o contato do workspace, se já existir). */
export async function lookupCompanies(supabase: SupabaseClient, workspaceId: string, cnpjs: string[]) {
  const unique = [...new Set(cnpjs)].slice(0, MAX_LOOKUPS);
  const out = new Map<string, CompanyInfo & { contactId: string | null }>();
  if (!unique.length) return out;
  const { data: contacts } = await supabase.from("contacts").select("id, name, document").eq("workspace_id", workspaceId).in("document", unique);
  const contactOf = new Map((contacts ?? []).map((c) => [c.document as string, c]));
  const companies = await Promise.all(unique.map((c) => fetchCompany(c)));
  unique.forEach((cnpj, i) => {
    const contact = contactOf.get(cnpj);
    const company = companies[i];
    if (!company && !contact) return;
    out.set(cnpj, {
      cnpj,
      name: contact?.name ?? company!.name,
      activity: company?.activity ?? null,
      cnae: company?.cnae ?? null,
      contactId: contact?.id ?? null,
    });
  });
  return out;
}
