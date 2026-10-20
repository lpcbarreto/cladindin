import { ImageResponse } from "next/og";

export const dynamic = "force-static";
export function generateStaticParams() {
  return [{ size: "192" }, { size: "512" }];
}

/** Ícone PNG do app instalável (o "C" verde com a moedinha). */
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const s = size === "192" ? 192 : 512;
  return new ImageResponse(
    (
      <div style={{ width: s, height: s, background: "#177a4c", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
        <div style={{ color: "#fff", fontSize: s * 0.6, fontWeight: 800, lineHeight: 1, marginTop: -s * 0.04 }}>C</div>
        <div style={{ position: "absolute", top: s * 0.2, right: s * 0.2, width: s * 0.16, height: s * 0.16, borderRadius: "50%", background: "#f2b33d" }} />
      </div>
    ),
    { width: s, height: s },
  );
}
