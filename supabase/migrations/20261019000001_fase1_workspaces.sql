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
