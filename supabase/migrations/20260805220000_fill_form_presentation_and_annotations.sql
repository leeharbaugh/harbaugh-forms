-- Fill Form presentation: multiline wrapping flag, preprinted-line mask, and
-- packet-form typed signature annotations (not Authentisign / not field_instances).

-- 1) Template placement presentation options (admin-controlled; default off)
alter table public.form_field_mappings
  add column if not exists is_multiline boolean not null default false;

alter table public.form_field_mappings
  add column if not exists mask_background boolean not null default false;

comment on column public.form_field_mappings.is_multiline is
  'When true, Fill Form preview and generated PDF wrap text within the placement box.';

comment on column public.form_field_mappings.mask_background is
  'When true, draw an opaque white rectangle over the placement before text (covers preprinted writing lines).';

-- 2) Packet-form-specific annotations (typed signatures for Fill & Sign–style use)
create table if not exists public.packet_form_annotations (
  id uuid primary key default gen_random_uuid(),
  packet_id bigint not null references public.packets (id),
  packet_form_id bigint not null references public.packet_forms (id),
  page_number integer not null check (page_number >= 1),
  annotation_type text not null
    check (annotation_type in ('typed_signature')),
  text_value text not null,
  font_id text not null default 'caveat',
  x double precision not null,
  y double precision not null,
  width double precision not null check (width > 0),
  height double precision not null check (height > 0),
  rotation double precision not null default 0,
  created_by_user_id uuid references auth.users (id) on delete set null,
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'INACTIVE', 'DELETED'))
);

create index if not exists packet_form_annotations_packet_form_idx
  on public.packet_form_annotations (packet_form_id)
  where status = 'ACTIVE';

create index if not exists packet_form_annotations_packet_idx
  on public.packet_form_annotations (packet_id)
  where status = 'ACTIVE';

drop trigger if exists packet_form_annotations_set_update_date
  on public.packet_form_annotations;
create trigger packet_form_annotations_set_update_date
  before update on public.packet_form_annotations
  for each row
  execute function public.set_update_date();

alter table public.packet_form_annotations enable row level security;

drop policy if exists "packet_form_annotations_select" on public.packet_form_annotations;
drop policy if exists "packet_form_annotations_insert" on public.packet_form_annotations;
drop policy if exists "packet_form_annotations_update" on public.packet_form_annotations;

-- Same access model as field_instances: packet owner (or app admin) via owns_packet.
create policy "packet_form_annotations_select"
  on public.packet_form_annotations
  for select
  to authenticated
  using (
    public.owns_packet(packet_id)
    or public.is_app_admin()
  );

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
    )
    and (
      created_by_user_id is null
      or created_by_user_id = auth.uid()
      or public.is_app_admin()
    )
  );

create policy "packet_form_annotations_update"
  on public.packet_form_annotations
  for update
  to authenticated
  using (public.owns_packet(packet_id) or public.is_app_admin())
  with check (
    (public.owns_packet(packet_id) or public.is_app_admin())
    and exists (
      select 1
      from public.packet_forms pf
      where pf.id = packet_form_id
        and pf.packet_id = packet_form_annotations.packet_id
    )
  );

grant select, insert, update on public.packet_form_annotations to authenticated;
