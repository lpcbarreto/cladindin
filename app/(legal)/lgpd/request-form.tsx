"use client";

import { useActionState } from "react";
import { sendPrivacyRequest } from "./actions";

const KINDS = [
  ["acesso", "Confirmar se tratam meus dados / acessar meus dados"],
  ["correcao", "Corrigir dados incompletos ou errados"],
  ["eliminacao", "Eliminar meus dados"],
  ["portabilidade", "Receber meus dados (portabilidade)"],
  ["compartilhamento", "Saber com quem meus dados são compartilhados"],
  ["revogacao", "Revogar um consentimento"],
  ["oposicao", "Me opor a um tratamento"],
  ["outro", "Outro assunto de privacidade"],
] as const;

export function PrivacyRequestForm() {
  const [state, action, pending] = useActionState(sendPrivacyRequest, null);
  if (state?.ok) {
    return (
      <p role="status" className="rounded-[10px] border border-border bg-primary-soft p-4 text-sm">
        {state.message}
      </p>
    );
  }
  return (
    <form action={action} className="card space-y-4" noValidate={false}>
      <label className="block text-sm">
        <span className="font-medium">O que você quer pedir?</span>
        <select name="kind" required defaultValue="acesso" className="input mt-1">
          {KINDS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium">Nome</span>
          <input name="name" required minLength={2} maxLength={120} autoComplete="name" className="input mt-1" />
        </label>
        <label className="block text-sm">
          <span className="font-medium">E-mail para resposta</span>
          <input name="email" type="email" required maxLength={200} autoComplete="email" className="input mt-1" />
        </label>
      </div>
      <label className="block text-sm">
        <span className="font-medium">Detalhes (opcional)</span>
        <textarea name="message" maxLength={2000} rows={4} className="input mt-1" />
      </label>
      {/* Armadilha para robôs: invisível e fora da ordem de tabulação */}
      <div aria-hidden="true" className="absolute -left-[9999px]">
        <label>
          Site
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <p className="text-xs text-muted">
        Usamos nome e e-mail só para confirmar sua identidade e responder a este pedido. Não peça nem envie senhas ou documentos por aqui.
      </p>
      {state && !state.ok && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}
      <button className="btn" disabled={pending}>
        {pending ? "Enviando..." : "Enviar pedido"}
      </button>
    </form>
  );
}
