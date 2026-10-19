"use client";

export function ThemeToggle() {
  function toggle() {
    const dark = document.documentElement.classList.toggle("dark");
    try {
      localStorage.setItem("tema", dark ? "dark" : "light");
    } catch {
      // armazenamento indisponível: o tema só vale para esta aba
    }
  }
  return (
    <button type="button" onClick={toggle} className="btn-ghost" aria-label="Alternar tema claro/escuro">
      Tema
    </button>
  );
}
