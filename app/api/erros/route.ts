import { NextResponse, type NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";

/** Recebe erros do navegador e registra nos logs da Vercel (sem dados pessoais ou financeiros). */
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anon";
  if (!rateLimit(`erros:${ip}`, 20, 60_000)) return new NextResponse(null, { status: 429 });
  try {
    const body = await request.json();
    const clip = (v: unknown, n: number) => String(v ?? "").slice(0, n);
    console.error(
      JSON.stringify({
        evento: "erro_navegador",
        tipo: clip(body.name, 60),
        mensagem: clip(body.message, 200),
        // Só o caminho, com ids trocados: nada de query string
        rota: clip(body.path, 120).replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ":id"),
        digest: clip(body.digest, 40),
      }),
    );
  } catch {
    // corpo inválido: ignora
  }
  return new NextResponse(null, { status: 204 });
}
