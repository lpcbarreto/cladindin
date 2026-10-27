// Ícones de traço (24×24, 1,75px) na cor do texto. O site não usa emoji.
const PATHS = {
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3",
  bank: "M3 10h18M5 10V8l7-4 7 4v2M6 10v8m4-8v8m4-8v8m4-8v8M4 21h16",
  inbox: "M3 13h5l1.5 3h5L16 13h5M5 5h14l2 8v6H3v-6z",
  repeat: "M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01",
  paperclip: "M21 11.5l-8.6 8.6a5 5 0 0 1-7.1-7.1l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9",
  file: "M14 3H6v18h12V7zM14 3v4h4M9 13h6M9 17h6",
  building: "M4 21V5l8-2v18M12 8h8v13M8 8v.01M8 12v.01M8 16v.01M16 12v.01M16 16v.01M2 21h20",
  alert: "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  check: "M20 6 9 17l-5-5",
  checkCircle: "M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14l-3-3",
  coins: "M9 14a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM15.6 10.3A6 6 0 1 1 10.3 17M9 6v4l2 1",
  lock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
  sprout: "M7 20h10M12 20v-8M12 12C12 8 9 5 4 5c0 4 3 7 8 7zM12 10c0-3 2.5-6 7-6 0 3.5-2.5 6-7 6z",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, className = "", label }: { name: IconName; size?: number; className?: string; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`inline-block shrink-0 ${className}`}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
