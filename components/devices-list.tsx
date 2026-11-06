import { createClient } from "@/lib/supabase/server";
import { revokeDevice, revokeOtherDevices } from "./devices-actions";

/** Descreve o aparelho a partir do navegador informado, sem guardar nada além do que o login já guarda. */
function describe(ua: string | null) {
  if (!ua) return "Aparelho desconhecido";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  const os = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} no ${os}` : browser;
}

function ago(iso: string) {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 5) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return `há ${d} dia${d > 1 ? "s" : ""}`;
}

export async function DevicesList() {
  const supabase = await createClient();
  const [{ data: claims }, { data: sessions }] = await Promise.all([supabase.auth.getClaims(), supabase.rpc("list_my_sessions")]);
  const currentId = claims?.claims.session_id;
  const list = (sessions ?? []) as { id: string; user_agent: string | null; ip: string | null; last_seen: string }[];
  const others = list.filter((s) => s.id !== currentId);

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Onde sua conta está aberta</h3>
      <ul className="divide-y divide-border text-sm">
        {list.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <div className="min-w-0">
              <p className="font-medium">{describe(s.user_agent)}</p>
              <p className="text-xs text-muted">
                {s.ip ? `IP ${s.ip} · ` : ""}
                {ago(s.last_seen)}
              </p>
            </div>
            {s.id === currentId ? (
              <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary">Este aparelho</span>
            ) : (
              <form action={revokeDevice}>
                <input type="hidden" name="id" value={s.id} />
                <button className="btn-ghost py-1">Sair</button>
              </form>
            )}
          </li>
        ))}
      </ul>
      {others.length > 0 && (
        <form action={revokeOtherDevices}>
          <button className="btn-ghost text-danger">Sair de todos os outros aparelhos</button>
        </form>
      )}
    </div>
  );
}
