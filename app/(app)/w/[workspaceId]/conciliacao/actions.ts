"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActionClient, uuid } from "@/lib/actions";

const pair = z.object({ workspaceId: uuid, imported: uuid, planned: uuid });

export async function joinPair(form: FormData) {
  const v = pair.parse({ workspaceId: form.get("workspaceId"), imported: form.get("imported"), planned: form.get("planned") });
  const { supabase } = await getActionClient();
  await supabase.rpc("reconcile_pair", { p_workspace_id: v.workspaceId, p_imported: v.imported, p_planned: v.planned });
  revalidatePath(`/w/${v.workspaceId}`, "layout");
}

/** Confirma várias sugestões de uma vez (pares "linha:previsto"). */
export async function joinMany(form: FormData) {
  const workspaceId = uuid.parse(form.get("workspaceId"));
  const pairs = z
    .array(z.string().regex(/^[0-9a-f-]{36}:[0-9a-f-]{36}$/))
    .max(200)
    .parse(form.getAll("pair"));
  const { supabase } = await getActionClient();
  for (const p of pairs) {
    const [imported, planned] = p.split(":");
    await supabase.rpc("reconcile_pair", { p_workspace_id: workspaceId, p_imported: imported, p_planned: planned });
  }
  revalidatePath(`/w/${workspaceId}`, "layout");
}

/** "Não é": a linha do extrato fica como lançamento próprio e sai da lista. */
export async function dismissLine(form: FormData) {
  const workspaceId = uuid.parse(form.get("workspaceId"));
  const id = uuid.parse(form.get("imported"));
  const { supabase } = await getActionClient();
  await supabase.from("transactions").update({ match_dismissed: true }).eq("id", id).eq("workspace_id", workspaceId).eq("origin", "import");
  revalidatePath(`/w/${workspaceId}/conciliacao`);
}
