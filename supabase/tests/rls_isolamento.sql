-- Prova de isolamento entre workspaces. Rode com `supabase test db` (pgTAP)
-- ou cole no SQL editor de um banco de desenvolvimento: tudo roda em transação e é desfeito.
begin;
create extension if not exists pgtap;
select plan(6);

insert into auth.users (id, email, instance_id, aud, role)
values ('00000000-0000-0000-0000-00000000000a', 'ana@exemplo.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
       ('00000000-0000-0000-0000-00000000000b', 'bia@exemplo.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

set local role authenticated;

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
select is((select count(*) from public.workspaces)::int, 1, 'Ana vê só o próprio workspace');
select is((select count(*) from public.workspace_members)::int, 1, 'Ana vê só a própria membership');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';
select is((select count(*) from public.workspaces)::int, 1, 'Bia vê só o próprio workspace');
select is(
  (select count(*) from public.workspaces w join public.workspace_members m on m.workspace_id = w.id
   where m.user_id = '00000000-0000-0000-0000-00000000000a')::int,
  0, 'Bia não enxerga dados da Ana');

select throws_ok(
  $$ insert into public.workspace_members (workspace_id, user_id, role)
     select id, '00000000-0000-0000-0000-00000000000b', 'owner' from public.workspaces limit 1 $$,
  null, 'insert direto em membros é bloqueado');

select lives_ok(
  $$ update public.workspaces set name = 'Hack' where created_by = '00000000-0000-0000-0000-00000000000a' $$,
  'update em workspace alheio não falha mas não afeta linhas');

select * from finish();
rollback;
