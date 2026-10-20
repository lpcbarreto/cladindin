"use client";

import { useEffect, useState } from "react";
import { dismissUndo, undoDelete } from "@/app/(app)/w/[workspaceId]/global-actions";

/** Aviso "Lançamento excluído — Desfazer"; some sozinho em 10 s. */
export function UndoToast({ count }: { count: number }) {
  const [visible, setVisible] = useState(true);

  function close() {
    setVisible(false);
    dismissUndo();
  }

  useEffect(() => {
    const t = setTimeout(close, 10000);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;
  return (
    <div
      role="status"
      className="msg-in fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-full bg-foreground px-5 py-3 text-sm whitespace-nowrap text-background shadow-xl"
    >
      <span>{count === 1 ? "Lançamento excluído" : `${count} lançamentos excluídos`}</span>
      <form action={undoDelete}>
        <button className="font-bold text-accent hover:underline">Desfazer</button>
      </form>
      <button type="button" aria-label="Fechar aviso" onClick={close} className="opacity-60 hover:opacity-100">
        ✕
      </button>
    </div>
  );
}
