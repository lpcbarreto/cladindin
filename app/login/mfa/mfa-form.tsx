"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { verifyMfaAction } from "../actions";

export function MfaForm({ next }: { next: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ text: string; id: number } | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    const r = await verifyMfaAction(code, next);
    setLoading(false);
    if (!r.ok && !r.redirect) return setMsg({ text: r.text, id: Date.now() });
    router.replace(r.redirect ?? next);
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
      <button className="btn h-11 w-full" disabled={loading || code.length !== 6}>
        {loading ? "Verificando..." : "Confirmar"}
      </button>
    </form>
  );
}
