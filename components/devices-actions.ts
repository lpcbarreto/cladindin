"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/** Encerra uma sessão da própria pessoa em outro aparelho. */
export async function revokeDevice(form: FormData) {
  const id = z.string().uuid().parse(form.get("id"));
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data) throw new Error("Sessão expirada");
  if (data.claims.session_id === id) return; // este aparelho: use "Sair"
  await supabase.rpc("revoke_my_session", { p_id: id });
  revalidatePath("/", "layout");
}

/** Sai de todos os outros aparelhos, mantendo este. */
export async function revokeOtherDevices() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "others" });
  revalidatePath("/", "layout");
}
