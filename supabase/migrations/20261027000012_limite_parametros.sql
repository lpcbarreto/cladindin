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
