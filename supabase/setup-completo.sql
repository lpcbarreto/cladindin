-- Cladindin: instalação completa para um banco NOVO (todas as migrations, em ordem).
-- Cole tudo no SQL Editor do Supabase e clique em Run. Em banco que já tem o Cladindin,
-- aplique só as migrations que faltam (supabase/migrations).


-- ===== 20261019000001_fase1_workspaces.sql =====
-- Fase 1: workspaces, membros, convites, auditoria e RLS
create extension if not exists pgcrypto;

create type public.member_role as enum ('owner', 'admin', 'editor', 'viewer');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  kind text not null default 'pf' check (kind in ('pf', 'pj')),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'editor',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null,
  role public.member_role not null default 'editor' check (role <> 'owner'),
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index invites_workspace_idx on public.invites (workspace_id);

create table public.audit_log (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  table_name text not null,
  record_id text not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  actor_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_workspace_idx on public.audit_log (workspace_id, created_at desc);

-- Helpers -----------------------------------------------------------------

create or replace function public.role_rank(r public.member_role)
returns int language sql immutable as $$
  select case r when 'owner' then 4 when 'admin' then 3 when 'editor' then 2 else 1 end
$$;

-- security definer evita recursão de RLS em workspace_members
create or replace function public.is_member(ws uuid, min_role public.member_role default 'viewer')
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid()
      and public.role_rank(m.role) >= public.role_rank(min_role)
  )
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger workspaces_touch before update on public.workspaces for each row execute function public.touch_updated_at();
create trigger members_touch before update on public.workspace_members for each row execute function public.touch_updated_at();
create trigger invites_touch before update on public.invites for each row execute function public.touch_updated_at();

-- Auditoria genérica: qualquer tabela com workspace_id pode usar este trigger
create or replace function public.audit_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  rec jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.audit_log (workspace_id, table_name, record_id, action, actor_id, old_data, new_data)
  values (
    (rec ->> 'workspace_id')::uuid,
    tg_table_name,
    coalesce(rec ->> 'id', rec ->> 'user_id'),
    lower(tg_op),
    auth.uid(),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

create trigger members_audit after insert or update or delete on public.workspace_members
  for each row execute function public.audit_trigger();

-- Novo usuário: cria perfil e workspace "Pessoal"
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ws uuid;
begin
  insert into public.profiles (id, full_name) values (new.id, new.raw_user_meta_data ->> 'full_name');
  insert into public.workspaces (name, kind, created_by) values ('Pessoal', 'pf', new.id) returning id into ws;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws, new.id, 'owner');
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Criar workspace adicional (quem cria vira owner)
create or replace function public.create_workspace(p_name text, p_kind text default 'pf')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  ws uuid;
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  insert into public.workspaces (name, kind, created_by) values (p_name, p_kind, auth.uid()) returning id into ws;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws, auth.uid(), 'owner');
  return ws;
end $$;

