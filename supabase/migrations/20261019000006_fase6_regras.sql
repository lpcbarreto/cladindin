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
