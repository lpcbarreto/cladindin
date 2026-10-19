-- Fase 3: importação de extratos (OFX), deduplicação, conciliação e desfazer

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  file_name text not null,
  file_hash text not null,
  parser text not null,
  total_rows int not null default 0,
  new_rows int not null default 0,
  duplicate_rows int not null default 0,
  reconciled_rows int not null default 0,
  statement_balance_cents bigint,
  statement_balance_date date,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  undone_at timestamptz,
  undone_by uuid references auth.users (id)
);
create index import_batches_ws_idx on public.import_batches (workspace_id, created_at desc);
create index import_batches_hash_idx on public.import_batches (account_id, file_hash);

-- Vínculo BANKID/ACCTID do arquivo → conta do sistema, para detectar a conta nas próximas vezes
create table public.account_import_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  bank_id text not null default '',
  external_account_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, bank_id, external_account_id)
);

alter table public.transactions
  add constraint transactions_import_batch_fk foreign key (import_batch_id) references public.import_batches (id) on delete set null,
  add column reconciled_import_batch_id uuid references public.import_batches (id) on delete set null,
  add column statement_description text;

create index tx_import_batch_idx on public.transactions (import_batch_id) where import_batch_id is not null;
create index tx_reconciled_batch_idx on public.transactions (reconciled_import_batch_id) where reconciled_import_batch_id is not null;
create index tx_account_fingerprint_idx on public.transactions (account_id, fingerprint) where deleted_at is null;

create trigger import_batches_touch before update on public.import_batches for each row execute function public.touch_updated_at();
create trigger import_links_touch before update on public.account_import_links for each row execute function public.touch_updated_at();

alter table public.import_batches enable row level security;
alter table public.account_import_links enable row level security;
create policy import_batches_select on public.import_batches for select using (public.is_member(workspace_id));
create policy import_batches_insert on public.import_batches for insert with check (public.is_member(workspace_id, 'editor'));
create policy import_batches_update on public.import_batches for update
  using (public.is_member(workspace_id, 'editor')) with check (public.is_member(workspace_id, 'editor'));
create policy import_links_select on public.account_import_links for select using (public.is_member(workspace_id));
create policy import_links_write on public.account_import_links for all
  using (public.is_member(workspace_id, 'editor')) with check (public.is_member(workspace_id, 'editor'));

/*
  Grava uma importação de forma atômica. p_rows: array de objetos
  { date, amount_cents (com sinal), description, external_id, fingerprint, category_id, reconcile_tx_id }
  - reconcile_tx_id: marca o previsto como pago em vez de criar um novo
  - linhas cujo FITID ou fingerprint já existam na conta são ignoradas (nunca duplica)
  Roda como o usuário (security invoker): o RLS continua valendo.
*/
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
  p_rows jsonb
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  b uuid;
  r jsonb;
  amt bigint;
  ext text;
  fp text;
  n_new int := 0;
  n_dup int := 0;
  n_rec int := 0;
  hit int;
begin
  if not public.is_member(p_workspace_id, 'editor') then
    raise exception 'Você não tem permissão para importar neste workspace.';
  end if;
  if not exists (select 1 from accounts where id = p_account_id and workspace_id = p_workspace_id) then
    raise exception 'Conta inválida.';
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
    if amt is null or amt = 0 or fp is null then continue; end if;

    -- Já importado? (FITID ou fingerprint na mesma conta)
    select count(*) into hit from transactions
    where account_id = p_account_id and deleted_at is null
      and ((ext is not null and external_id = ext) or fingerprint = fp);
    if hit > 0 then
      n_dup := n_dup + 1;
      continue;
    end if;

    if nullif(r ->> 'reconcile_tx_id', '') is not null then
      update transactions set
        status = 'paid',
        paid_date = (r ->> 'date')::date,
        amount_cents = abs(amt),
        external_id = ext,
        fingerprint = fp,
        statement_description = left(r ->> 'description', 300),
        reconciled = true,
        reconciled_import_batch_id = b
      where id = (r ->> 'reconcile_tx_id')::uuid
        and workspace_id = p_workspace_id and account_id = p_account_id
        and status = 'planned' and deleted_at is null
        and sign(direction) = sign(amt);
      get diagnostics hit = row_count;
      if hit = 1 then
        n_rec := n_rec + 1;
        continue;
      end if;
    end if;

    insert into transactions (
      workspace_id, account_id, type, direction, amount_cents, description, statement_description,
      competence_date, due_date, paid_date, status, category_id, origin, import_batch_id,
      external_id, fingerprint, reconciled
    ) values (
      p_workspace_id, p_account_id,
      case when amt > 0 then 'income'::tx_type else 'expense'::tx_type end,
      sign(amt)::smallint, abs(amt), left(r ->> 'description', 300), left(r ->> 'description', 300),
      (r ->> 'date')::date, (r ->> 'date')::date, (r ->> 'date')::date, 'paid',
      nullif(r ->> 'category_id', '')::uuid, 'import', b, ext, fp, true
    );
    n_new := n_new + 1;
  end loop;

  update import_batches set new_rows = n_new, duplicate_rows = n_dup, reconciled_rows = n_rec where id = b;
  return jsonb_build_object('batch_id', b, 'new', n_new, 'duplicates', n_dup, 'reconciled', n_rec);
end $$;

-- Desfaz uma importação: remove os criados e devolve os conciliados ao estado "previsto"
create or replace function public.undo_import(p_batch_id uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  ws uuid;
  n_del int;
  n_rev int;
begin
  select workspace_id into ws from import_batches where id = p_batch_id and undone_at is null;
  if ws is null then raise exception 'Importação não encontrada ou já desfeita.'; end if;
  if not public.is_member(ws, 'editor') then raise exception 'Você não tem permissão.'; end if;

  update transactions set deleted_at = now()
  where import_batch_id = p_batch_id and deleted_at is null;
  get diagnostics n_del = row_count;

  update transactions set
    status = 'planned', paid_date = null, external_id = null, fingerprint = null,
    statement_description = null, reconciled = false, reconciled_import_batch_id = null
  where reconciled_import_batch_id = p_batch_id;
  get diagnostics n_rev = row_count;

  update import_batches set undone_at = now(), undone_by = auth.uid() where id = p_batch_id;
  return jsonb_build_object('removed', n_del, 'reverted', n_rev);
end $$;

-- Saldo realizado da conta numa data (para conferir com o saldo do extrato)
create or replace function public.account_balance_at(p_account_id uuid, p_date date)
returns bigint language sql stable security invoker set search_path = public as $$
  select a.initial_balance_cents + coalesce((
    select sum(t.direction * t.amount_cents) from transactions t
    where t.account_id = a.id and t.status = 'paid' and t.deleted_at is null and t.paid_date <= p_date
  ), 0)
  from accounts a where a.id = p_account_id
$$;

notify pgrst, 'reload schema';
