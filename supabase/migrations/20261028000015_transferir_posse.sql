-- Transferir a propriedade do workspace para outro membro (o antigo dono vira administrador).
create or replace function public.transfer_ownership(p_workspace_id uuid, p_new_owner uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  if not public.is_member(p_workspace_id, 'owner') then raise exception 'Só o proprietário pode transferir o workspace.'; end if;
  if p_new_owner = auth.uid() then raise exception 'Escolha outro membro.'; end if;
  if not exists (select 1 from workspace_members where workspace_id = p_workspace_id and user_id = p_new_owner) then
    raise exception 'A pessoa precisa ser membro do workspace.';
  end if;
  update workspace_members set role = 'owner' where workspace_id = p_workspace_id and user_id = p_new_owner;
  update workspace_members set role = 'admin' where workspace_id = p_workspace_id and user_id = auth.uid();
end $$;
revoke execute on function public.transfer_ownership(uuid, uuid) from public, anon;
grant execute on function public.transfer_ownership(uuid, uuid) to authenticated;