-- Aceitar convite: valida token, expiração e e-mail do usuário logado
create or replace function public.accept_invite(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  inv public.invites;
  user_email text;
begin
  select email into user_email from auth.users where id = auth.uid();
  if user_email is null then raise exception 'não autenticado'; end if;

  select * into inv from public.invites where token = p_token for update;
  if inv.id is null then raise exception 'convite inválido'; end if;
  if inv.accepted_at is not null then raise exception 'convite já utilizado'; end if;
  if inv.expires_at < now() then raise exception 'convite expirado'; end if;
  if lower(inv.email) <> lower(user_email) then raise exception 'convite emitido para outro e-mail'; end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (inv.workspace_id, auth.uid(), inv.role)
  on conflict (workspace_id, user_id) do nothing;
  update public.invites set accepted_at = now() where id = inv.id;
  return inv.workspace_id;
end $$;

revoke execute on function public.accept_invite(text) from anon;
revoke execute on function public.create_workspace(text, text) from anon;

-- RLS ---------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.invites enable row level security;
alter table public.audit_log enable row level security;

create policy profiles_self on public.profiles for all
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_colleagues on public.profiles for select using (
  exists (
    select 1 from public.workspace_members a
    join public.workspace_members b on a.workspace_id = b.workspace_id
    where a.user_id = auth.uid() and b.user_id = profiles.id
  )
);

create policy workspaces_select on public.workspaces for select using (public.is_member(id));
create policy workspaces_update on public.workspaces for update
  using (public.is_member(id, 'admin')) with check (public.is_member(id, 'admin'));
create policy workspaces_delete on public.workspaces for delete using (public.is_member(id, 'owner'));
-- insert apenas via create_workspace()

create policy members_select on public.workspace_members for select using (public.is_member(workspace_id));
create policy members_update on public.workspace_members for update
  using (public.is_member(workspace_id, 'admin') and role <> 'owner')
  with check (public.is_member(workspace_id, 'admin') and role <> 'owner');
create policy members_delete on public.workspace_members for delete
  using ((public.is_member(workspace_id, 'admin') and role <> 'owner') or user_id = auth.uid());
-- insert apenas via handle_new_user / create_workspace / accept_invite

create policy invites_select on public.invites for select using (public.is_member(workspace_id, 'admin'));
create policy invites_insert on public.invites for insert
  with check (public.is_member(workspace_id, 'admin') and created_by = auth.uid());
create policy invites_delete on public.invites for delete using (public.is_member(workspace_id, 'admin'));

create policy audit_select on public.audit_log for select using (public.is_member(workspace_id, 'admin'));


-- ===== 20261019000002_fase2_cadastros_lancamentos.sql =====
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


-- ===== 20261019000003_fase3_importacao.sql =====
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


-- ===== 20261019000004_fase4_faturas_parcelas.sql =====
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


-- ===== 20261019000005_fase5_recorrencias_baixas.sql =====
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


-- ===== 20261019000006_fase6_regras.sql =====
-- Fase 6: regras automáticas de categorização

create table public.categorization_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  priority int not null default 100 check (priority between 0 and 1000),
  operator text not null default 'contains' check (operator in ('contains', 'starts_with', 'equals', 'regex')),
  pattern text not null check (char_length(pattern) between 1 and 200),
  direction text not null default 'any' check (direction in ('any', 'in', 'out')),
  amount_min_cents bigint check (amount_min_cents is null or amount_min_cents >= 0),
  amount_max_cents bigint check (amount_max_cents is null or amount_max_cents >= 0),
  account_id uuid references public.accounts (id) on delete cascade,
  set_category_id uuid references public.categories (id) on delete set null,
  set_contact_id uuid references public.contacts (id) on delete set null,
  set_tag_ids uuid[] not null default '{}',
  active boolean not null default true,
  times_applied int not null default 0,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rule_has_effect check (set_category_id is not null or set_contact_id is not null or cardinality(set_tag_ids) > 0)
);
create index categorization_rules_ws_idx on public.categorization_rules (workspace_id, priority);
create trigger categorization_rules_touch before update on public.categorization_rules for each row execute function public.touch_updated_at();

alter table public.categorization_rules enable row level security;
create policy rules_select on public.categorization_rules for select using (public.is_member(workspace_id));
create policy rules_write on public.categorization_rules for all
  using (public.is_member(workspace_id, 'editor')) with check (public.is_member(workspace_id, 'editor'));

-- Índice para relatórios por competência e por caixa
create index if not exists tx_ws_competence_idx on public.transactions (workspace_id, competence_date) where deleted_at is null;
create index if not exists tx_ws_paid_idx on public.transactions (workspace_id, paid_date) where deleted_at is null;

notify pgrst, 'reload schema';


-- ===== 20261019000007_fase7_orcamento_lgpd.sql =====
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


-- ===== 20261019000008_correcoes_integridade.sql =====
-- Correções de integridade encontradas na varredura do banco

-- 1) Excluir workspace falhava: a auditoria tentava registrar linhas de um workspace já apagado
create or replace function public.audit_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  rec jsonb := to_jsonb(coalesce(new, old));
  ws uuid := (rec ->> 'workspace_id')::uuid;
