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
  const [msg, setMsg] = useState<{ ok: boolean; text: string; id: number } | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) return setMsg({ ok: false, text: parsed.error.issues[0].message, id: Date.now() });
    setLoading(true);
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    try {
      if (mode === "link") {
        const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
        if (error) throw error;
        setMsg({ ok: true, text: "Enviamos um link de acesso para o seu e-mail.", id: Date.now() });
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
        } else setMsg({ ok: true, text: "Conta criada. Confirme pelo link enviado ao seu e-mail.", id: Date.now() });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error("E-mail ou senha incorretos.");
        router.replace(next);
        router.refresh();
      }
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Algo deu errado.", id: Date.now() });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="relative mb-2 flex rounded-full bg-surface-2 p-1 text-sm font-semibold">
        {/* Pílula que desliza até a aba escolhida */}
        <span
          aria-hidden="true"
          className="absolute inset-y-1 left-1 rounded-full bg-surface shadow-sm transition-transform duration-300"
          style={{
            width: "calc((100% - 0.5rem) / 3)",
            transform: `translateX(${(Object.keys(LABELS) as Mode[]).indexOf(mode) * 100}%)`,
            transitionTimingFunction: "var(--ease-spring)",
          }}
        />
        {(Object.keys(LABELS) as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setMsg(null);
            }}
            aria-pressed={mode === m}
            className={`relative z-10 flex-1 rounded-full px-2 py-1.5 transition-colors ${mode === m ? "text-foreground" : "text-muted hover:text-foreground"}`}
          >
            {LABELS[m]}
          </button>
        ))}
      </div>
      {mode === "cadastrar" && (
        <input className="input msg-in" placeholder="Seu nome" value={name} onChange={(e) => setName(e.target.value)} />
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
      {msg && (
        // key muda a cada mensagem: erros repetidos tremem de novo
        <p key={msg.id} role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-primary" : "shake text-danger"}`}>
          {msg.text}
        </p>
      )}
      <button className="btn shine w-full" disabled={loading}>
        {loading ? (
          <>
            <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-primary-fg/40 border-t-primary-fg" />
            Aguarde...
          </>
        ) : mode === "link" ? (
          "Enviar link"
        ) : (
          LABELS[mode]
        )}
      </button>
    </form>
  );
}
