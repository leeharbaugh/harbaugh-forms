-- Phase C: Storage RLS cutover for form-templates and generated-documents.
-- Replaces open authenticated bucket policies with path- and role-aware access.
-- Legacy objects remain for rollback but are not readable/writable by standard users.
-- service_role continues to bypass RLS (Supabase / table-owner default); no service_role policies required.

begin;

-- ---------------------------------------------------------------------------
-- Ensure buckets remain private
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'form-templates',
  'form-templates',
  false,
  52428800,
  array['application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'generated-documents',
  'generated-documents',
  false,
  52428800,
  array['application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Path helpers (public, SECURITY DEFINER, fixed search_path)
-- ---------------------------------------------------------------------------

create or replace function public.storage_is_global_form_path(name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select name is not null
     and name like 'global/forms/%';
$$;

create or replace function public.storage_is_own_user_path(name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and name is not null
     and name like ('users/' || auth.uid()::text || '/%');
$$;

create or replace function public.storage_is_legacy_form_path(name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Legacy: not global/forms/... and not users/.../forms/...
  select name is not null
     and name not like 'global/forms/%'
     and name not like 'users/%/forms/%';
$$;

create or replace function public.storage_is_legacy_packet_path(name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Legacy: not users/.../packets/...
  select name is not null
     and name not like 'users/%/packets/%';
$$;

revoke all on function public.storage_is_global_form_path(text) from public;
revoke all on function public.storage_is_own_user_path(text) from public;
revoke all on function public.storage_is_legacy_form_path(text) from public;
revoke all on function public.storage_is_legacy_packet_path(text) from public;

grant execute on function public.storage_is_global_form_path(text) to authenticated;
grant execute on function public.storage_is_own_user_path(text) to authenticated;
grant execute on function public.storage_is_legacy_form_path(text) to authenticated;
grant execute on function public.storage_is_legacy_packet_path(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Drop existing open authenticated Storage policies
-- ---------------------------------------------------------------------------

drop policy if exists "form_templates_storage_authenticated_select" on storage.objects;
drop policy if exists "form_templates_storage_authenticated_insert" on storage.objects;
drop policy if exists "form_templates_storage_authenticated_update" on storage.objects;
drop policy if exists "form_templates_storage_authenticated_delete" on storage.objects;

drop policy if exists "generated_documents_storage_authenticated_select" on storage.objects;
drop policy if exists "generated_documents_storage_authenticated_insert" on storage.objects;
drop policy if exists "generated_documents_storage_authenticated_update" on storage.objects;
drop policy if exists "generated_documents_storage_authenticated_delete" on storage.objects;

-- ---------------------------------------------------------------------------
-- form-templates policies
-- Standard users: SELECT global + own users/{uid}/...; write only users/{uid}/forms/...
-- No legacy access for standard users (admin via is_app_admin()).
-- ---------------------------------------------------------------------------

create policy "form_templates_storage_authenticated_select"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'form-templates'
    and (
      public.is_app_admin()
      or public.storage_is_global_form_path(name)
      or public.storage_is_own_user_path(name)
    )
  );

create policy "form_templates_storage_authenticated_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'form-templates'
    and (
      public.is_app_admin()
      or (
        auth.uid() is not null
        and name like ('users/' || auth.uid()::text || '/forms/%')
      )
    )
  );

create policy "form_templates_storage_authenticated_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'form-templates'
    and (
      public.is_app_admin()
      or (
        auth.uid() is not null
        and name like ('users/' || auth.uid()::text || '/forms/%')
      )
    )
  )
  with check (
    bucket_id = 'form-templates'
    and (
      public.is_app_admin()
      or (
        auth.uid() is not null
        and name like ('users/' || auth.uid()::text || '/forms/%')
      )
    )
  );

create policy "form_templates_storage_authenticated_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'form-templates'
    and (
      public.is_app_admin()
      or public.storage_is_own_user_path(name)
    )
  );

-- ---------------------------------------------------------------------------
-- generated-documents policies
-- Standard users: own users/{uid}/packets/... only. No legacy access.
-- ---------------------------------------------------------------------------

create policy "generated_documents_storage_authenticated_select"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'generated-documents'
    and (
      public.is_app_admin()
      or (
        auth.uid() is not null
        and name like ('users/' || auth.uid()::text || '/packets/%')
      )
    )
  );

create policy "generated_documents_storage_authenticated_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'generated-documents'
    and (
      public.is_app_admin()
      or (
        auth.uid() is not null
        and name like ('users/' || auth.uid()::text || '/packets/%')
      )
    )
  );

create policy "generated_documents_storage_authenticated_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'generated-documents'
    and (
      public.is_app_admin()
      or (
        auth.uid() is not null
        and name like ('users/' || auth.uid()::text || '/packets/%')
      )
    )
  )
  with check (
    bucket_id = 'generated-documents'
    and (
      public.is_app_admin()
      or (
        auth.uid() is not null
        and name like ('users/' || auth.uid()::text || '/packets/%')
      )
    )
  );

create policy "generated_documents_storage_authenticated_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'generated-documents'
    and (
      public.is_app_admin()
      or (
        auth.uid() is not null
        and name like ('users/' || auth.uid()::text || '/packets/%')
      )
    )
  );

commit;
