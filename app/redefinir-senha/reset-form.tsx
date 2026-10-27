"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updatePasswordAction } from "@/app/login/actions";
import { pwnedCount, weakPasswordReason } from "@/lib/pwned";

export function ResetForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string; id: number } | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const weak = weakPasswordReason(password);
    if (weak) return setMsg({ ok: false, text: weak, id: Date.now() });
    if (password !== confirm) return setMsg({ ok: false, text: "As senhas não conferem.", id: Date.now() });
    setLoading(true);
    if ((await pwnedCount(password)) > 0) {
      setLoading(false);
      return setMsg({ ok: false, text: "Essa senha já apareceu em vazamentos de dados na internet. Escolha outra, que você não use em nenhum outro site.", id: Date.now() });
    }
    const r = await updatePasswordAction(password);
    setLoading(false);
    setMsg({ ok: r.ok, text: r.text, id: Date.now() });
    if (!r.ok) return;
    router.replace(r.redirect ?? "/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input className="input" type="password" autoComplete="new-password" placeholder="Nova senha" required value={password} onChange={(e) => setPassword(e.target.value)} />
      <input className="input" type="password" autoComplete="new-password" placeholder="Repita a nova senha" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      {msg && (
        <p key={msg.id} role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-primary" : "shake text-danger"}`}>
          {msg.text}
        </p>
      )}
      <button className="btn shine w-full" disabled={loading}>
        {loading ? "Aguarde..." : "Salvar nova senha"}
      </button>
    </form>
  );
}
