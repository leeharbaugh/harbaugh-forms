-- Admin Copy to Global Library: lightweight form copy traceability.
-- Additive. Does not weaken RLS. Does not hard-delete records.

begin;

alter table public.forms
  add column if not exists copied_from_form_id bigint
    references public.forms (id)
    on delete set null;

alter table public.forms
  add column if not exists copied_from_owner_user_id uuid;

alter table public.forms
  add column if not exists copied_by_user_id uuid;

alter table public.forms
  add column if not exists copied_to_global_at timestamptz;

comment on column public.forms.copied_from_form_id is
  'Private (or prior) form this Global row was copied from, if any.';
comment on column public.forms.copied_from_owner_user_id is
  'Owner of the source private form at copy time.';
comment on column public.forms.copied_by_user_id is
  'Application admin who copied the form into the Global library.';
comment on column public.forms.copied_to_global_at is
  'When this Global form was created via Copy to Global Library.';

create index if not exists forms_copied_from_form_id_idx
  on public.forms (copied_from_form_id)
  where copied_from_form_id is not null;

commit;