begin
  -- Exclusão em cascata do workspace: não há mais onde registrar (e o log também é apagado)
  if ws is null or not exists (select 1 from public.workspaces where id = ws) then
    return coalesce(new, old);
  end if;
  insert into public.audit_log (workspace_id, table_name, record_id, action, actor_id, old_data, new_data)
  values (
    ws, tg_table_name, coalesce(rec ->> 'id', rec ->> 'user_id'), lower(tg_op), auth.uid(),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

-- 2) O proprietário conseguia sair e deixar o workspace sem dono
create or replace function public.protect_last_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and exists (select 1 from public.workspaces where id = old.workspace_id)
     and not exists (
       select 1 from public.workspace_members
       where workspace_id = old.workspace_id and role = 'owner' and user_id <> old.user_id
     ) then
    raise exception 'O workspace precisa de um proprietário. Exclua o workspace ou transfira a propriedade antes.';
  end if;
  return coalesce(new, old);
end $$;

create trigger members_protect_owner before update or delete on public.workspace_members
  for each row execute function public.protect_last_owner();

-- Limpa workspaces que ficaram sem nenhum membro (inacessíveis)
delete from public.workspaces w
where not exists (select 1 from public.workspace_members m where m.workspace_id = w.id);

-- 3) Excluir a transferência do pagamento deixava a fatura "paga"
create or replace function public.reopen_invoice_on_payment_removal()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  g uuid := coalesce(new.transfer_group_id, old.transfer_group_id);
begin
  if g is null then return coalesce(new, old); end if;
  if tg_op = 'DELETE' or (new.deleted_at is not null and old.deleted_at is null) or new.status = 'cancelled' then
    update public.invoices set paid_at = null, payment_transfer_group_id = null where payment_transfer_group_id = g;
  end if;
  return coalesce(new, old);
end $$;

create trigger tx_reopen_invoice after update or delete on public.transactions
  for each row when (old.type = 'transfer')
  execute function public.reopen_invoice_on_payment_removal();

-- Corrige os dados existentes: faturas "pagas" sem pagamento ativo
update public.invoices i set paid_at = null, payment_transfer_group_id = null
where i.paid_at is not null
  and not exists (
    select 1 from public.transactions t
    where t.transfer_group_id = i.payment_transfer_group_id and t.deleted_at is null and t.status <> 'cancelled'
  );

-- 4) A mesma fatura podia ser paga duas vezes
create or replace function public.pay_invoice(p_invoice_id uuid, p_from_account uuid, p_amount_cents bigint, p_date date)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  inv invoices;
  g uuid;
begin
  select * into inv from invoices where id = p_invoice_id for update;
  if inv.id is null then raise exception 'Fatura não encontrada.'; end if;
  if inv.paid_at is not null then raise exception 'Esta fatura já foi paga. Desfaça o pagamento antes de registrar outro.'; end if;
  if p_amount_cents <= 0 then raise exception 'Informe um valor maior que zero.'; end if;
  if exists (select 1 from accounts where id = p_from_account and type = 'credit_card') then
    raise exception 'Escolha uma conta bancária para pagar a fatura.';
  end if;
  g := public.create_transfer(inv.workspace_id, p_from_account, inv.account_id, p_amount_cents, p_date,
    'Pagamento fatura ' || to_char(inv.due_date, 'MM/YYYY'), true);
  update invoices set paid_at = p_date, payment_transfer_group_id = g where id = inv.id;
  return g;
end $$;

-- 5) Mudar o cartão ou a data da compra não trocava a fatura
create or replace function public.assign_invoice()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  is_card boolean;
  inv_due date;
begin
  if new.type = 'transfer' then
    new.invoice_id := null;
    return new;
  end if;
  select type = 'credit_card' into is_card from accounts where id = new.account_id;
  if not coalesce(is_card, false) then
    new.invoice_id := null;
    return new;
  end if;
  -- Em edição, recalcula só se a conta ou a data da compra mudaram (sem a fatura ter sido escolhida junto)
  if tg_op = 'UPDATE'
     and new.account_id is not distinct from old.account_id
     and new.competence_date is not distinct from old.competence_date
     and new.invoice_id is not distinct from old.invoice_id then
    return new;
  end if;
  if new.invoice_id is null or (tg_op = 'UPDATE' and new.invoice_id is not distinct from old.invoice_id) then
    new.invoice_id := public.invoice_for_purchase(new.account_id, new.competence_date);
  end if;
  if new.invoice_id is not null then
    select due_date into inv_due from invoices where id = new.invoice_id;
    new.due_date := inv_due;
  end if;
  return new;
