-- LGPD e Marco Civil: registros de acesso (6 meses) e pedidos de titulares

-- Registros de acesso à aplicação (Marco Civil, art. 15): data/hora e IP de cada login.
-- Ninguém lê pela API; o titular recebe os seus na exportação de dados (feita no servidor).
create table public.access_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  ip inet,
  at timestamptz not null default now()
);
create index access_log_user_at_idx on public.access_log (user_id, at desc);
alter table public.access_log enable row level security;
create policy access_log_insert_own on public.access_log for insert to authenticated
  with check (user_id = auth.uid() and at > now() - interval '1 minute');
create policy access_log_select_own on public.access_log for select to authenticated
  using (user_id = auth.uid());

-- Pedidos de titulares de dados (formulário público da página "Seus direitos")
create table public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('acesso', 'correcao', 'eliminacao', 'portabilidade', 'compartilhamento', 'revogacao', 'oposicao', 'outro')),
  name text not null check (char_length(name) between 2 and 120),
  email text not null check (char_length(email) between 5 and 200 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  message text check (char_length(message) <= 2000),
  status text not null default 'novo' check (status in ('novo', 'em_andamento', 'concluido'))
);
alter table public.privacy_requests enable row level security;
-- Sem políticas: o pedido é gravado só pelo servidor (com limite de envios por IP);
-- o controlador lê e atende pelo painel do Supabase.

-- Faxina: registros de acesso com mais de 6 meses (chamada pelo job diário)
create or replace function public.purge_access_log()
returns void language sql security definer set search_path = public as $$
  delete from access_log where at < now() - interval '6 months';
$$;
revoke execute on function public.purge_access_log() from public, anon, authenticated;
