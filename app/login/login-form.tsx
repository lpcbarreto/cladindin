"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { pwnedCount } from "@/lib/pwned";
import { authAction } from "./actions";

type Mode = "entrar" | "cadastrar" | "link";
const LABELS: Record<Mode, string> = { entrar: "Entrar", cadastrar: "Criar conta", link: "Link mágico" };

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("entrar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [accept, setAccept] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; id: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [forgot, setForgot] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setMsg({ ok: false, text: "E-mail inválido", id: Date.now() });
    setLoading(true);
    try {
      // A checagem de senha vazada fica no navegador: só 5 caracteres do hash saem dele
      if (mode === "cadastrar" && !forgot && (await pwnedCount(password)) > 0) throw new Error("Essa senha já apareceu em vazamentos de dados na internet. Escolha outra, que você não use em nenhum outro site.");
      if (mode === "cadastrar" && !forgot && !accept) throw new Error("Para criar a conta, aceite os Termos de Serviço e a Política de Privacidade.");
      const r = await authAction({ mode: forgot ? "recuperar" : mode, email, password, name, next, acceptTerms: accept });
      if (r.redirect) {
        router.replace(r.redirect);
        router.refresh();
        return;
      }
      setMsg({ ok: r.ok, text: r.text, id: Date.now() });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Algo deu errado.", id: Date.now() });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="relative mb-2 flex rounded-[10px] bg-surface-2 p-[3px] text-[13px] font-medium">
        {/* Pílula que desliza até a aba escolhida */}
        <span
          aria-hidden="true"
          className="absolute inset-y-[3px] left-[3px] rounded-lg bg-surface shadow-[0_1px_2px_rgba(17,22,20,0.08)] transition-transform duration-300"
          style={{
            width: "calc((100% - 6px) / 3)",
            transform: `translateX(${(Object.keys(LABELS) as Mode[]).indexOf(mode) * 100}%)`,
            transitionTimingFunction: "var(--ease-out)",
          }}
        />
        {(Object.keys(LABELS) as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setForgot(false);
              setMsg(null);
            }}
            aria-pressed={mode === m}
            className={`relative z-10 flex-1 rounded-lg px-2 py-1.5 transition-colors ${mode === m ? "text-foreground" : "text-muted hover:text-foreground"}`}
          >
            {LABELS[m]}
          </button>
        ))}
      </div>
      {mode === "cadastrar" && (
        <label className="msg-in block text-sm">
          <span className="sr-only">Como prefere ser chamado (opcional)</span>
          <input className="input" placeholder="Como prefere ser chamado (opcional)" autoComplete="nickname" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
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
      {mode !== "link" && !forgot && (
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
      {mode === "entrar" && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              setForgot((f) => !f);
              setMsg(null);
            }}
            className="text-xs font-medium text-primary hover:underline"
          >
            {forgot ? "Voltar para o login" : "Esqueci minha senha"}
          </button>
        </div>
      )}
      {mode === "cadastrar" && !forgot && (
        <label className="msg-in flex items-start gap-2 text-xs leading-relaxed text-muted">
          <input type="checkbox" required checked={accept} onChange={(e) => setAccept(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]" />
          <span>
            Li e aceito os{" "}
            <Link href="/termos" target="_blank" className="font-medium text-primary underline-offset-2 hover:underline">
              Termos de Serviço
            </Link>{" "}
            e a{" "}
            <Link href="/privacidade" target="_blank" className="font-medium text-primary underline-offset-2 hover:underline">
              Política de Privacidade
            </Link>
            . Tenho 18 anos ou mais.
          </span>
        </label>
      )}
      {msg && (
        // key muda a cada mensagem: erros repetidos tremem de novo
        <p key={msg.id} role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-primary" : "shake text-danger"}`}>
          {msg.text}
        </p>
      )}
      <button className="group btn h-11 w-full text-[15px]" disabled={loading}>
        {loading ? (
          <>
            <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-primary-fg/40 border-t-primary-fg" />
            Aguarde...
          </>
        ) : forgot ? (
          "Enviar link de recuperação"
        ) : mode === "link" ? (
          "Enviar link"
        ) : (
          <>
            {LABELS[mode]}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-1">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </>
        )}
      </button>
    </form>
  );
}
