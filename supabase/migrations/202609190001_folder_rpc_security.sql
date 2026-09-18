-- Keep user-facing folder lifecycle RPCs inside the caller's RLS boundary.

drop policy if exists "activity_events_insert_own" on public.activity_events;
create policy "activity_events_insert_own"
on public.activity_events
for insert
to authenticated
with check ((select auth.uid()) = owner_id);

alter function public.trash_vault_folder(uuid) security invoker;
alter function public.restore_vault_folder(uuid) security invoker;

revoke all on function public.trash_vault_folder(uuid) from public, anon;
revoke all on function public.restore_vault_folder(uuid) from public, anon;

grant execute on function public.trash_vault_folder(uuid) to authenticated;
grant execute on function public.restore_vault_folder(uuid) to authenticated;
