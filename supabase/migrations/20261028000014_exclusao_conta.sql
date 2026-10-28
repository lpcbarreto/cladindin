-- Exclusão de conta (LGPD, art. 18, VI): ao apagar um usuário, a autoria dos registros que
-- continuam em workspaces de outras pessoas fica anônima (null) em vez de impedir a exclusão.
do $$
declare r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tbl, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
      and c.connamespace = 'public'::regnamespace
      and c.confdeltype = 'a'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format('alter table %s add constraint %I foreign key (%I) references auth.users (id) on delete set null', r.tbl, r.conname, r.col);
  end loop;
end $$;
