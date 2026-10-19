-- Fase 4: faturas de cartão, parcelamentos, estornos e modelos de importação CSV

-- Estornos/créditos de cartão são despesa com sinal positivo (reduzem o gasto, não viram receita)
alter table public.transactions drop constraint tx_direction_matches_type;
alter table public.transactions add constraint tx_direction_matches_type check (
  type = 'transfer' or (type = 'income' and direction = 1) or type = 'expense'
);

create type public.invoice_status as enum ('open', 'closed', 'paid');

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  period_start date not null,
  closing_date date not null,
  due_date date not null,
  declared_total_cents bigint,
  paid_at date,
  payment_transfer_group_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, due_date)
);
create index invoices_ws_idx on public.invoices (workspace_id, due_date);
create trigger invoices_touch before update on public.invoices for each row execute function public.touch_updated_at();

alter table public.transactions
  add column invoice_id uuid references public.invoices (id) on delete set null,
  add column cardholder text,
  add column installment_key text;
create index tx_invoice_idx on public.transactions (invoice_id) where invoice_id is not null;
create index tx_installment_idx on public.transactions (account_id, installment_key) where installment_key is not null;

-- Modelos de mapeamento de CSV, reconhecidos pela assinatura do cabeçalho
create table public.import_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  account_id uuid references public.accounts (id) on delete cascade,
  name text not null,
  header_signature text not null,
  config jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, header_signature)
);
create trigger import_templates_touch before update on public.import_templates for each row execute function public.touch_updated_at();

alter table public.invoices enable row level security;
alter table public.import_templates enable row level security;
create policy invoices_select on public.invoices for select using (public.is_member(workspace_id));
create policy invoices_write on public.invoices for all
  using (public.is_member(workspace_id, 'editor')) with check (public.is_member(workspace_id, 'editor'));
create policy import_templates_select on public.import_templates for select using (public.is_member(workspace_id));
create policy import_templates_write on public.import_templates for all
  using (public.is_member(workspace_id, 'editor')) with check (public.is_member(workspace_id, 'editor'));

-- Datas da fatura --------------------------------------------------------

create or replace function public.day_in_month(p_month date, p_day int)
returns date language sql immutable as $$
  select (date_trunc('month', p_month)::date
          + (least(p_day, extract(day from (date_trunc('month', p_month) + interval '1 month - 1 day'))::int) - 1))
$$;

/** Fechamento e vencimento da fatura em que cai uma compra feita em p_date. */
create or replace function public.invoice_dates_for_purchase(p_closing_day int, p_due_day int, p_date date,
  out closing_date date, out due_date date)
language plpgsql immutable as $$
begin
  closing_date := public.day_in_month(p_date, p_closing_day);
  -- Compra no dia do fechamento ou depois entra na próxima fatura
  if p_date >= closing_date then
    closing_date := public.day_in_month((p_date + interval '1 month')::date, p_closing_day);
  end if;
  if p_due_day > p_closing_day then
    due_date := public.day_in_month(closing_date, p_due_day);
  else
    due_date := public.day_in_month((closing_date + interval '1 month')::date, p_due_day);
  end if;
end $$;

/** Busca ou cria a fatura do cartão com o vencimento informado. */
create or replace function public.ensure_invoice(p_account_id uuid, p_due_date date)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  inv uuid;
  cc record;
  closing date;
begin
  select id into inv from invoices where account_id = p_account_id and due_date = p_due_date;
  if inv is not null then return inv; end if;
  select c.closing_day, c.due_day, a.workspace_id into cc
  from credit_cards c join accounts a on a.id = c.account_id where c.account_id = p_account_id;
  if cc is null then raise exception 'Cartão sem dia de fechamento e vencimento configurados.'; end if;
  closing := case when cc.due_day > cc.closing_day
    then public.day_in_month(p_due_date, cc.closing_day)
    else public.day_in_month((p_due_date - interval '1 month')::date, cc.closing_day) end;
  insert into invoices (workspace_id, account_id, period_start, closing_date, due_date)
  values (cc.workspace_id, p_account_id, (closing - interval '1 month' + interval '1 day')::date, closing, p_due_date)
  on conflict (account_id, due_date) do nothing
  returning id into inv;
  if inv is null then
    select id into inv from invoices where account_id = p_account_id and due_date = p_due_date;
  end if;
  return inv;
