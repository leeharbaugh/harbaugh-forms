-- F5: Make finalized packet documents and published template files immutable
-- for authenticated clients. Draft documents remain editable, and an owner may
-- deliberately reopen a FINAL packet form through the existing lifecycle path.

begin;

-- These SECURITY DEFINER helpers inspect the authoritative row while retaining
-- the account-state gate and the caller's packet/form authorization. The fixed
-- search_path prevents caller-controlled object resolution in Storage RLS.
create or replace function public.can_mutate_draft_packet_storage_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_application_access()
    and exists (
      select 1
      from public.packet_forms pf
      where pf.status = 'ACTIVE'
        and pf.document_state = 'DRAFT'
        and (
          pf.storage_path = p_name
          or (
            pf.storage_path is null
            and p_name like (
              'users/' || pf.owner_user_id::text || '/packets/' ||
              pf.packet_id::text || '/' || pf.id::text || '-%'
            )
          )
        )
        and (
          public.is_app_admin()
          or (pf.owner_user_id = auth.uid() and public.owns_packet(pf.packet_id))
        )
    );
$$;

create or replace function public.can_mutate_draft_form_template_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_application_access()
    and exists (
      select 1
      from public.forms f
      where f.source_storage_path = p_name
        and f.status = 'ACTIVE'
        and f.publication_state = 'DRAFT'
        and (
          public.is_app_admin()
          or (f.scope = 'PRIVATE' and f.owner_user_id = auth.uid())
        )
    );
$$;

revoke all on function public.can_mutate_draft_packet_storage_object(text) from public;
revoke all on function public.can_mutate_draft_form_template_object(text) from public;
grant execute on function public.can_mutate_draft_packet_storage_object(text) to authenticated;
grant execute on function public.can_mutate_draft_form_template_object(text) to authenticated;

-- Annotation mutations must follow the packet-form lifecycle, not merely the
-- client-side editor guard. This includes soft deletes, which use UPDATE.
drop policy if exists "packet_form_annotations_insert" on public.packet_form_annotations;
create policy "packet_form_annotations_insert"
  on public.packet_form_annotations
  for insert
  to authenticated
  with check (
    (public.owns_packet(packet_id) or public.is_app_admin())
    and exists (
      select 1
      from public.packet_forms pf
      where pf.id = packet_form_id
        and pf.packet_id = packet_form_annotations.packet_id
        and pf.status = 'ACTIVE'
        and pf.document_state = 'DRAFT'
    )
    and created_by_user_id = auth.uid()
  );

drop policy if exists "packet_form_annotations_update" on public.packet_form_annotations;
create policy "packet_form_annotations_update"
  on public.packet_form_annotations
  for update
  to authenticated
  using (
    (public.owns_packet(packet_id) or public.is_app_admin())
    and exists (
      select 1
      from public.packet_forms pf
      where pf.id = packet_form_id
        and pf.packet_id = packet_form_annotations.packet_id
        and pf.status = 'ACTIVE'
        and pf.document_state = 'DRAFT'
    )
  )
  with check (
    (public.owns_packet(packet_id) or public.is_app_admin())
    and exists (
      select 1
      from public.packet_forms pf
      where pf.id = packet_form_id
        and pf.packet_id = packet_form_annotations.packet_id
        and pf.status = 'ACTIVE'
        and pf.document_state = 'DRAFT'
    )
  );

-- A published source PDF cannot be replaced or removed, including by an app
-- admin using a browser session. Admin maintenance retains service-role access.
drop policy if exists "form_templates_storage_authenticated_update" on storage.objects;
create policy "form_templates_storage_authenticated_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'form-templates'
    and public.can_mutate_draft_form_template_object(name)
  )
  with check (
    bucket_id = 'form-templates'
    and public.can_mutate_draft_form_template_object(name)
  );

drop policy if exists "form_templates_storage_authenticated_delete" on storage.objects;
create policy "form_templates_storage_authenticated_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'form-templates'
    and public.can_mutate_draft_form_template_object(name)
  );

-- A generated PDF may be written only while its associated packet form is an
-- active draft. The null-path branch supports the insert-upload-finalize flow;
-- its path must contain the exact owner, packet, and packet-form IDs.
drop policy if exists "generated_documents_storage_authenticated_update" on storage.objects;
create policy "generated_documents_storage_authenticated_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'generated-documents'
    and public.can_mutate_draft_packet_storage_object(name)
  )
  with check (
    bucket_id = 'generated-documents'
    and public.can_mutate_draft_packet_storage_object(name)
  );

drop policy if exists "generated_documents_storage_authenticated_delete" on storage.objects;
create policy "generated_documents_storage_authenticated_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'generated-documents'
    and public.can_mutate_draft_packet_storage_object(name)
  );

-- Insert is also constrained so a finalized record cannot receive a new
-- object at its stored path after a deletion attempt or object migration.
drop policy if exists "generated_documents_storage_authenticated_insert" on storage.objects;
create policy "generated_documents_storage_authenticated_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'generated-documents'
    and public.can_mutate_draft_packet_storage_object(name)
  );

comment on function public.can_mutate_draft_packet_storage_object(text) is
  'Storage mutation authorization for active DRAFT packet forms only; FINAL and later documents are immutable to authenticated clients.';
comment on function public.can_mutate_draft_form_template_object(text) is
  'Storage mutation authorization for active DRAFT form templates only; PUBLISHED source PDFs are immutable to authenticated clients.';

commit;
