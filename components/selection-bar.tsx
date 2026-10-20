"use client";

import { useEffect, useState } from "react";

/** Checkboxes "ids" ligadas ao formulário (inclusive as de fora dele, via atributo form=). */
function boxes(formId: string) {
  const form = document.getElementById(formId) as HTMLFormElement | null;
  if (!form) return [];
  return [...form.elements].filter((el): el is HTMLInputElement => el instanceof HTMLInputElement && el.name === "ids");
}

/** "Selecionar todos", "Limpar seleção" e a contagem de selecionados. */
export function SelectionBar({ formId }: { formId: string }) {
  const [count, setCount] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const update = () => {
      const list = boxes(formId);
      setTotal(list.length);
      setCount(list.filter((b) => b.checked).length);
    };
    update();
    document.addEventListener("change", update);
    return () => document.removeEventListener("change", update);
  }, [formId]);

  function setAll(checked: boolean) {
    const list = boxes(formId);
    list.forEach((b) => (b.checked = checked));
    // Mantém o checkbox do cabeçalho da tabela em sincronia
    document.getElementById(formId)?.querySelectorAll<HTMLInputElement>('input[aria-label="Selecionar todos"]').forEach((b) => (b.checked = checked));
    setCount(checked ? list.length : 0);
  }

  if (total === 0) return null;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <button type="button" className="btn-ghost py-1" onClick={() => setAll(true)} disabled={count === total}>
        Selecionar todos
      </button>
      <button type="button" className="btn-ghost py-1" onClick={() => setAll(false)} disabled={count === 0}>
        Limpar seleção
      </button>
      <span className="text-muted" aria-live="polite">
        {count} de {total} selecionado(s)
      </span>
    </span>
  );
}
