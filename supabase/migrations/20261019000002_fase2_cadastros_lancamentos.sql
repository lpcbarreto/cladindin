-- Fase 2: contas, cartões, categorias, contatos, tags, centros de custo e lançamentos

create type public.account_type as enum ('checking', 'savings', 'cash', 'investment', 'credit_card');
create type public.category_kind as enum ('income', 'expense');
create type public.tx_type as enum ('income', 'expense', 'transfer');
create type public.tx_status as enum ('planned', 'paid', 'cancelled');
create type public.tx_origin as enum ('manual', 'import', 'recurrence', 'installment');

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  type public.account_type not null,
  currency char(3) not null default 'BRL',
  initial_balance_cents bigint not null default 0,
  bank_code text,
  branch text,
  number text,
  archived boolean not null default false,
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index accounts_workspace_idx on public.accounts (workspace_id);

create table public.credit_cards (
  account_id uuid primary key references public.accounts (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  limit_cents bigint not null default 0 check (limit_cents >= 0),
  closing_day smallint not null check (closing_day between 1 and 31),
  due_day smallint not null check (due_day between 1 and 31),
  default_payment_account_id uuid references public.accounts (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  parent_id uuid references public.categories (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  kind public.category_kind not null,
  color text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, parent_id, name)
);
create index categories_workspace_idx on public.categories (workspace_id);

create table public.cost_centers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  document text check (document is null or document ~ '^\d{11}$|^\d{14}$'),
  is_customer boolean not null default false,
  is_supplier boolean not null default false,
  email text,
  phone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contacts_workspace_idx on public.contacts (workspace_id);

-- Lançamentos: amount_cents é sempre positivo. O sinal vem de "type"
-- (receita soma, despesa subtrai). Em transferências, direction diz se sai (-1) ou entra (+1).
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete restrict,
  type public.tx_type not null,
  direction smallint not null check (direction in (-1, 1)),
  amount_cents bigint not null check (amount_cents > 0),
  description text not null check (char_length(description) between 1 and 300),
  notes text,
  competence_date date not null,
  due_date date not null,
  paid_date date,
  status public.tx_status not null default 'planned',
  category_id uuid references public.categories (id) on delete set null,
  contact_id uuid references public.contacts (id) on delete set null,
  cost_center_id uuid references public.cost_centers (id) on delete set null,
  transfer_group_id uuid,
  origin public.tx_origin not null default 'manual',
  import_batch_id uuid,
  external_id text,
  fingerprint text,
  installment_group_id uuid,
  installment_number smallint,
  installment_total smallint,
  recurrence_id uuid,
  reconciled boolean not null default false,
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint tx_direction_matches_type check (
    (type = 'income' and direction = 1) or (type = 'expense' and direction = -1) or type = 'transfer'
  ),
  constraint tx_transfer_has_group check ((type = 'transfer') = (transfer_group_id is not null)),
  constraint tx_paid_has_date check (status <> 'paid' or paid_date is not null)
);
create index tx_ws_date_idx on public.transactions (workspace_id, due_date) where deleted_at is null;
create index tx_ws_account_idx on public.transactions (workspace_id, account_id) where deleted_at is null;
create index tx_fingerprint_idx on public.transactions (fingerprint);
create unique index tx_account_external_uidx on public.transactions (account_id, external_id)
  where external_id is not null and deleted_at is null;
create index tx_transfer_group_idx on public.transactions (transfer_group_id);

create table public.transaction_tags (
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  primary key (transaction_id, tag_id)
);

-- Garante que FKs apontam para o mesmo workspace (impede misturar dados entre workspaces)
create or replace function public.check_same_workspace()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.account_id is not null and not exists (select 1 from accounts where id = new.account_id and workspace_id = new.workspace_id) then
    raise exception 'conta de outro workspace';
  end if;
  if new.category_id is not null and not exists (select 1 from categories where id = new.category_id and workspace_id = new.workspace_id) then
    raise exception 'categoria de outro workspace';
  end if;
  if new.contact_id is not null and not exists (select 1 from contacts where id = new.contact_id and workspace_id = new.workspace_id) then
    raise exception 'contato de outro workspace';
  end if;
  if new.cost_center_id is not null and not exists (select 1 from cost_centers where id = new.cost_center_id and workspace_id = new.workspace_id) then
    raise exception 'centro de custo de outro workspace';
  end if;
  return new;
end $$;

create trigger tx_same_ws before insert or update on public.transactions
  for each row execute function public.check_same_workspace();

create or replace function public.stamp_actor()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then new.created_by = coalesce(new.created_by, auth.uid()); end if;
  new.updated_by = auth.uid();
  return new;
end $$;

create trigger accounts_touch before update on public.accounts for each row execute function public.touch_updated_at();
create trigger credit_cards_touch before update on public.credit_cards for each row execute function public.touch_updated_at();
create trigger categories_touch before update on public.categories for each row execute function public.touch_updated_at();
create trigger cost_centers_touch before update on public.cost_centers for each row execute function public.touch_updated_at();
create trigger tags_touch before update on public.tags for each row execute function public.touch_updated_at();
create trigger contacts_touch before update on public.contacts for each row execute function public.touch_updated_at();
create trigger tx_touch before update on public.transactions for each row execute function public.touch_updated_at();
create trigger accounts_actor before insert or update on public.accounts for each row execute function public.stamp_actor();
create trigger tx_actor before insert or update on public.transactions for each row execute function public.stamp_actor();
create trigger tx_audit after insert or update or delete on public.transactions for each row execute function public.audit_trigger();
create trigger accounts_audit after insert or update or delete on public.accounts for each row execute function public.audit_trigger();

-- Transferência: cria o par de lançamentos vinculados em uma única transação
create or replace function public.create_transfer(
  p_workspace_id uuid, p_from uuid, p_to uuid, p_amount_cents bigint, p_date date,
  p_description text, p_paid boolean default true
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  g uuid := gen_random_uuid();
  st public.tx_status := case when p_paid then 'paid'::public.tx_status else 'planned'::public.tx_status end;
  pd date := case when p_paid then p_date end;
begin
  if p_from = p_to then raise exception 'contas de origem e destino iguais'; end if;
  insert into transactions (workspace_id, account_id, type, direction, amount_cents, description, competence_date, due_date, paid_date, status, transfer_group_id)
  values (p_workspace_id, p_from, 'transfer', -1, p_amount_cents, p_description, p_date, p_date, pd, st, g),
         (p_workspace_id, p_to,   'transfer',  1, p_amount_cents, p_description, p_date, p_date, pd, st, g);
  return g;
end $$;

-- Saldos: inicial + lançamentos pagos e não excluídos
create or replace view public.account_balances with (security_invoker = true) as
select a.id as account_id, a.workspace_id, a.name, a.type, a.archived,
       a.initial_balance_cents + coalesce(sum(t.direction * t.amount_cents) filter (
         where t.status = 'paid' and t.deleted_at is null), 0) as balance_cents,
       a.initial_balance_cents + coalesce(sum(t.direction * t.amount_cents) filter (
         where t.status <> 'cancelled' and t.deleted_at is null), 0) as projected_balance_cents
from public.accounts a
left join public.transactions t on t.account_id = a.id
group by a.id;

-- Categorias padrão ------------------------------------------------------

create or replace function public.seed_default_categories(ws uuid, ws_kind text)
returns void language plpgsql security definer set search_path = public as $$
declare
  parent uuid;
  item record;
  child text;
begin
  for item in
    select * from (values
      ('expense', 'Moradia', array['Aluguel', 'Condomínio', 'Energia', 'Água', 'Internet', 'Manutenção'], 'pf'),
      ('expense', 'Alimentação', array['Supermercado', 'Restaurantes', 'Delivery'], 'pf'),
      ('expense', 'Transporte', array['Combustível', 'Aplicativos', 'Transporte público', 'Estacionamento', 'Manutenção do veículo'], 'pf'),
      ('expense', 'Saúde', array['Plano de saúde', 'Farmácia', 'Consultas'], 'pf'),
      ('expense', 'Educação', array['Mensalidades', 'Cursos', 'Livros'], 'pf'),
      ('expense', 'Lazer', array['Streaming', 'Viagens', 'Eventos'], 'pf'),
      ('expense', 'Compras', array['Vestuário', 'Eletrônicos', 'Casa'], 'pf'),
      ('expense', 'Impostos e taxas', array['IPVA', 'IPTU', 'Tarifas bancárias', 'IOF', 'Juros e multas'], 'pf'),
      ('income', 'Salário', array['Salário', '13º', 'Férias'], 'pf'),
      ('income', 'Outras receitas', array['Rendimentos', 'Reembolsos', 'Vendas'], 'pf'),
      ('income', 'Receita operacional', array['Venda de produtos', 'Prestação de serviços'], 'pj'),
      ('income', 'Receitas financeiras', array['Rendimentos', 'Juros recebidos'], 'pj'),
      ('expense', 'Custos', array['Fornecedores', 'Matéria-prima', 'Frete'], 'pj'),
      ('expense', 'Despesas com pessoal', array['Salários', 'Pró-labore', 'Encargos', 'Benefícios'], 'pj'),
      ('expense', 'Despesas administrativas', array['Aluguel', 'Contabilidade', 'Softwares', 'Material de escritório', 'Energia', 'Internet'], 'pj'),
      ('expense', 'Despesas comerciais', array['Marketing', 'Comissões'], 'pj'),
      ('expense', 'Impostos', array['Simples Nacional', 'ISS', 'ICMS', 'IRPJ/CSLL'], 'pj'),
      ('expense', 'Despesas financeiras', array['Tarifas bancárias', 'Juros', 'IOF'], 'pj')
    ) as v(kind, name, children, scope)
    where v.scope = ws_kind
  loop
    insert into categories (workspace_id, name, kind) values (ws, item.name, item.kind::public.category_kind)
    returning id into parent;
    foreach child in array item.children loop
      insert into categories (workspace_id, parent_id, name, kind) values (ws, parent, child, item.kind::public.category_kind);
    end loop;
  end loop;
end $$;

create or replace function public.on_workspace_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_default_categories(new.id, new.kind);
  insert into public.accounts (workspace_id, name, type, created_by) values (new.id, 'Carteira', 'cash', new.created_by);
  return new;
end $$;

create trigger workspace_seed after insert on public.workspaces
  for each row execute function public.on_workspace_created();

-- Workspaces já existentes recebem a semente uma vez
do $$
declare w record;
begin
  for w in select id, kind, created_by from public.workspaces where not exists (select 1 from public.categories c where c.workspace_id = workspaces.id) loop
    perform public.seed_default_categories(w.id, w.kind);
    insert into public.accounts (workspace_id, name, type, created_by) values (w.id, 'Carteira', 'cash', w.created_by);
  end loop;
end $$;

-- RLS ---------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['accounts', 'credit_cards', 'categories', 'cost_centers', 'tags', 'contacts', 'transactions', 'transaction_tags'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (public.is_member(workspace_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert with check (public.is_member(workspace_id, ''editor''))', t || '_insert', t);
    execute format('create policy %I on public.%I for update using (public.is_member(workspace_id, ''editor'')) with check (public.is_member(workspace_id, ''editor''))', t || '_update', t);
    execute format('create policy %I on public.%I for delete using (public.is_member(workspace_id, ''editor''))', t || '_delete', t);
  end loop;
end $$;
