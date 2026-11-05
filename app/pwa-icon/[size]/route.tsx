import { ImageResponse } from "next/og";

export const dynamic = "force-static";
export function generateStaticParams() {
  return [{ size: "192" }, { size: "512" }];
}

/** Ícone PNG do app instalável: a marca "C que cresce" sobre grafite. */
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const s = size === "192" ? 192 : 512;
  return new ImageResponse(
    (
      <div style={{ width: s, height: s, background: "#111614", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width={s * 0.72} height={s * 0.72} viewBox="8 8 32 32">
          <path d="M32 15.5A12 12 0 1 0 32 32.5" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
          <path d="M19 28l5-5 4 3 7-8M30 18h5v5" fill="none" stroke="#2bc48a" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    ),
    { width: s, height: s },
  );
}