end $$;

drop trigger if exists tx_assign_invoice on public.transactions;
create trigger tx_assign_invoice before insert or update of account_id, competence_date, invoice_id, type on public.transactions
  for each row execute function public.assign_invoice();

-- 6) Status da fatura com a data de São Paulo (não UTC)
create or replace view public.invoice_summaries with (security_invoker = true) as
select i.*,
  coalesce(-sum(t.direction * t.amount_cents) filter (where t.deleted_at is null and t.status <> 'cancelled'), 0) as total_cents,
  count(t.id) filter (where t.deleted_at is null and t.status <> 'cancelled') as items,
  case when i.paid_at is not null then 'paid'::invoice_status
       when (now() at time zone 'America/Sao_Paulo')::date >= i.closing_date then 'closed'::invoice_status
       else 'open'::invoice_status end as status
from public.invoices i
left join public.transactions t on t.invoice_id = i.id and t.type <> 'transfer'
group by i.id;

-- 7) Categoria de natureza errada (ex.: despesa numa receita) passa a ser recusada
create or replace function public.check_same_workspace()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  cat_kind text;
begin
  if new.account_id is not null and not exists (select 1 from accounts where id = new.account_id and workspace_id = new.workspace_id) then
    raise exception 'conta de outro workspace';
  end if;
  if new.category_id is not null then
    select kind::text into cat_kind from categories where id = new.category_id and workspace_id = new.workspace_id;
    if cat_kind is null then raise exception 'categoria de outro workspace'; end if;
    if new.type <> 'transfer' and cat_kind <> new.type::text then
      -- Não bloqueia a gravação: só descarta a categoria incompatível
      new.category_id := null;
    end if;
  end if;
  if new.contact_id is not null and not exists (select 1 from contacts where id = new.contact_id and workspace_id = new.workspace_id) then
    raise exception 'contato de outro workspace';
  end if;
  if new.cost_center_id is not null and not exists (select 1 from cost_centers where id = new.cost_center_id and workspace_id = new.workspace_id) then
    raise exception 'centro de custo de outro workspace';
  end if;
  return new;
end $$;

notify pgrst, 'reload schema';


-- ===== 20261020000009_metas_avisos.sql =====
-- Metas de economia e preferências de avisos por e-mail

create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  emoji text check (char_length(emoji) <= 8),
  target_cents bigint not null check (target_cents > 0),
  target_date date,
  archived boolean not null default false,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index savings_goals_ws_idx on public.savings_goals (workspace_id);
create trigger savings_goals_touch before update on public.savings_goals for each row execute function public.touch_updated_at();
alter table public.savings_goals enable row level security;
create policy savings_goals_select on public.savings_goals for select using (public.is_member(workspace_id));
create policy savings_goals_write on public.savings_goals for all
  using (public.is_member(workspace_id, 'editor')) with check (public.is_member(workspace_id, 'editor'));

-- Depósitos (positivos) e retiradas (negativos) na meta
create table public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  goal_id uuid not null references public.savings_goals (id) on delete cascade,
  amount_cents bigint not null check (amount_cents <> 0),
  date date not null default current_date,
  note text check (char_length(note) <= 200),
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index goal_contributions_goal_idx on public.goal_contributions (goal_id);
alter table public.goal_contributions enable row level security;
create policy goal_contributions_select on public.goal_contributions for select using (public.is_member(workspace_id));
create policy goal_contributions_write on public.goal_contributions for all
  using (public.is_member(workspace_id, 'editor')) with check (public.is_member(workspace_id, 'editor'));

-- A contribuição precisa ser do mesmo workspace da meta
create or replace function public.goal_contribution_same_ws()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if not exists (select 1 from public.savings_goals g where g.id = new.goal_id and g.workspace_id = new.workspace_id) then
    raise exception 'Meta de outro workspace';
  end if;
  return new;
