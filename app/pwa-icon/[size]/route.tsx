import { ImageResponse } from "next/og";

export const dynamic = "force-static";
export function generateStaticParams() {
  return [{ size: "192" }, { size: "512" }];
}

/** Ícone PNG do app instalável (a marca: "c" que fecha como moeda, sobre verde). */
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const s = size === "192" ? 192 : 512;
  return new ImageResponse(
    (
      <div style={{ width: s, height: s, background: "#0f9d6e", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width={s * 0.62} height={s * 0.62} viewBox="10 10 22 20">
          <path d="M26 14.5a8 8 0 1 0 0 11" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
          <circle cx="29" cy="20" r="2.4" fill="#fff" />
        </svg>
      </div>
    ),
    { width: s, height: s },
  );
}
