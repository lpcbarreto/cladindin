"use client";

import { useActionState } from "react";
import { addAttachment } from "../../a-pagar/actions";

export function AttachmentForm({ workspaceId, id }: { workspaceId: string; id: string }) {
  const [state, action, pending] = useActionState(addAttachment, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 text-sm">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="id" value={id} />
      <input
        name="receipt"
        type="file"
        required
        accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
        className="input max-w-sm py-1.5"
        aria-label="Arquivo do comprovante"
      />
      <button className="btn-ghost" disabled={pending}>
        {pending ? "Enviando..." : "Anexar"}
      </button>
      <span className="text-xs text-muted">PDF ou imagem, até 10 MB</span>
      {state && <p className={`w-full ${state.ok ? "text-primary" : "text-danger"}`}>{state.message}</p>}
    </form>
  );
}
