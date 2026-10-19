-- Prova de isolamento entre workspaces. Rode com `supabase test db` (pgTAP)
-- ou cole no SQL editor de um banco de DESENVOLVIMENTO: tudo roda em transação e é desfeito.
begin;
create extension if not exists pgtap;
select plan(12);

insert into auth.users (id, email, instance_id, aud, role)
values ('00000000-0000-0000-0000-00000000000a', 'ana@exemplo.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
       ('00000000-0000-0000-0000-00000000000b', 'bia@exemplo.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

set local role authenticated;

-- Ana cria um lançamento no workspace dela
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
select is((select count(*) from public.workspaces)::int, 1, 'Ana vê só o próprio workspace');
select is((select count(*) from public.workspace_members)::int, 1, 'Ana vê só a própria membership');
insert into public.transactions (workspace_id, account_id, type, direction, amount_cents, description, competence_date, due_date, status)
select a.workspace_id, a.id, 'expense', -1, 12345, 'segredo da Ana', current_date, current_date, 'planned'
from public.accounts a limit 1;
select is((select count(*) from public.transactions where description = 'segredo da Ana')::int, 1, 'Ana vê o próprio lançamento');
select set_config('teste.ws_ana', (select id::text from public.workspaces limit 1), true);

-- Bia não enxerga nem altera nada da Ana
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';
select is((select count(*) from public.workspaces)::int, 1, 'Bia vê só o próprio workspace');
select is(
  (select count(*) from public.workspace_members where user_id = '00000000-0000-0000-0000-00000000000a')::int,
  0, 'Bia não enxerga membros da Ana');
select is((select count(*) from public.transactions where description = 'segredo da Ana')::int, 0, 'Bia não vê lançamentos da Ana');
select is((select count(*) from public.accounts a join public.workspace_members m on m.workspace_id = a.workspace_id
           where m.user_id = '00000000-0000-0000-0000-00000000000a')::int, 0, 'Bia não vê contas da Ana');

select throws_ok(
  $$ insert into public.workspace_members (workspace_id, user_id, role)
     select id, '00000000-0000-0000-0000-00000000000b', 'owner' from public.workspaces limit 1 $$,
  null, 'insert direto em membros é bloqueado');

update public.transactions set amount_cents = 1 where description = 'segredo da Ana';
select throws_ok(
  $$ insert into public.transactions (workspace_id, account_id, type, direction, amount_cents, description, competence_date, due_date)
     values (current_setting('teste.ws_ana')::uuid, (select id from public.accounts limit 1), 'expense', -1, 1, 'invasão', current_date, current_date) $$,
  null, 'Bia não insere no workspace da Ana');

select is((select count(*) from public.recurrence_rules)::int, 0, 'regras de recorrência isoladas');
select is((select count(*) from public.budgets)::int, 0, 'orçamentos isolados');

-- De volta à Ana: o update da Bia não teve efeito
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
select is((select amount_cents from public.transactions where description = 'segredo da Ana'), 12345::bigint, 'update da Bia não afetou a Ana');

select * from finish();
rollback;
