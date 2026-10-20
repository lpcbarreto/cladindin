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