end $$;

create or replace function public.invoice_for_purchase(p_account_id uuid, p_date date)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  cc record;
  d record;
begin
  select closing_day, due_day into cc from credit_cards where account_id = p_account_id;
  if cc is null then return null; end if;
  select * into d from public.invoice_dates_for_purchase(cc.closing_day, cc.due_day, p_date);
  return public.ensure_invoice(p_account_id, d.due_date);
end $$;

-- Toda compra lançada num cartão entra automaticamente na fatura certa
create or replace function public.assign_invoice()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  inv record;
begin
  if new.type = 'transfer' then return new; end if;
  if not exists (select 1 from accounts where id = new.account_id and type = 'credit_card') then return new; end if;
  if new.invoice_id is null then
    new.invoice_id := public.invoice_for_purchase(new.account_id, new.competence_date);
  end if;
  if new.invoice_id is not null then
    select due_date into inv from invoices where id = new.invoice_id;
    new.due_date := inv.due_date;
  end if;
  return new;
end $$;

create trigger tx_assign_invoice before insert on public.transactions
  for each row execute function public.assign_invoice();

-- Resumo das faturas: total calculado pelas linhas
create or replace view public.invoice_summaries with (security_invoker = true) as
select i.*,
  coalesce(-sum(t.direction * t.amount_cents) filter (where t.deleted_at is null and t.status <> 'cancelled'), 0) as total_cents,
  count(t.id) filter (where t.deleted_at is null and t.status <> 'cancelled') as items,
  case when i.paid_at is not null then 'paid'::invoice_status
       when current_date >= i.closing_date then 'closed'::invoice_status
       else 'open'::invoice_status end as status
from public.invoices i
left join public.transactions t on t.invoice_id = i.id and t.type <> 'transfer'
group by i.id;

-- Pagamento da fatura = transferência da conta para o cartão (não é despesa)
create or replace function public.pay_invoice(p_invoice_id uuid, p_from_account uuid, p_amount_cents bigint, p_date date)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  inv invoices;
  g uuid;
begin
  select * into inv from invoices where id = p_invoice_id;
  if inv.id is null then raise exception 'Fatura não encontrada.'; end if;
  if p_amount_cents <= 0 then raise exception 'Informe um valor maior que zero.'; end if;
  g := public.create_transfer(inv.workspace_id, p_from_account, inv.account_id, p_amount_cents, p_date,
    'Pagamento fatura ' || to_char(inv.due_date, 'MM/YYYY'), true);
  update invoices set paid_at = p_date, payment_transfer_group_id = g where id = inv.id;
  return g;
end $$;

