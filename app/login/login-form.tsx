"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";

const emailSchema = z.string().email("E-mail inválido");
type Mode = "entrar" | "cadastrar" | "link";
const LABELS: Record<Mode, string> = { entrar: "Entrar", cadastrar: "Criar conta", link: "Link mágico" };

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("entrar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) return setMsg({ ok: false, text: parsed.error.issues[0].message });
    setLoading(true);
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    try {
      if (mode === "link") {
        const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
        if (error) throw error;
        setMsg({ ok: true, text: "Enviamos um link de acesso para o seu e-mail." });
      } else if (mode === "cadastrar") {
        if (password.length < 8) throw new Error("A senha precisa ter ao menos 8 caracteres.");
        const { error, data } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectTo, data: { full_name: name } },
        });
        if (error) throw error;
        if (data.session) {
          router.replace(next);
          router.refresh();
        } else setMsg({ ok: true, text: "Conta criada. Confirme pelo link enviado ao seu e-mail." });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error("E-mail ou senha incorretos.");
        router.replace(next);
        router.refresh();
      }
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Algo deu errado." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="mb-2 flex gap-1 rounded-full bg-surface-2 p-1 text-sm font-semibold">
        {(Object.keys(LABELS) as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
            className={`flex-1 rounded-full px-2 py-1.5 transition ${mode === m ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}
          >
            {LABELS[m]}
          </button>
        ))}
      </div>
      {mode === "cadastrar" && (
        <input className="input" placeholder="Seu nome" value={name} onChange={(e) => setName(e.target.value)} />
      )}
      <input
        className="input"
        type="email"
        autoComplete="email"
        placeholder="E-mail"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      {mode !== "link" && (
        <input
          className="input"
          type="password"
          autoComplete={mode === "cadastrar" ? "new-password" : "current-password"}
          placeholder="Senha"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      )}
      {msg && <p className={`text-sm ${msg.ok ? "text-primary" : "text-danger"}`}>{msg.text}</p>}
      <button className="btn w-full" disabled={loading}>
        {loading ? "Aguarde..." : mode === "link" ? "Enviar link" : LABELS[mode]}
      </button>
    </form>
  );
}
