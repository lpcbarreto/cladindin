import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!z.string().regex(/^[a-f0-9]{48}$/).safeParse(token).success) return <Message text="Convite inválido." />;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/convite/${token}`)}`);

  const { data: workspaceId, error } = await supabase.rpc("accept_invite", { p_token: token });
  if (error || !workspaceId) {
    return <Message text={`Não foi possível aceitar o convite: ${error?.message ?? "erro desconhecido"}.`} />;
  }
  redirect(`/w/${workspaceId}/dashboard`);
}

function Message({ text }: { text: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="card max-w-sm space-y-4 text-sm">
        <p>{text}</p>
        <Link href="/" className="btn-ghost">
          Voltar ao início
        </Link>
      </div>
    </main>
  );
}
