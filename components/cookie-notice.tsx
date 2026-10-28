"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const KEY = "aviso-cookies";

/**
 * Aviso de cookies. O site só usa cookies ESSENCIAIS (login e preferências), que dispensam
 * consentimento; por isso é um aviso informativo, sem botão de "aceitar rastreamento".
 */
export function CookieNotice() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      setShow(localStorage.getItem(KEY) !== "visto");
    } catch {
      setShow(false);
    }
  }, []);
  if (!show) return null;
  function close() {
    setShow(false);
    try {
      localStorage.setItem(KEY, "visto");
    } catch {
      // sem armazenamento: o aviso volta na próxima visita
    }
  }
  return (
    <div
      role="region"
      aria-label="Aviso de cookies"
      className="msg-in fixed inset-x-3 bottom-3 z-[60] mx-auto flex max-w-xl flex-col gap-3 rounded-[14px] border border-border bg-surface p-4 text-sm shadow-[0_12px_32px_-12px_rgba(17,22,20,0.35)] sm:flex-row sm:items-center"
    >
      <p className="flex-1 text-muted">
        Usamos apenas cookies essenciais para manter você conectado e lembrar suas preferências. Não usamos rastreamento nem publicidade.{" "}
        <Link href="/cookies" className="font-medium text-primary underline-offset-2 hover:underline">
          Saiba mais
        </Link>
      </p>
      <button type="button" onClick={close} className="btn shrink-0">
        Entendi
      </button>
    </div>
  );
}
