"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/report-error";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => reportError(error, error.digest), [error]);
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: "Inter, system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, textAlign: "center", padding: 16 }}>
        <div>
          
          <h1 style={{ fontSize: 20 }}>Ops, algo deu errado</h1>
          {error.digest && <p style={{ fontSize: 12, color: "#6b776f" }}>Código: {error.digest}</p>}
          <button onClick={reset} style={{ background: "#0b7f57", color: "#fff", border: 0, borderRadius: 10, padding: "10px 20px", fontWeight: 700 }}>
            Tentar de novo
          </button>
        </div>
      </body>
    </html>
  );
}
