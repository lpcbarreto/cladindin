-- 018: proteção de dados — aparelho no registro de acesso, alertas de segurança, backup e ajustes da auditoria.

-- Auditoria: função do gatilho de RLS automático não deve ser chamada pela API
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- Auditoria: lançamento recusado não pode ser "ressuscitado" como pago por quem não é administrador
create or replace function public.tx_approval_guard()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  lim bigint;
  is_admin boolean := auth.uid() is not null and public.is_member(new.workspace_id, 'admin');
begin
  if auth.uid() is null then return new; end if; -- jobs internos
  if tg_op = 'UPDATE' and new.approval is distinct from old.approval and not is_admin then
    raise exception 'Só administradores aprovam pagamentos' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.approval = 'rejected' and new.status <> 'cancelled' and not is_admin then
    raise exception 'Este pagamento foi recusado por um administrador' using errcode = '42501';
  end if;
  if new.type = 'expense' and new.origin in ('manual', 'installment') and not is_admin
     and (tg_op = 'INSERT' or new.amount_cents > old.amount_cents) then
    select approval_threshold_cents into lim from workspaces where id = new.workspace_id;
    if lim is not null and new.amount_cents > lim then
      new.approval := 'pending';
      new.approved_by := null;
      new.approved_at := null;
      new.status := 'planned';
      new.paid_date := null;
    end if;
  end if;
  if new.approval = 'pending' and new.status = 'paid' then
    raise exception 'Este pagamento ainda aguarda aprovação de um administrador';
  end if;
  return new;
end $$;
revoke execute on function public.tx_approval_guard() from public, anon, authenticated;

-- Aparelho (navegador + sistema, sem versão) no registro de acesso: base do aviso de "acesso novo"
alter table public.access_log add column if not exists device text check (char_length(device) <= 60);

-- Alertas de segurança enviados ao responsável pelo site (no máximo um por tipo por hora)
create table if not exists public.security_alert_log (
  kind text not null check (kind ~ '^[a-z-]{1,30}$'),
  hour timestamptz not null,
  sent_at timestamptz not null default now(),
  primary key (kind, hour)
);
alter table public.security_alert_log enable row level security;
-- sem políticas: só o servidor (service role) lê e grava

-- Backups diários criptografados: pasta privada, sem nenhuma política (só a service role acessa)
insert into storage.buckets (id, name, public, file_size_limit)
values ('backups', 'backups', false, 104857600)
on conflict (id) do update set public = false;

-- Contagem de sinais de ataque (tentativas de login erradas, erros em massa). Sem dados pessoais.
create table if not exists public.security_events (
  id bigint generated always as identity primary key,
  kind text not null check (kind ~ '^[a-z-]{1,30}$'),
  at timestamptz not null default now()
);
create index if not exists security_events_kind_at_idx on public.security_events (kind, at desc);
alter table public.security_events enable row level security;
-- sem políticas: só o servidor (service role) lê e grava
