-- Extend packet_forms for collection vs added internal vs external uploads.
-- Makes form_id nullable for external-only documents.

-- ---------------------------------------------------------------------------
-- New columns
-- ---------------------------------------------------------------------------

alter table public.packet_forms
  alter column form_id drop not null;

alter table public.packet_forms
  add column if not exists collection_form_id bigint
    references public.collection_forms (id) on delete set null,
  add column if not exists origin varchar(30) not null default 'collection',
  add column if not exists document_type varchar(30) not null default 'PDF',
  add column if not exists sort_order integer not null default 0,
  add column if not exists is_required boolean not null default false,
  add column if not exists notes text,
  add column if not exists generated_pdf_url text;

alter table public.packet_forms
  drop constraint if exists packet_forms_origin_check;

alter table public.packet_forms
  add constraint packet_forms_origin_check
    check (
      origin in (
        'collection',
        'added_internal',
        'external_upload'
      )
    );

alter table public.packet_forms
  drop constraint if exists packet_forms_document_type_check;

alter table public.packet_forms
  add constraint packet_forms_document_type_check
    check (document_type in ('PDF', 'OTHER'));

alter table public.packet_forms
  drop constraint if exists packet_forms_sort_order_non_negative;

alter table public.packet_forms
  add constraint packet_forms_sort_order_non_negative
    check (sort_order >= 0);

-- External uploads have no reusable form template.
alter table public.packet_forms
  drop constraint if exists packet_forms_external_form_id_check;

alter table public.packet_forms
  add constraint packet_forms_external_form_id_check
    check (
      (origin = 'external_upload' and form_id is null)
      or (origin <> 'external_upload' and form_id is not null)
    );

create index if not exists packet_forms_sort_order_idx
  on public.packet_forms (packet_id, sort_order)
  where status = 'ACTIVE';

create index if not exists packet_forms_origin_idx
  on public.packet_forms (origin)
  where status = 'ACTIVE';

-- Prevent duplicate active internal forms in the same packet.
create unique index if not exists packet_forms_packet_form_internal_active_uidx
  on public.packet_forms (packet_id, form_id)
  where status = 'ACTIVE' and form_id is not null;

-- ---------------------------------------------------------------------------
-- Backfill existing rows
-- ---------------------------------------------------------------------------

update public.packet_forms pf
set origin = 'collection'
where pf.origin is null or pf.origin = 'collection';

with ordered as (
  select
    id,
    row_number() over (
      partition by packet_id
      order by id
    ) - 1 as rn
  from public.packet_forms
  where status = 'ACTIVE'
)
update public.packet_forms pf
set sort_order = ordered.rn * 10
from ordered
where pf.id = ordered.id
  and pf.sort_order = 0;
