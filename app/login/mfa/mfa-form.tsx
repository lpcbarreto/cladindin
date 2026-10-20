"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function MfaForm({ next }: { next: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ text: string; id: number } | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    const supabase = createClient();
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const factor = factors?.totp.find((f) => f.status === "verified");
    if (!factor) {
      setLoading(false);
      return setMsg({ text: "Nenhum autenticador encontrado.", id: Date.now() });
    }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.replace(/\D/g, "") });
    setLoading(false);
    if (error) return setMsg({ text: "Código inválido. Confira o horário do celular e tente de novo.", id: Date.now() });
    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input
        className="input text-center text-2xl tracking-[0.4em] tabular-nums"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        placeholder="000000"
        aria-label="Código de 6 dígitos"
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
      />
      {msg && (
        <p key={msg.id} role="alert" className="shake text-sm text-danger">
          {msg.text}
        </p>
      )}
      <button className="btn shine w-full" disabled={loading || code.length !== 6}>
        {loading ? "Verificando..." : "Confirmar"}
      </button>
    </form>
  );
}
