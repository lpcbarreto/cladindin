import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!data) redirect("/login");
  redirect(`/w/${data.workspace_id}/dashboard`);
}
