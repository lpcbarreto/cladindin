"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/report-error";

/** Quando o site inteiro quebra: registra o erro e leva para a tela "Voltamos já", que volta sozinha. */
export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportError(error, error.digest);
    const volta = encodeURIComponent(window.location.pathname);
    window.location.replace(`/fora-do-ar.html?volta=${volta}`);
  }, [error]);
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, minHeight: "100vh", background: "#111614" }} />
    </html>
  );
}