end $$;
create trigger goal_contributions_ws before insert or update on public.goal_contributions
  for each row execute function public.goal_contribution_same_ws();

create or replace view public.goal_progress with (security_invoker = true) as
select g.id, g.workspace_id, g.name, g.emoji, g.target_cents, g.target_date, g.archived, g.created_at,
       coalesce(sum(c.amount_cents), 0)::bigint as saved_cents
from public.savings_goals g
left join public.goal_contributions c on c.goal_id = g.id
group by g.id;

-- Preferências de aviso: cada pessoa decide por si (vale para todos os seus workspaces)
create table public.notification_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  due_alerts boolean not null default true,
  days_before smallint not null default 1 check (days_before between 0 and 7),
  weekly_summary boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.notification_prefs enable row level security;
create policy notification_prefs_own on public.notification_prefs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Registro do que já foi enviado: o job pode rodar de novo sem repetir e-mails
create table public.notification_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('due', 'weekly')),
  ref_date date not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, kind, ref_date)
);
alter table public.notification_log enable row level security;
-- sem políticas: só o job (service role) lê e grava

-- Verificação em duas etapas: quem ativou precisa estar com a sessão aal2 para ver/alterar dados.
-- Vale no banco (RLS), não só na tela.
create or replace function public.is_member(ws uuid, min_role public.member_role default 'viewer')
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid()
      and public.role_rank(m.role) >= public.role_rank(min_role)
  )
  and (
    coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified')
  )
$$;


-- ===== 20261021000010_seguranca_funcoes.sql =====
-- Endurecimento: funções internas não podem ser chamadas pela API pública.
-- Achado na revisão de segurança: seed_default_categories (security definer) podia ser
-- chamada por qualquer pessoa, até sem login, inserindo categorias em qualquer workspace.

revoke execute on function public.seed_default_categories(uuid, text) from public, anon, authenticated;

-- Funções de gatilho: só o banco as dispara
revoke execute on function public.audit_trigger() from public, anon, authenticated;
revoke execute on function public.check_same_workspace() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.on_workspace_created() from public, anon, authenticated;
revoke execute on function public.protect_last_owner() from public, anon, authenticated;
revoke execute on function public.reopen_invoice_on_payment_removal() from public, anon, authenticated;

-- Quem não fez login não usa nenhuma das funções do app
revoke execute on function public.accept_invite(text) from public, anon;
revoke execute on function public.create_workspace(text, text) from public, anon;
revoke execute on function public.delete_workspace(uuid, text) from public, anon;

-- search_path fixo (evita sequestro de nomes por objetos em outros schemas)
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('role_rank', 'touch_updated_at', 'stamp_actor', 'day_in_month', 'invoice_dates_for_purchase', 'installment_base_description')
  loop
    execute format('alter function %s set search_path = public', f);
  end loop;
end $$;


-- ===== 20261021000011_limite_tentativas.sql =====
-- Limite de tentativas guardado no banco: vale para todos os servidores da Vercel ao mesmo tempo
-- (o limite em memória só valia por servidor).

create table public.rate_limit_hits (
  key text not null,
  at timestamptz not null default now()
);
create index rate_limit_hits_key_at_idx on public.rate_limit_hits (key, at desc);
alter table public.rate_limit_hits enable row level security;
-- sem políticas: só a função abaixo mexe na tabela

/**
 * Registra uma tentativa e diz se ainda está dentro do limite.
 * A chave sempre leva o usuário logado: ninguém consome o limite de outra pessoa.
 */
