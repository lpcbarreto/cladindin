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
