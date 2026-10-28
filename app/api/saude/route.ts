import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * Página de saúde para monitores gratuitos (ex.: UptimeRobot): 200 quando o site e o banco
 * respondem, 503 quando não. Não expõe nenhum dado.
 */
export async function GET() {
  const started = Date.now();
  try {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    // Consulta vazia (sem login o RLS não devolve linhas): só confirma que o banco responde
    const { error } = await db.from("workspaces").select("id").limit(1);
    if (error) throw error;
    return NextResponse.json({ status: "ok", ms: Date.now() - started }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "erro" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
