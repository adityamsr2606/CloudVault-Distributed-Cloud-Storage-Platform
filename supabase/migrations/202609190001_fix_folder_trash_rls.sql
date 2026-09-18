-- Folder trash/restore RPCs perform owner-scoped mutations and write audit events.
-- Keep activity_events append-only from the browser while allowing these vetted RPCs
-- to bypass table RLS after validating auth.uid() and owner_id themselves.

begin;

alter function public.trash_vault_folder(uuid) security definer;
alter function public.restore_vault_folder(uuid) security definer;

revoke all on function public.trash_vault_folder(uuid) from public;
revoke all on function public.restore_vault_folder(uuid) from public;

grant execute on function public.trash_vault_folder(uuid) to authenticated;
grant execute on function public.restore_vault_folder(uuid) to authenticated;

commit;
