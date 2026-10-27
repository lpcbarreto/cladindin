"use client";

export function PrintButton() {
  return (
    <button type="button" className="btn-ghost no-print" onClick={() => window.print()}>
      Imprimir / PDF
    </button>
  );
}
