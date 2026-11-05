-- Planejamento: conta futura marcada para "reservar todo mês" até o vencimento.
alter table public.transactions add column if not exists plan_reserve boolean not null default false;
create index if not exists tx_plan_reserve_idx on public.transactions (workspace_id) where plan_reserve and deleted_at is null;