create or replace function public.check_rate_limit(p_action text, p_max int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  k text;
  n int;
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  if p_max < 1 or p_window_seconds < 1 or p_window_seconds > 86400 or char_length(p_action) > 60 then
    raise exception 'parâmetros inválidos';
  end if;
  k := auth.uid()::text || ':' || p_action;
  -- Serializa por chave para a contagem não furar com pedidos simultâneos
  perform pg_advisory_xact_lock(hashtext(k));
  delete from rate_limit_hits where key = k and at < now() - make_interval(secs => p_window_seconds);
  select count(*) into n from rate_limit_hits where key = k;
  if n >= p_max then return false; end if;
  insert into rate_limit_hits (key) values (k);
  return true;
end $$;

revoke execute on function public.check_rate_limit(text, int, int) from public, anon;
grant execute on function public.check_rate_limit(text, int, int) to authenticated;

-- Faxina: tentativas antigas (de quem não voltou) somem sozinhas uma vez por dia, junto do job
create or replace function public.purge_rate_limit_hits()
returns void language sql security definer set search_path = public as $$
  delete from rate_limit_hits where at < now() - interval '1 day';
$$;
revoke execute on function public.purge_rate_limit_hits() from public, anon, authenticated;


-- ===== 20261027000012_limite_parametros.sql =====
-- check_rate_limit: só aceita nomes de ação curtos e limites razoáveis,
-- para ninguém usar a função para encher a tabela chamando a API direto.
create or replace function public.check_rate_limit(p_action text, p_max int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  k text;
  n int;
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  if p_action !~ '^[a-z][a-z-]{0,29}$' or p_max not between 1 and 200 or p_window_seconds not between 1 and 86400 then
    raise exception 'parâmetros inválidos';
  end if;
  k := auth.uid()::text || ':' || p_action;
  perform pg_advisory_xact_lock(hashtext(k));
  delete from rate_limit_hits where key = k and at < now() - make_interval(secs => p_window_seconds);
  select count(*) into n from rate_limit_hits where key = k;
  if n >= p_max then return false; end if;
  insert into rate_limit_hits (key) values (k);
  return true;
end $$;
revoke execute on function public.check_rate_limit(text, int, int) from public, anon;
grant execute on function public.check_rate_limit(text, int, int) to authenticated;


-- ===== 20261028000013_lgpd.sql =====
-- LGPD e Marco Civil: registros de acesso (6 meses) e pedidos de titulares

-- Registros de acesso à aplicação (Marco Civil, art. 15): data/hora e IP de cada login.
-- Ninguém lê pela API; o titular recebe os seus na exportação de dados (feita no servidor).
create table public.access_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  ip inet,
  at timestamptz not null default now()
);
create index access_log_user_at_idx on public.access_log (user_id, at desc);
alter table public.access_log enable row level security;
create policy access_log_insert_own on public.access_log for insert to authenticated
  with check (user_id = auth.uid() and at > now() - interval '1 minute');
create policy access_log_select_own on public.access_log for select to authenticated
  using (user_id = auth.uid());

-- Pedidos de titulares de dados (formulário público da página "Seus direitos")
create table public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('acesso', 'correcao', 'eliminacao', 'portabilidade', 'compartilhamento', 'revogacao', 'oposicao', 'outro')),
  name text not null check (char_length(name) between 2 and 120),
  email text not null check (char_length(email) between 5 and 200 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  message text check (char_length(message) <= 2000),
  status text not null default 'novo' check (status in ('novo', 'em_andamento', 'concluido'))
);
alter table public.privacy_requests enable row level security;
-- Sem políticas: o pedido é gravado só pelo servidor (com limite de envios por IP);
-- o controlador lê e atende pelo painel do Supabase.

-- Faxina: registros de acesso com mais de 6 meses (chamada pelo job diário)
create or replace function public.purge_access_log()
returns void language sql security definer set search_path = public as $$
  delete from access_log where at < now() - interval '6 months';
$$;
revoke execute on function public.purge_access_log() from public, anon, authenticated;


-- ===== 20261028000014_exclusao_conta.sql =====
-- Exclusão de conta (LGPD, art. 18, VI): ao apagar um usuário, a autoria dos registros que
-- continuam em workspaces de outras pessoas fica anônima (null) em vez de impedir a exclusão.
do $$
declare r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tbl, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
      and c.connamespace = 'public'::regnamespace
      and c.confdeltype = 'a'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format('alter table %s add constraint %I foreign key (%I) references auth.users (id) on delete set null', r.tbl, r.conname, r.col);
  end loop;
end $$;
