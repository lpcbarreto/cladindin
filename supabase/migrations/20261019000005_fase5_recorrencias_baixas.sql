-- Fase 5: recorrências, baixa (total/parcial, juros, multa, desconto) e comprovantes

create type public.recurrence_frequency as enum ('daily', 'weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'semiannual', 'yearly');
create type public.recurrence_status as enum ('active', 'paused', 'ended');

create table public.recurrence_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  type public.tx_type not null,
  account_id uuid not null references public.accounts (id) on delete cascade,
  to_account_id uuid references public.accounts (id) on delete cascade,
  amount_cents bigint not null check (amount_cents > 0),
  variable_amount boolean not null default false,
  description text not null check (char_length(description) between 1 and 200),
  category_id uuid references public.categories (id) on delete set null,
  contact_id uuid references public.contacts (id) on delete set null,
  frequency public.recurrence_frequency not null default 'monthly',
  interval_count int not null default 1 check (interval_count between 1 and 36),
  day_mode text not null default 'fixed' check (day_mode in ('fixed', 'last', 'business')),
  day int not null default 1 check (day between 1 and 31),
  start_date date not null,
  end_mode text not null default 'never' check (end_mode in ('never', 'until', 'count')),
  until_date date,
  occurrence_count int check (occurrence_count is null or occurrence_count between 1 and 1000),
  weekend_adjust text not null default 'none' check (weekend_adjust in ('none', 'before', 'after')),
  horizon_months int not null default 12 check (horizon_months between 1 and 36),
  status public.recurrence_status not null default 'active',
  generated_until date,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurrence_transfer_target check ((type = 'transfer') = (to_account_id is not null))
);
create index recurrence_rules_ws_idx on public.recurrence_rules (workspace_id, status);
create trigger recurrence_rules_touch before update on public.recurrence_rules for each row execute function public.touch_updated_at();
create trigger recurrence_rules_audit after insert or update or delete on public.recurrence_rules for each row execute function public.audit_trigger();

alter table public.transactions
  add constraint transactions_recurrence_fk foreign key (recurrence_id) references public.recurrence_rules (id) on delete set null,
  add column recurrence_date date,
  add column recurrence_detached boolean not null default false,
  add column original_amount_cents bigint,
  add column interest_cents bigint not null default 0 check (interest_cents >= 0),
  add column fine_cents bigint not null default 0 check (fine_cents >= 0),
  add column discount_cents bigint not null default 0 check (discount_cents >= 0),
  add column parent_transaction_id uuid references public.transactions (id) on delete set null;

-- Idempotência da geração: uma ocorrência (e lado da transferência) por data-base.
-- Inclui excluídos de propósito: "excluir só esta" não é recriada pelo job.
create unique index tx_recurrence_occurrence_uidx on public.transactions (recurrence_id, recurrence_date, direction);

alter table public.recurrence_rules enable row level security;
create policy recurrence_select on public.recurrence_rules for select using (public.is_member(workspace_id));
create policy recurrence_write on public.recurrence_rules for all
  using (public.is_member(workspace_id, 'editor')) with check (public.is_member(workspace_id, 'editor'));

/*
  Baixa de um lançamento previsto.
  p_principal_cents: quanto do valor original está sendo quitado.
  Juros e multa somam ao valor pago; desconto abate do saldo devedor.
  Se principal + desconto < original, o restante vira um novo previsto (baixa parcial).
*/
create or replace function public.settle_transaction(
  p_id uuid, p_paid_date date, p_principal_cents bigint, p_interest_cents bigint default 0,
  p_fine_cents bigint default 0, p_discount_cents bigint default 0, p_account_id uuid default null
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  t transactions;
  original bigint;
  remaining bigint;
  rest uuid;
begin
  select * into t from transactions where id = p_id and deleted_at is null for update;
  if t.id is null then raise exception 'Lançamento não encontrado.'; end if;
  if t.status <> 'planned' then raise exception 'Este lançamento já foi baixado ou cancelado.'; end if;
  if t.type = 'transfer' then raise exception 'Use a baixa em massa para transferências.'; end if;
  if p_principal_cents <= 0 then raise exception 'Informe o valor pago.'; end if;
  if least(p_interest_cents, p_fine_cents, p_discount_cents) < 0 then raise exception 'Valores não podem ser negativos.'; end if;
  original := t.amount_cents;
  if p_principal_cents + p_discount_cents > original then
    raise exception 'Valor pago mais desconto passa do valor do lançamento (%).', to_char(original / 100.0, 'FM999G999G990D00');
  end if;
  remaining := original - p_principal_cents - p_discount_cents;

  update transactions set
    status = 'paid',
    paid_date = p_paid_date,
    account_id = coalesce(p_account_id, account_id),
    original_amount_cents = original,
    amount_cents = p_principal_cents + p_interest_cents + p_fine_cents,
    interest_cents = p_interest_cents,
    fine_cents = p_fine_cents,
    discount_cents = p_discount_cents,
    recurrence_detached = recurrence_id is not null
  where id = p_id;

  if remaining > 0 then
    insert into transactions (
      workspace_id, account_id, type, direction, amount_cents, description, notes, competence_date, due_date,
      status, category_id, contact_id, cost_center_id, origin, parent_transaction_id
    ) values (
      t.workspace_id, t.account_id, t.type, t.direction, remaining,
      left(t.description, 280) || ' (saldo)', t.notes, t.competence_date, t.due_date,
      'planned', t.category_id, t.contact_id, t.cost_center_id, t.origin, t.id
    ) returning id into rest;
  end if;
  return jsonb_build_object('paid_cents', p_principal_cents + p_interest_cents + p_fine_cents, 'remaining_cents', remaining, 'remaining_id', rest);
end $$;

-- Comprovantes ------------------------------------------------------------

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  size_bytes int not null check (size_bytes > 0 and size_bytes <= 10485760),
  mime_type text not null,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index attachments_tx_idx on public.attachments (transaction_id);
alter table public.attachments enable row level security;
create policy attachments_select on public.attachments for select using (public.is_member(workspace_id));
create policy attachments_insert on public.attachments for insert with check (public.is_member(workspace_id, 'editor'));
create policy attachments_delete on public.attachments for delete using (public.is_member(workspace_id, 'editor'));

-- Bucket privado; caminho = <workspace_id>/<transaction_id>/<arquivo>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comprovantes', 'comprovantes', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

create policy comprovantes_select on storage.objects for select to authenticated
  using (bucket_id = 'comprovantes' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy comprovantes_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'comprovantes' and public.is_member(((storage.foldername(name))[1])::uuid, 'editor'));
create policy comprovantes_delete on storage.objects for delete to authenticated
  using (bucket_id = 'comprovantes' and public.is_member(((storage.foldername(name))[1])::uuid, 'editor'));

notify pgrst, 'reload schema';
