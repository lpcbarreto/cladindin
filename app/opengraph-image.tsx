import { ImageResponse } from "next/og";

export const alt = "Cladindin — suas finanças, num só lugar";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Imagem de prévia ao compartilhar o link (WhatsApp, redes sociais). Sem fotos de terceiros. */
export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: "#0c0f0e", color: "#eef1ef", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 80 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 72, height: 72, borderRadius: 20, background: "#1c211f", border: "1px solid rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="54" height="54" viewBox="8 8 32 32">
              <path d="M32 15.5A12 12 0 1 0 32 32.5" fill="none" stroke="#eef1ef" strokeWidth="5" strokeLinecap="round" />
              <path d="M19 28l5-5 4 3 7-8M30 18h5v5" fill="none" stroke="#2bc48a" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div style={{ fontSize: 48, fontWeight: 700, letterSpacing: -2 }}>cladindin</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: -3, lineHeight: 1.05 }}>Suas finanças, num só lugar.</div>
          <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: -3, color: "#2bc48a" }}>Sem planilha.</div>
        </div>
        <div style={{ fontSize: 28, color: "#9aa39d" }}>Extratos, contas a pagar, cartões, metas e relatórios</div>
      </div>
    ),
    size,
  );
}
