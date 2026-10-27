"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { mfaConfirm, mfaDisable, mfaEnroll, mfaStatus, signOutEverywhere as signOutAll } from "./security-actions";

type Enrolling = { factorId: string; qr: string; secret: string };

/** Verificação em duas etapas (TOTP) e saída de todos os dispositivos. */
export function SecuritySettings() {
  const router = useRouter();
  const [factorId, setFactorId] = useState<string | null | undefined>(undefined);
  const [enrolling, setEnrolling] = useState<Enrolling | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setFactorId(await mfaStatus().catch(() => null));
  }

  useEffect(() => {
    refresh();
  }, []);

  async function start() {
    setMsg(null);
    setBusy(true);
    const data = await mfaEnroll().catch(() => null);
    setBusy(false);
    if (!data) return setMsg({ ok: false, text: "Não foi possível iniciar. Tente de novo." });
    setEnrolling(data);
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!enrolling) return;
    setBusy(true);
    const ok = await mfaConfirm(enrolling.factorId, code).catch(() => false);
    setBusy(false);
    if (!ok) return setMsg({ ok: false, text: "Código inválido. Tente o próximo que aparecer no app." });
    setEnrolling(null);
    setCode("");
    setMsg({ ok: true, text: "Verificação em duas etapas ativada. 🔒" });
    refresh();
    router.refresh();
  }

  async function disable() {
    if (!factorId || !window.confirm("Desativar a verificação em duas etapas?")) return;
    setBusy(true);
    const ok = await mfaDisable(factorId).catch(() => false);
    setBusy(false);
    if (!ok) return setMsg({ ok: false, text: "Não foi possível desativar." });
    setMsg({ ok: true, text: "Verificação em duas etapas desativada." });
    refresh();
  }

  async function signOutEverywhere() {
    if (!window.confirm("Sair de todos os dispositivos, inclusive este?")) return;
    await signOutAll().catch(() => undefined);
    router.replace("/login");
  }

  return (
    <div className="space-y-4 text-sm">
      <div className="space-y-2">
        <h3 className="font-semibold">Verificação em duas etapas</h3>
        <p className="text-muted">
          Além da senha, pede um código do celular (Google Authenticator, Microsoft Authenticator, 1Password, Authy…) ao entrar.
        </p>
        {factorId === undefined ? (
          <p className="text-muted">Carregando…</p>
        ) : factorId ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-primary-soft px-3 py-1 font-semibold text-primary">Ativada</span>
            <button type="button" className="btn-ghost py-1" onClick={disable} disabled={busy}>
              Desativar
            </button>
          </div>
        ) : enrolling ? (
          <form onSubmit={confirm} className="space-y-3">
            <p>1. Escaneie o QR code no app autenticador:</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={enrolling.qr} alt="QR code para o app autenticador" width={180} height={180} className="rounded-xl bg-white p-2" />
            <p className="text-xs text-muted">
              Ou digite a chave: <code className="break-all">{enrolling.secret}</code>
            </p>
            <p>2. Digite o código de 6 dígitos que apareceu:</p>
            <div className="flex gap-2">
              <input
                className="input w-36 text-center tabular-nums"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                aria-label="Código de 6 dígitos"
              />
              <button className="btn" disabled={busy || code.length !== 6}>
                Ativar
              </button>
              <button type="button" className="btn-ghost" onClick={() => setEnrolling(null)}>
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className="btn-ghost" onClick={start} disabled={busy}>
            Ativar verificação em duas etapas
          </button>
        )}
      </div>
      <div className="space-y-2 border-t border-border pt-4">
        <h3 className="font-semibold">Sessões</h3>
        <p className="text-muted">Esqueceu o login aberto em outro computador ou celular? Encerre todas as sessões de uma vez.</p>
        <button type="button" className="btn-ghost text-danger" onClick={signOutEverywhere}>
          Sair de todos os dispositivos
        </button>
      </div>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-primary" : "text-danger"}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
