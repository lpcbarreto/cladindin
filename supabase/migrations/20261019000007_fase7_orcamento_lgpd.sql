-- Fase 7: orçamento por categoria, ajustes de parcelas e LGPD

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  -- null = vale para todos os meses; preenchido = só aquele mês (AAAA-MM-01)
  month date check (month is null or extract(day from month) = 1),
  amount_cents bigint not null check (amount_cents > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index budgets_default_uidx on public.budgets (workspace_id, category_id) where month is null;
create unique index budgets_month_uidx on public.budgets (workspace_id, category_id, month) where month is not null;
create trigger budgets_touch before update on public.budgets for each row execute function public.touch_updated_at();
alter table public.budgets enable row level security;
create policy budgets_select on public.budgets for select using (public.is_member(workspace_id));
create policy budgets_write on public.budgets for all
  using (public.is_member(workspace_id, 'editor')) with check (public.is_member(workspace_id, 'editor'));

-- Nome-base da parcela: "LOJA X - Parcela 3/10" → "LOJA X"
create or replace function public.installment_base_description(p text)
returns text language sql immutable as $$
  select coalesce(nullif(trim(regexp_replace(regexp_replace(
    p,
    '\s*[-–]?\s*\(?\s*(parc(ela)?\.?\s*)?\d{1,2}\s*(/|de)\s*\d{1,2}\s*\)?\s*$',
    '', 'i'),
    '\s*[-–]?\s*parc(ela)?\.?\s*$', '', 'i')), ''), p)
$$;

-- Corrige descrições já projetadas ("... - Parcela (4/10)")
update public.transactions
set description = public.installment_base_description(regexp_replace(description, '\s*\(\d{1,2}/\d{1,2}\)\s*$', ''))
  || ' (' || installment_number || '/' || installment_total || ')'
where origin = 'installment' and installment_number is not null and description ~* 'parc';

-- commit_import com o nome-base corrigido nas parcelas projetadas
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
            left(public.installment_base_description(r ->> 'description'), 280) || ' (' || i || '/' || t || ')',
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

-- LGPD: exclusão do workspace inteiro (somente o proprietário)
create or replace function public.delete_workspace(p_workspace_id uuid, p_confirm_name text)
returns void language plpgsql security definer set search_path = public as $$
declare
  ws record;
begin
  select id, name into ws from workspaces where id = p_workspace_id;
  if ws.id is null then raise exception 'Workspace não encontrado.'; end if;
  if not public.is_member(p_workspace_id, 'owner') then raise exception 'Só o proprietário pode excluir o workspace.'; end if;
  if ws.name <> p_confirm_name then raise exception 'O nome digitado não confere.'; end if;
  delete from workspaces where id = p_workspace_id; -- cascata remove todos os dados
end $$;
revoke execute on function public.delete_workspace(uuid, text) from anon;

notify pgrst, 'reload schema';
