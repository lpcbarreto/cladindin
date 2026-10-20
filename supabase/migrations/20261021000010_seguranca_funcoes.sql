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
