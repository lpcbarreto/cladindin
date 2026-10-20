"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function ResetForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string; id: number } | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (password.length < 8) return setMsg({ ok: false, text: "A senha precisa ter ao menos 8 caracteres.", id: Date.now() });
    if (password !== confirm) return setMsg({ ok: false, text: "As senhas não conferem.", id: Date.now() });
    setLoading(true);
    const { error } = await createClient().auth.updateUser({ password });
    setLoading(false);
    if (error) return setMsg({ ok: false, text: "Não foi possível trocar a senha. Peça um novo link.", id: Date.now() });
    setMsg({ ok: true, text: "Senha alterada! Entrando...", id: Date.now() });
    router.replace("/");
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
