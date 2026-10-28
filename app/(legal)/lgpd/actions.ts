"use server";

import { z } from "zod";
import { adminClient } from "@/lib/supabase/admin";
import { clientIp } from "@/lib/access-log";
import { rateLimit } from "@/lib/rate-limit";
import { LEGAL } from "@/lib/legal";

const schema = z.object({
  kind: z.enum(["acesso", "correcao", "eliminacao", "portabilidade", "compartilhamento", "revogacao", "oposicao", "outro"]),
  name: z.string().trim().min(2, "Informe seu nome").max(120),
  email: z.string().trim().toLowerCase().email("E-mail inválido").max(200),
  message: z.string().trim().max(2000).optional(),
  // Campo invisível: robôs preenchem, pessoas não
  website: z.string().max(0).optional(),
});

export type RequestState = { ok: boolean; message: string } | null;

/** Pedido de titular (LGPD, art. 18): gravado só pelo servidor, com limite por IP. */
export async function sendPrivacyRequest(_prev: RequestState, form: FormData): Promise<RequestState> {
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const ip = (await clientIp()) ?? "anon";
  if (!rateLimit(`lgpd:${ip}`, 5, 60 * 60_000)) return { ok: false, message: "Muitos pedidos seguidos. Tente de novo em uma hora." };

  const db = adminClient();
  if (!db) return { ok: false, message: `Não foi possível registrar agora. Envie seu pedido para ${LEGAL.encarregadoEmail}.` };
  const v = parsed.data;
  const { error } = await db.from("privacy_requests").insert({ kind: v.kind, name: v.name, email: v.email, message: v.message || null });
  if (error) return { ok: false, message: `Não foi possível registrar agora. Envie seu pedido para ${LEGAL.encarregadoEmail}.` };
  return { ok: true, message: "Pedido registrado. Vamos responder no e-mail informado em até 15 dias." };
}
