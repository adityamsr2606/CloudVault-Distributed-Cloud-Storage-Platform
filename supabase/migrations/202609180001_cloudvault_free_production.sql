-- CloudVault free production profile: Supabase Postgres + Storage + pgvector.
-- All exposed tables use row-level security. No paid external AI API is required.

create extension if not exists vector with schema extensions;

create table if not exists public.vault_folders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references public.vault_folders(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vault_folders_owner_parent_idx
  on public.vault_folders(owner_id, parent_id, name);
create index if not exists vault_folders_parent_fk_idx
  on public.vault_folders(parent_id) where parent_id is not null;

create table if not exists public.vault_files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  folder_id uuid references public.vault_folders(id) on delete set null,
  name text not null,
  storage_path text not null unique,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null check (size_bytes >= 0),
  sha256 text,
  current_version integer not null default 1 check (current_version > 0),
  status text not null default 'uploaded'
    check (status in ('uploaded','indexing','ready','failed','deleted')),
  is_starred boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vault_files_owner_created_idx
  on public.vault_files(owner_id, created_at desc);
create index if not exists vault_files_owner_deleted_idx
  on public.vault_files(owner_id, deleted_at);
create index if not exists vault_files_folder_idx
  on public.vault_files(folder_id);
create index if not exists vault_files_folder_fk_idx
  on public.vault_files(folder_id) where folder_id is not null;

create table if not exists public.file_versions (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.vault_files(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  sha256 text,
  created_at timestamptz not null default now(),
  unique(file_id, version_number)
);

create index if not exists file_versions_file_version_idx
  on public.file_versions(file_id, version_number desc);
create index if not exists file_versions_owner_idx
  on public.file_versions(owner_id);

create table if not exists public.file_chunks (
  id bigint generated always as identity primary key,
  file_id uuid not null references public.vault_files(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  content text not null,
  embedding extensions.vector(384),
  embedding_model text not null default 'gte-small',
  created_at timestamptz not null default now(),
  unique(file_id, chunk_index)
);

create index if not exists file_chunks_file_idx
  on public.file_chunks(file_id, chunk_index);
create index if not exists file_chunks_owner_idx
  on public.file_chunks(owner_id);
create index if not exists file_chunks_embedding_hnsw_idx
  on public.file_chunks using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

create table if not exists public.share_links (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.vault_files(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  max_uses integer,
  use_count integer not null default 0 check (use_count >= 0),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists share_links_owner_created_idx
  on public.share_links(owner_id, created_at desc);
create index if not exists share_links_file_idx
  on public.share_links(file_id);
create index if not exists share_links_token_hash_idx
  on public.share_links(token_hash);

create table if not exists public.activity_events (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  file_id uuid references public.vault_files(id) on delete set null,
  event_type text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_events_owner_created_idx
  on public.activity_events(owner_id, created_at desc);
create index if not exists activity_events_file_idx
  on public.activity_events(file_id) where file_id is not null;

alter table public.vault_folders enable row level security;
alter table public.vault_files enable row level security;
alter table public.file_versions enable row level security;
alter table public.file_chunks enable row level security;
alter table public.share_links enable row level security;
alter table public.activity_events enable row level security;

drop policy if exists "vault_folders_select_own" on public.vault_folders;
create policy "vault_folders_select_own" on public.vault_folders
for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "vault_folders_insert_own" on public.vault_folders;
create policy "vault_folders_insert_own" on public.vault_folders
for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists "vault_folders_update_own" on public.vault_folders;
create policy "vault_folders_update_own" on public.vault_folders
for update to authenticated using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);
drop policy if exists "vault_folders_delete_own" on public.vault_folders;
create policy "vault_folders_delete_own" on public.vault_folders
for delete to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists "vault_files_select_own" on public.vault_files;
create policy "vault_files_select_own" on public.vault_files
for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "vault_files_insert_own" on public.vault_files;
create policy "vault_files_insert_own" on public.vault_files
for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists "vault_files_update_own" on public.vault_files;
create policy "vault_files_update_own" on public.vault_files
for update to authenticated using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);
drop policy if exists "vault_files_delete_own" on public.vault_files;
create policy "vault_files_delete_own" on public.vault_files
for delete to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists "file_versions_select_own" on public.file_versions;
create policy "file_versions_select_own" on public.file_versions
for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "file_versions_insert_own" on public.file_versions;
create policy "file_versions_insert_own" on public.file_versions
for insert to authenticated with check ((select auth.uid()) = owner_id);

drop policy if exists "file_chunks_select_own" on public.file_chunks;
create policy "file_chunks_select_own" on public.file_chunks
for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "file_chunks_insert_own" on public.file_chunks;
create policy "file_chunks_insert_own" on public.file_chunks
for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists "file_chunks_update_own" on public.file_chunks;
create policy "file_chunks_update_own" on public.file_chunks
for update to authenticated using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);
drop policy if exists "file_chunks_delete_own" on public.file_chunks;
create policy "file_chunks_delete_own" on public.file_chunks
for delete to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists "share_links_select_own" on public.share_links;
create policy "share_links_select_own" on public.share_links
for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "share_links_insert_own" on public.share_links;
create policy "share_links_insert_own" on public.share_links
for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists "share_links_update_own" on public.share_links;
create policy "share_links_update_own" on public.share_links
for update to authenticated using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);
drop policy if exists "share_links_delete_own" on public.share_links;
create policy "share_links_delete_own" on public.share_links
for delete to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists "activity_events_select_own" on public.activity_events;
create policy "activity_events_select_own" on public.activity_events
for select to authenticated using ((select auth.uid()) = owner_id);

insert into storage.buckets (id, name, public, file_size_limit)
values ('cloudvault-files', 'cloudvault-files', false, 52428800)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "cloudvault_storage_select_own" on storage.objects;
create policy "cloudvault_storage_select_own" on storage.objects
for select to authenticated
using (
  bucket_id = 'cloudvault-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "cloudvault_storage_insert_own" on storage.objects;
create policy "cloudvault_storage_insert_own" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'cloudvault-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "cloudvault_storage_update_own" on storage.objects;
create policy "cloudvault_storage_update_own" on storage.objects
for update to authenticated
using (
  bucket_id = 'cloudvault-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'cloudvault-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "cloudvault_storage_delete_own" on storage.objects;
create policy "cloudvault_storage_delete_own" on storage.objects
for delete to authenticated
using (
  bucket_id = 'cloudvault-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create or replace function public.match_vault_chunks(
  query_embedding extensions.vector(384),
  match_count integer default 20
)
returns table (
  file_id uuid,
  name text,
  content text,
  similarity double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.file_id,
    f.name,
    c.content,
    (1 - (c.embedding OPERATOR(extensions.<=>) query_embedding))::double precision
      as similarity
  from public.file_chunks c
  join public.vault_files f on f.id = c.file_id
  where c.owner_id = (select auth.uid())
    and f.owner_id = (select auth.uid())
    and f.deleted_at is null
    and c.embedding is not null
  order by c.embedding OPERATOR(extensions.<=>) query_embedding
  limit least(match_count, 50);
$$;

grant execute on function public.match_vault_chunks(extensions.vector, integer)
to authenticated;

create or replace function public.log_vault_file_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_name text;
begin
  if tg_op = 'INSERT' then
    event_name := 'file_uploaded';
  elsif new.deleted_at is not null and old.deleted_at is null then
    event_name := 'file_deleted';
  elsif new.deleted_at is null and old.deleted_at is not null then
    event_name := 'file_restored';
  elsif new.current_version > old.current_version then
    event_name := 'file_versioned';
  elsif new.is_starred is distinct from old.is_starred then
    event_name := case when new.is_starred then 'file_starred' else 'file_unstarred' end;
  else
    return new;
  end if;

  insert into public.activity_events(owner_id, file_id, event_type, detail)
  values (
    new.owner_id,
    new.id,
    event_name,
    jsonb_build_object('name', new.name, 'version', new.current_version)
  );

  return new;
end;
$$;

revoke all on function public.log_vault_file_activity() from public, anon, authenticated;
drop trigger if exists vault_file_activity_trigger on public.vault_files;
create trigger vault_file_activity_trigger
after insert or update on public.vault_files
for each row execute function public.log_vault_file_activity();


create or replace function public.consume_share_link(p_token_hash text)
returns table (
  file_id uuid,
  file_name text,
  storage_path text,
  mime_type text,
  size_bytes bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.share_links%rowtype;
  v_file public.vault_files%rowtype;
begin
  select *
  into v_link
  from public.share_links
  where token_hash = p_token_hash
  for update;

  if not found
     or v_link.revoked_at is not null
     or v_link.expires_at <= now()
     or (v_link.max_uses is not null and v_link.use_count >= v_link.max_uses)
  then
    return;
  end if;

  select *
  into v_file
  from public.vault_files
  where id = v_link.file_id
    and deleted_at is null;

  if not found then
    return;
  end if;

  update public.share_links
  set use_count = use_count + 1
  where id = v_link.id;

  return query
  select
    v_file.id,
    v_file.name,
    v_file.storage_path,
    v_file.mime_type,
    v_file.size_bytes;
end;
$$;

revoke all on function public.consume_share_link(text) from public, anon, authenticated;
grant execute on function public.consume_share_link(text) to service_role;


create or replace function public.related_vault_files(
  source_file_id uuid,
  match_count integer default 6
)
returns table (
  file_id uuid,
  name text,
  similarity double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  with source_chunks as (
    select c.embedding
    from public.file_chunks c
    where c.file_id = source_file_id
      and c.owner_id = (select auth.uid())
      and c.embedding is not null
  ),
  candidate_scores as (
    select
      c.file_id,
      f.name,
      max(
        1 - (c.embedding OPERATOR(extensions.<=>) s.embedding)
      )::double precision as similarity
    from public.file_chunks c
    join public.vault_files f on f.id = c.file_id
    cross join source_chunks s
    where c.owner_id = (select auth.uid())
      and f.owner_id = (select auth.uid())
      and f.deleted_at is null
      and c.file_id <> source_file_id
      and c.embedding is not null
    group by c.file_id, f.name
  )
  select file_id, name, similarity
  from candidate_scores
  order by similarity desc
  limit least(greatest(match_count, 1), 12);
$$;

grant execute on function public.related_vault_files(uuid, integer)
to authenticated;
