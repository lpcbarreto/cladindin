-- Correções de integridade encontradas na varredura do banco

-- 1) Excluir workspace falhava: a auditoria tentava registrar linhas de um workspace já apagado
create or replace function public.audit_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  rec jsonb := to_jsonb(coalesce(new, old));
  ws uuid := (rec ->> 'workspace_id')::uuid;
begin
  -- Exclusão em cascata do workspace: não há mais onde registrar (e o log também é apagado)
  if ws is null or not exists (select 1 from public.workspaces where id = ws) then
    return coalesce(new, old);
  end if;
  insert into public.audit_log (workspace_id, table_name, record_id, action, actor_id, old_data, new_data)
  values (
    ws, tg_table_name, coalesce(rec ->> 'id', rec ->> 'user_id'), lower(tg_op), auth.uid(),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

-- 2) O proprietário conseguia sair e deixar o workspace sem dono
create or replace function public.protect_last_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and exists (select 1 from public.workspaces where id = old.workspace_id)
     and not exists (
       select 1 from public.workspace_members
       where workspace_id = old.workspace_id and role = 'owner' and user_id <> old.user_id
     ) then
    raise exception 'O workspace precisa de um proprietário. Exclua o workspace ou transfira a propriedade antes.';
  end if;
  return coalesce(new, old);
end $$;

create trigger members_protect_owner before update or delete on public.workspace_members
  for each row execute function public.protect_last_owner();

-- Limpa workspaces que ficaram sem nenhum membro (inacessíveis)
delete from public.workspaces w
where not exists (select 1 from public.workspace_members m where m.workspace_id = w.id);

-- 3) Excluir a transferência do pagamento deixava a fatura "paga"
create or replace function public.reopen_invoice_on_payment_removal()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  g uuid := coalesce(new.transfer_group_id, old.transfer_group_id);
begin
  if g is null then return coalesce(new, old); end if;
  if tg_op = 'DELETE' or (new.deleted_at is not null and old.deleted_at is null) or new.status = 'cancelled' then
    update public.invoices set paid_at = null, payment_transfer_group_id = null where payment_transfer_group_id = g;
  end if;
  return coalesce(new, old);
end $$;

create trigger tx_reopen_invoice after update or delete on public.transactions
  for each row when (old.type = 'transfer')
  execute function public.reopen_invoice_on_payment_removal();

-- Corrige os dados existentes: faturas "pagas" sem pagamento ativo
update public.invoices i set paid_at = null, payment_transfer_group_id = null
where i.paid_at is not null
  and not exists (
    select 1 from public.transactions t
    where t.transfer_group_id = i.payment_transfer_group_id and t.deleted_at is null and t.status <> 'cancelled'
  );

-- 4) A mesma fatura podia ser paga duas vezes
create or replace function public.pay_invoice(p_invoice_id uuid, p_from_account uuid, p_amount_cents bigint, p_date date)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  inv invoices;
  g uuid;
begin
  select * into inv from invoices where id = p_invoice_id for update;
  if inv.id is null then raise exception 'Fatura não encontrada.'; end if;
  if inv.paid_at is not null then raise exception 'Esta fatura já foi paga. Desfaça o pagamento antes de registrar outro.'; end if;
  if p_amount_cents <= 0 then raise exception 'Informe um valor maior que zero.'; end if;
  if exists (select 1 from accounts where id = p_from_account and type = 'credit_card') then
    raise exception 'Escolha uma conta bancária para pagar a fatura.';
  end if;
  g := public.create_transfer(inv.workspace_id, p_from_account, inv.account_id, p_amount_cents, p_date,
    'Pagamento fatura ' || to_char(inv.due_date, 'MM/YYYY'), true);
  update invoices set paid_at = p_date, payment_transfer_group_id = g where id = inv.id;
  return g;
end $$;

-- 5) Mudar o cartão ou a data da compra não trocava a fatura
create or replace function public.assign_invoice()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  is_card boolean;
  inv_due date;
begin
  if new.type = 'transfer' then
    new.invoice_id := null;
    return new;
  end if;
  select type = 'credit_card' into is_card from accounts where id = new.account_id;
  if not coalesce(is_card, false) then
    new.invoice_id := null;
    return new;
  end if;
  -- Em edição, recalcula só se a conta ou a data da compra mudaram (sem a fatura ter sido escolhida junto)
  if tg_op = 'UPDATE'
     and new.account_id is not distinct from old.account_id
     and new.competence_date is not distinct from old.competence_date
     and new.invoice_id is not distinct from old.invoice_id then
    return new;
  end if;
  if new.invoice_id is null or (tg_op = 'UPDATE' and new.invoice_id is not distinct from old.invoice_id) then
    new.invoice_id := public.invoice_for_purchase(new.account_id, new.competence_date);
  end if;
  if new.invoice_id is not null then
    select due_date into inv_due from invoices where id = new.invoice_id;
    new.due_date := inv_due;
  end if;
  return new;
end $$;

drop trigger if exists tx_assign_invoice on public.transactions;
create trigger tx_assign_invoice before insert or update of account_id, competence_date, invoice_id, type on public.transactions
  for each row execute function public.assign_invoice();

-- 6) Status da fatura com a data de São Paulo (não UTC)
create or replace view public.invoice_summaries with (security_invoker = true) as
select i.*,
  coalesce(-sum(t.direction * t.amount_cents) filter (where t.deleted_at is null and t.status <> 'cancelled'), 0) as total_cents,
  count(t.id) filter (where t.deleted_at is null and t.status <> 'cancelled') as items,
  case when i.paid_at is not null then 'paid'::invoice_status
       when (now() at time zone 'America/Sao_Paulo')::date >= i.closing_date then 'closed'::invoice_status
       else 'open'::invoice_status end as status
from public.invoices i
left join public.transactions t on t.invoice_id = i.id and t.type <> 'transfer'
group by i.id;

-- 7) Categoria de natureza errada (ex.: despesa numa receita) passa a ser recusada
create or replace function public.check_same_workspace()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  cat_kind text;
begin
  if new.account_id is not null and not exists (select 1 from accounts where id = new.account_id and workspace_id = new.workspace_id) then
    raise exception 'conta de outro workspace';
  end if;
  if new.category_id is not null then
    select kind::text into cat_kind from categories where id = new.category_id and workspace_id = new.workspace_id;
    if cat_kind is null then raise exception 'categoria de outro workspace'; end if;
    if new.type <> 'transfer' and cat_kind <> new.type::text then
      -- Não bloqueia a gravação: só descarta a categoria incompatível
      new.category_id := null;
    end if;
  end if;
  if new.contact_id is not null and not exists (select 1 from contacts where id = new.contact_id and workspace_id = new.workspace_id) then
    raise exception 'contato de outro workspace';
  end if;
  if new.cost_center_id is not null and not exists (select 1 from cost_centers where id = new.cost_center_id and workspace_id = new.workspace_id) then
    raise exception 'centro de custo de outro workspace';
  end if;
  return new;
end $$;

notify pgrst, 'reload schema';
