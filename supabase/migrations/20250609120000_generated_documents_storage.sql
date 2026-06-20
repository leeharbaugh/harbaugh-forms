-- Supabase Storage bucket for generated document PDF copies.

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

drop policy if exists "generated_documents_storage_authenticated_select" on storage.objects;
drop policy if exists "generated_documents_storage_authenticated_insert" on storage.objects;
drop policy if exists "generated_documents_storage_authenticated_update" on storage.objects;
drop policy if exists "generated_documents_storage_authenticated_delete" on storage.objects;

create policy "generated_documents_storage_authenticated_select"
  on storage.objects for select to authenticated
  using (bucket_id = 'generated-documents');

create policy "generated_documents_storage_authenticated_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'generated-documents');

create policy "generated_documents_storage_authenticated_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'generated-documents')
  with check (bucket_id = 'generated-documents');

create policy "generated_documents_storage_authenticated_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'generated-documents');
