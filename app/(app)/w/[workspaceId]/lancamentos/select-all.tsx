"use client";

export function SelectAll() {
  return (
    <input
      type="checkbox"
      aria-label="Selecionar todos"
      onChange={(e) => {
        e.currentTarget.form
          ?.querySelectorAll<HTMLInputElement>('input[name="ids"]')
          .forEach((cb) => (cb.checked = e.currentTarget.checked));
        // Avisa a barra de seleção para atualizar a contagem
        e.currentTarget.form?.dispatchEvent(new Event("change", { bubbles: true }));
      }}
    />
  );
}
