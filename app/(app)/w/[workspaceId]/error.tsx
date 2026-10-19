"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function WorkspaceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Só o identificador: nunca dados financeiros no log
    console.error("Erro na página", error.digest ?? error.name);
  }, [error]);

  return (
    <div className="card mx-auto max-w-lg space-y-4 text-center">
      <p className="text-4xl" aria-hidden="true">
        🪙
      </p>
      <h1 className="text-xl font-extrabold">Ops, algo não carregou</h1>
      <p className="text-sm text-muted">
        Pode ter sido uma instabilidade de conexão. Tente de novo; se continuar, recarregue a página ou volte ao início.
        {error.digest && <span className="mt-2 block text-xs">Código: {error.digest}</span>}
      </p>
      <div className="flex justify-center gap-2">
        <button className="btn" onClick={reset}>
          Tentar de novo
        </button>
        <Link href="/" className="btn-ghost">
          Ir para o início
        </Link>
      </div>
    </div>
  );
}
