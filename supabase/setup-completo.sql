-- Cladindin: instalação completa (Fase 1 + Fase 2).
-- Cole TUDO no SQL Editor do Supabase e clique em Run.
-- O bloco abaixo apaga restos de tentativas anteriores (não toca nos usuários).

drop trigger if exists on_auth_user_created on auth.users;
drop view if exists public.account_balances;
drop table if exists public.transaction_tags, public.transactions, public.contacts, public.tags,
  public.cost_centers, public.categories, public.credit_cards, public.accounts, public.audit_log,
  public.invites, public.workspace_members, public.workspaces, public.profiles cascade;
drop function if exists public.handle_new_user, public.create_workspace, public.accept_invite,
  public.is_member, public.role_rank, public.touch_updated_at, public.audit_trigger,
  public.check_same_workspace, public.stamp_actor, public.create_transfer,
  public.seed_default_categories, public.on_workspace_created cascade;
drop type if exists public.member_role, public.account_type, public.category_kind,
  public.tx_type, public.tx_status, public.tx_origin cascade;

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

-- Usuários que já existiam antes da instalação ganham perfil e workspace "Pessoal"
do $$
declare u record; ws uuid;
begin
  for u in select id, raw_user_meta_data from auth.users where id not in (select id from public.profiles) loop
    insert into public.profiles (id, full_name) values (u.id, u.raw_user_meta_data ->> 'full_name');
    insert into public.workspaces (name, kind, created_by) values ('Pessoal', 'pf', u.id) returning id into ws;
    insert into public.workspace_members (workspace_id, user_id, role) values (ws, u.id, 'owner');
  end loop;
end $$;

notify pgrst, 'reload schema';
