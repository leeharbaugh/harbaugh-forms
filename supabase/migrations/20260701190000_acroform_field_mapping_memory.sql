-- Persistent memory for AcroForm PDF field name -> catalog field mappings.

create table if not exists public.acroform_field_mapping_memory (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),
  status varchar(20) not null default 'ACTIVE',
  pdf_field_name text not null,
  pdf_field_type text,
  normalized_pdf_field_name text,
  field_id uuid not null references public.fields (id) on delete restrict,
  form_code text,
  form_name text,
  confidence numeric,
  notes text,
  constraint acroform_field_mapping_memory_status_check
    check (status in ('ACTIVE', 'INACTIVE', 'DELETED'))
);

create index if not exists acroform_field_mapping_memory_status_idx
  on public.acroform_field_mapping_memory (status);

create index if not exists acroform_field_mapping_memory_pdf_field_name_idx
  on public.acroform_field_mapping_memory (lower(trim(pdf_field_name)))
  where status = 'ACTIVE';

create index if not exists acroform_field_mapping_memory_normalized_idx
  on public.acroform_field_mapping_memory (normalized_pdf_field_name)
  where status = 'ACTIVE';

create unique index if not exists acroform_field_mapping_memory_form_pdf_active_uidx
  on public.acroform_field_mapping_memory (
    coalesce(form_code, ''),
    lower(trim(pdf_field_name))
  )
  where status = 'ACTIVE';

create trigger acroform_field_mapping_memory_set_update_date
before update on public.acroform_field_mapping_memory
for each row execute function public.set_update_date();

alter table public.acroform_field_mapping_memory enable row level security;

create policy "acroform_field_mapping_memory_authenticated_all"
  on public.acroform_field_mapping_memory
  for all
  to authenticated
  using (true)
  with check (true);
