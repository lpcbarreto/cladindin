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
      }}
    />
  );
}
