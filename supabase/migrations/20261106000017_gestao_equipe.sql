-- 017: conciliação manual, linhas da DRE, aprovação de pagamentos, alerta de orçamento,
-- aparelhos conectados.

-- Conciliação ------------------------------------------------------------------
alter table public.transactions add column if not exists match_dismissed boolean not null default false;

/*
  Junta uma linha importada do extrato com um lançamento previsto: o previsto vira pago com a
  data e o valor do banco, herda os identificadores do extrato (para não reimportar) e a linha
  importada é removida. Roda como o usuário (RLS vale).
*/
create or replace function public.reconcile_pair(p_workspace_id uuid, p_imported uuid, p_planned uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare
  i transactions%rowtype;
  hit int;
begin
  if not public.is_member(p_workspace_id, 'editor') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  select * into i from transactions
   where id = p_imported and workspace_id = p_workspace_id and origin = 'import'
     and status = 'paid' and deleted_at is null
   for update;
  if not found then raise exception 'Linha do extrato não encontrada'; end if;

  update transactions set deleted_at = now(), external_id = null, fingerprint = null where id = i.id;

  update transactions set
    status = 'paid',
    paid_date = i.paid_date,
    amount_cents = i.amount_cents,
    external_id = i.external_id,
    fingerprint = i.fingerprint,
    statement_description = coalesce(i.statement_description, i.description),
    reconciled = true,
    reconciled_import_batch_id = i.import_batch_id,
    category_id = coalesce(category_id, i.category_id)
  where id = p_planned and workspace_id = p_workspace_id and account_id = i.account_id
    and status = 'planned' and deleted_at is null and sign(direction) = sign(i.direction);
  get diagnostics hit = row_count;
  if hit <> 1 then raise exception 'Lançamento previsto não encontrado nesta conta'; end if;
end $$;
revoke execute on function public.reconcile_pair(uuid, uuid, uuid) from public, anon;
grant execute on function public.reconcile_pair(uuid, uuid, uuid) to authenticated;

-- DRE ---------------------------------------------------------------------------
alter table public.categories add column if not exists dre_line text
  check (dre_line in ('receita', 'deducao', 'custo', 'despesa', 'financeiro', 'fora'));

-- Aprovação de pagamentos -------------------------------------------------------
alter table public.workspaces add column if not exists approval_threshold_cents bigint
  check (approval_threshold_cents is null or approval_threshold_cents > 0);
alter table public.transactions
  add column if not exists approval text check (approval in ('pending', 'approved', 'rejected')),
  add column if not exists approved_by uuid references auth.users (id) on delete set null,
  add column if not exists approved_at timestamptz;
create index if not exists tx_approval_pending_idx on public.transactions (workspace_id) where approval = 'pending' and deleted_at is null;

/*
  Despesa manual lançada por quem não é administrador e acima do limite do espaço fica
  "aguardando aprovação" (prevista) até um administrador aprovar. Só administradores mudam a
  aprovação, e um lançamento pendente não pode ser marcado como pago.
*/
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
drop trigger if exists tx_approval on public.transactions;
create trigger tx_approval before insert or update on public.transactions
  for each row execute function public.tx_approval_guard();

-- Avisos ------------------------------------------------------------------------
alter table public.notification_prefs add column if not exists budget_alerts boolean not null default true;

-- Aparelhos conectados ----------------------------------------------------------
create or replace function public.list_my_sessions()
returns table (id uuid, user_agent text, ip text, created_at timestamptz, last_seen timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.id, s.user_agent, host(s.ip), s.created_at, coalesce(s.refreshed_at::timestamptz, s.updated_at, s.created_at)
    from auth.sessions s
   where s.user_id = auth.uid()
   order by 5 desc nulls last
   limit 30
$$;
revoke execute on function public.list_my_sessions() from public, anon;
grant execute on function public.list_my_sessions() to authenticated;

create or replace function public.revoke_my_session(p_id uuid)
returns void language sql security definer set search_path = '' as $$
  delete from auth.sessions where id = p_id and user_id = auth.uid()
$$;
revoke execute on function public.revoke_my_session(uuid) from public, anon;
grant execute on function public.revoke_my_session(uuid) to authenticated;

-- Alertas de orçamento já enviados (não repetir no mesmo mês e nível)
create table if not exists public.budget_alert_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  month date not null,
  level text not null check (level in ('attention', 'over')),
  sent_at timestamptz not null default now(),
  primary key (user_id, category_id, month, level)
);
alter table public.budget_alert_log enable row level security;
-- sem políticas: só o job (service role) lê e grava