-- Parcelamento manual: N parcelas mensais (centavos de ajuste na última)
create or replace function public.create_installments(
  p_workspace_id uuid, p_account_id uuid, p_type tx_type, p_total_cents bigint, p_count int,
  p_first_date date, p_description text, p_category_id uuid, p_contact_id uuid, p_first_paid boolean default false
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  g uuid := gen_random_uuid();
  base bigint;
  amt bigint;
  is_card boolean;
  first_inv uuid;
  first_due date;
  d date;
  i int;
begin
  if p_count < 2 or p_count > 120 then raise exception 'Use de 2 a 120 parcelas.'; end if;
  if p_total_cents < p_count then raise exception 'Valor pequeno demais para parcelar.'; end if;
  if p_type = 'transfer' then raise exception 'Transferências não podem ser parceladas.'; end if;
  base := p_total_cents / p_count;
  select type = 'credit_card' into is_card from accounts where id = p_account_id and workspace_id = p_workspace_id;
  if is_card is null then raise exception 'Conta inválida.'; end if;
  if is_card then
    first_inv := public.invoice_for_purchase(p_account_id, p_first_date);
    select due_date into first_due from invoices where id = first_inv;
  end if;

  for i in 1..p_count loop
    amt := case when i = p_count then p_total_cents - base * (p_count - 1) else base end;
    d := (p_first_date + make_interval(months => i - 1))::date;
    insert into transactions (
      workspace_id, account_id, type, direction, amount_cents, description, competence_date, due_date,
      paid_date, status, category_id, contact_id, origin, installment_group_id, installment_number,
      installment_total, invoice_id
    ) values (
      p_workspace_id, p_account_id, p_type, case when p_type = 'income' then 1 else -1 end, amt,
      left(p_description, 280) || ' (' || i || '/' || p_count || ')', d, d,
      -- No cartão a 1ª parcela já está na fatura atual; as demais ficam previstas nas próximas
      case when i = 1 and (is_card or p_first_paid) then d end,
      case when i = 1 and (is_card or p_first_paid) then 'paid'::tx_status else 'planned'::tx_status end,
      p_category_id, p_contact_id, 'installment', g, i, p_count,
      case when is_card then public.ensure_invoice(p_account_id, (first_due + make_interval(months => i - 1))::date) end
    );
  end loop;
  return g;
end $$;

/*
  commit_import v2: além da v1 (dedupe, conciliação), trata cartão e parcelas.
  Campos extras por linha: cardholder, installment_number, installment_total, installment_key.
  p_invoice_due_date: vencimento da fatura importada (cartão). Linhas vão para essa fatura e as
  parcelas futuras são projetadas nas faturas seguintes como previstas.
*/
drop function if exists public.commit_import(uuid, uuid, text, text, text, int, bigint, date, text, text, jsonb);

create or replace function public.commit_import(
  p_workspace_id uuid,
  p_account_id uuid,
  p_file_name text,
  p_file_hash text,
  p_parser text,
  p_total_rows int,
  p_balance_cents bigint,
  p_balance_date date,
  p_bank_id text,
  p_external_account_id text,
  p_rows jsonb,
  p_invoice_due_date date default null,
  p_declared_total_cents bigint default null
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  b uuid;
  r jsonb;
  amt bigint;
  ext text;
  fp text;
  is_card boolean;
  inv uuid;
  inv_due date;
  n int;
  t int;
  k text;
  grp uuid;
  i int;
  n_new int := 0;
  n_dup int := 0;
  n_rec int := 0;
  n_proj int := 0;
  hit int;
  matched uuid;
begin
  if not public.is_member(p_workspace_id, 'editor') then
    raise exception 'Você não tem permissão para importar neste workspace.';
  end if;
  select type = 'credit_card' into is_card from accounts where id = p_account_id and workspace_id = p_workspace_id;
  if is_card is null then raise exception 'Conta inválida.'; end if;

  if is_card and p_invoice_due_date is not null then
    inv := public.ensure_invoice(p_account_id, p_invoice_due_date);
    inv_due := p_invoice_due_date;
    if p_declared_total_cents is not null then
      update invoices set declared_total_cents = p_declared_total_cents where id = inv;
    end if;
  end if;

  insert into import_batches (workspace_id, account_id, file_name, file_hash, parser, total_rows, statement_balance_cents, statement_balance_date)
  values (p_workspace_id, p_account_id, left(p_file_name, 200), p_file_hash, p_parser, p_total_rows, p_balance_cents, p_balance_date)
  returning id into b;

  if p_external_account_id is not null and p_external_account_id <> '' then
    insert into account_import_links (workspace_id, account_id, bank_id, external_account_id)
    values (p_workspace_id, p_account_id, coalesce(p_bank_id, ''), p_external_account_id)
    on conflict (workspace_id, bank_id, external_account_id) do update set account_id = excluded.account_id;
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    amt := (r ->> 'amount_cents')::bigint;
    ext := nullif(r ->> 'external_id', '');
    fp := r ->> 'fingerprint';
    n := nullif(r ->> 'installment_number', '')::int;
    t := nullif(r ->> 'installment_total', '')::int;
    k := nullif(r ->> 'installment_key', '');
    if amt is null or amt = 0 or fp is null then continue; end if;

    select count(*) into hit from transactions
    where account_id = p_account_id and deleted_at is null
      and ((ext is not null and external_id = ext) or fingerprint = fp);
    if hit > 0 then
      n_dup := n_dup + 1;
      continue;
    end if;

    -- Parcela já projetada por uma importação anterior: confirma a prevista
    if k is not null and n is not null then
      select id, installment_group_id into matched, grp from transactions
      where account_id = p_account_id and installment_key = k and installment_number = n
        and installment_total = t and status = 'planned' and deleted_at is null
        and abs(amount_cents - abs(amt)) <= 2
      order by due_date limit 1;
      if matched is not null then
        update transactions set status = 'paid', paid_date = (r ->> 'date')::date, external_id = ext,
          fingerprint = fp, statement_description = left(r ->> 'description', 300), reconciled = true,
          reconciled_import_batch_id = b, invoice_id = coalesce(inv, invoice_id),
          due_date = coalesce(inv_due, due_date)
        where id = matched;
        n_rec := n_rec + 1;
        continue;
      end if;
    end if;

    if nullif(r ->> 'reconcile_tx_id', '') is not null then
      update transactions set
        status = 'paid', paid_date = (r ->> 'date')::date, amount_cents = abs(amt), external_id = ext,
        fingerprint = fp, statement_description = left(r ->> 'description', 300), reconciled = true,
        reconciled_import_batch_id = b
      where id = (r ->> 'reconcile_tx_id')::uuid
        and workspace_id = p_workspace_id and account_id = p_account_id
        and status = 'planned' and deleted_at is null and sign(direction) = sign(amt);
      get diagnostics hit = row_count;
      if hit = 1 then
        n_rec := n_rec + 1;
        continue;
      end if;
    end if;

    grp := null;
    if k is not null and t is not null then
      select installment_group_id into grp from transactions
      where account_id = p_account_id and installment_key = k and installment_total = t
        and installment_group_id is not null and deleted_at is null limit 1;
      grp := coalesce(grp, gen_random_uuid());
    end if;

    insert into transactions (
      workspace_id, account_id, type, direction, amount_cents, description, statement_description,
      competence_date, due_date, paid_date, status, category_id, origin, import_batch_id,
      external_id, fingerprint, reconciled, cardholder, invoice_id,
      installment_group_id, installment_number, installment_total, installment_key
    ) values (
      p_workspace_id, p_account_id,
      case when is_card or amt < 0 then 'expense'::tx_type else 'income'::tx_type end,
      sign(amt)::smallint, abs(amt), left(r ->> 'description', 300), left(r ->> 'description', 300),
      (r ->> 'date')::date, coalesce(inv_due, (r ->> 'date')::date), (r ->> 'date')::date, 'paid',
      nullif(r ->> 'category_id', '')::uuid, 'import', b, ext, fp, true,
      nullif(r ->> 'cardholder', ''), inv, grp, n, t, k
    );
    n_new := n_new + 1;

    -- Projeta as parcelas seguintes como previstas nas próximas faturas
    if grp is not null and n is not null and t is not null and n < t and amt < 0 then
      for i in (n + 1)..t loop
        if not exists (select 1 from transactions where installment_group_id = grp and installment_number = i and deleted_at is null) then
          insert into transactions (
            workspace_id, account_id, type, direction, amount_cents, description, competence_date, due_date,
            status, category_id, origin, import_batch_id, cardholder, invoice_id,
            installment_group_id, installment_number, installment_total, installment_key
          ) values (
            p_workspace_id, p_account_id, 'expense', -1, abs(amt),
            left(regexp_replace(r ->> 'description', '\s*\(?\d{1,2}\s*(/|de)\s*\d{1,2}\)?\s*$', '', 'i'), 280) || ' (' || i || '/' || t || ')',
            ((r ->> 'date')::date + make_interval(months => i - n))::date,
            coalesce((inv_due + make_interval(months => i - n))::date, ((r ->> 'date')::date + make_interval(months => i - n))::date),
            'planned', nullif(r ->> 'category_id', '')::uuid, 'installment', b, nullif(r ->> 'cardholder', ''),
            case when is_card and inv_due is not null
              then public.ensure_invoice(p_account_id, (inv_due + make_interval(months => i - n))::date) end,
            grp, i, t, k
          );
          n_proj := n_proj + 1;
        end if;
      end loop;
    end if;
  end loop;

  update import_batches set new_rows = n_new, duplicate_rows = n_dup, reconciled_rows = n_rec where id = b;
  return jsonb_build_object('batch_id', b, 'new', n_new, 'duplicates', n_dup, 'reconciled', n_rec,
    'projected', n_proj, 'invoice_id', inv);
end $$;

-- Desfazer também remove as parcelas projetadas pela importação (já cobertas por import_batch_id)
notify pgrst, 'reload schema';
