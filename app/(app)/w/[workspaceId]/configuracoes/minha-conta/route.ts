import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Cópia dos dados PESSOAIS da conta (LGPD, art. 18, II e V): perfil, aceite dos termos,
 * workspaces e papéis, preferências, verificação em duas etapas e registros de acesso.
 * Os dados financeiros de cada workspace saem em "Baixar dados do workspace".
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  const [profile, memberships, prefs, access, factors] = await Promise.all([
    supabase.from("profiles").select("full_name, created_at, updated_at").eq("id", user.id).maybeSingle(),
    supabase.from("workspace_members").select("role, created_at, workspace:workspaces(id, name, kind)").eq("user_id", user.id),
    supabase.from("notification_prefs").select("due_alerts, days_before, weekly_summary, updated_at").eq("user_id", user.id).maybeSingle(),
    supabase.from("access_log").select("ip, at").eq("user_id", user.id).order("at", { ascending: false }).limit(5000),
    supabase.auth.mfa.listFactors(),
  ]);

  const body = {
    gerado_em: new Date().toISOString(),
    conta: {
      email: user.email,
      criada_em: user.created_at,
      ultimo_acesso: user.last_sign_in_at,
      termos_versao_aceita: user.user_metadata?.terms_version ?? null,
      termos_aceitos_em: user.user_metadata?.terms_accepted_at ?? null,
    },
    perfil: profile.data,
    workspaces: memberships.data,
    preferencias_de_aviso: prefs.data,
    verificacao_duas_etapas: (factors.data?.all ?? []).map((f) => ({ tipo: f.factor_type, status: f.status, criada_em: f.created_at })),
    registros_de_acesso: access.data,
  };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="cladindin-minha-conta-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
