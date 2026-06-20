-- Field/mapping schema refactor: reusable fields catalog + template placements +
-- packet-level instances. Legacy tables are renamed (not dropped) for backup.
--
-- Note: forms, packets, and packet_forms use bigint identity PKs in this project,
-- so FK columns on the new tables reference those bigint ids (not uuid).

-- ---------------------------------------------------------------------------
-- Backup legacy tables
-- ---------------------------------------------------------------------------

alter table public.form_field_mappings rename to legacy_form_field_mappings;
alter table public.template_pdf_fields rename to legacy_template_pdf_fields;

alter index if exists public.form_field_mappings_status_idx
  rename to legacy_form_field_mappings_status_idx;
alter index if exists public.form_field_mappings_form_id_idx
  rename to legacy_form_field_mappings_form_id_idx;
alter index if exists public.form_field_mappings_field_key_idx
  rename to legacy_form_field_mappings_field_key_idx;
alter index if exists public.form_field_mappings_form_field_active_uidx
  rename to legacy_form_field_mappings_form_field_active_uidx;

alter index if exists public.template_pdf_fields_status_idx
  rename to legacy_template_pdf_fields_status_idx;
alter index if exists public.template_pdf_fields_form_id_idx
  rename to legacy_template_pdf_fields_form_id_idx;
alter index if exists public.template_pdf_fields_field_key_idx
  rename to legacy_template_pdf_fields_field_key_idx;
alter index if exists public.template_pdf_fields_form_field_active_uidx
  rename to legacy_template_pdf_fields_form_field_active_uidx;

alter trigger form_field_mappings_set_update_date on public.legacy_form_field_mappings
  rename to legacy_form_field_mappings_set_update_date;
alter trigger template_pdf_fields_set_update_date on public.legacy_template_pdf_fields
  rename to legacy_template_pdf_fields_set_update_date;

alter policy "form_field_mappings_authenticated_all" on public.legacy_form_field_mappings
  rename to "legacy_form_field_mappings_authenticated_all";
alter policy "template_pdf_fields_authenticated_all" on public.legacy_template_pdf_fields
  rename to "legacy_template_pdf_fields_authenticated_all";

-- Optional columns from later migrations may be missing on older databases.
alter table public.legacy_form_field_mappings
  add column if not exists mapping_origin varchar(20) not null default 'MANUAL';

alter table public.legacy_template_pdf_fields
  add column if not exists page_width numeric,
  add column if not exists page_height numeric;

-- ---------------------------------------------------------------------------
-- fields — reusable business field catalog
-- ---------------------------------------------------------------------------

create table public.fields (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),
  status varchar(20) not null default 'ACTIVE',

  field_key text not null,
  field_name text,
  field_label text,
  field_data_type text not null,
  field_widget_type text not null,
  default_value text,
  default_checked boolean,
  required boolean not null default false,
  notes text,

  constraint fields_status_check
    check (status in ('ACTIVE', 'INACTIVE', 'DELETED')),
  constraint fields_field_key_not_blank
    check (length(trim(field_key)) > 0),
  constraint fields_data_type_not_blank
    check (length(trim(field_data_type)) > 0),
  constraint fields_widget_type_not_blank
    check (length(trim(field_widget_type)) > 0)
);

create index fields_status_idx on public.fields (status);

create unique index fields_field_key_active_uidx
  on public.fields (lower(field_key))
  where status = 'ACTIVE';

create trigger fields_set_update_date
before update on public.fields
for each row execute function public.set_update_date();

-- ---------------------------------------------------------------------------
-- form_field_mappings — template-level default placement
-- ---------------------------------------------------------------------------

create table public.form_field_mappings (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),
  status varchar(20) not null default 'ACTIVE',

  form_id bigint not null
    references public.forms (id) on delete restrict,
  field_id uuid not null
    references public.fields (id) on delete restrict,
  mapping_name text,
  occurrence_index integer,
  page_number integer not null,
  x numeric not null,
  y numeric not null,
  width numeric,
  height numeric,
  page_width numeric,
  page_height numeric,
  font_size numeric,
  alignment text,
  field_widget_type text,
  default_value_override text,
  required boolean not null default false,
  notes text,

  constraint form_field_mappings_status_check
    check (status in ('ACTIVE', 'INACTIVE', 'DELETED')),
  constraint form_field_mappings_page_number_positive
    check (page_number >= 1),
  constraint form_field_mappings_occurrence_index_non_negative
    check (occurrence_index is null or occurrence_index >= 0)
);

create index form_field_mappings_status_idx
  on public.form_field_mappings (status);

create index form_field_mappings_form_id_idx
  on public.form_field_mappings (form_id)
  where status = 'ACTIVE';

create index form_field_mappings_field_id_idx
  on public.form_field_mappings (field_id)
  where status = 'ACTIVE';

create index form_field_mappings_form_field_idx
  on public.form_field_mappings (form_id, field_id)
  where status = 'ACTIVE';

create trigger form_field_mappings_set_update_date
before update on public.form_field_mappings
for each row execute function public.set_update_date();

-- ---------------------------------------------------------------------------
-- field_instances — packet/form-instance values
-- ---------------------------------------------------------------------------

create table public.field_instances (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),
  status varchar(20) not null default 'ACTIVE',

  packet_id bigint not null
    references public.packets (id) on delete restrict,
  packet_form_id bigint not null
    references public.packet_forms (id) on delete restrict,
  field_id uuid not null
    references public.fields (id) on delete restrict,
  value text,
  value_json jsonb,
  source text,
  is_override boolean not null default false,
  notes text,

  constraint field_instances_status_check
    check (status in ('ACTIVE', 'INACTIVE', 'DELETED'))
);

create index field_instances_status_idx
  on public.field_instances (status);

create index field_instances_packet_id_idx
  on public.field_instances (packet_id)
  where status = 'ACTIVE';

create index field_instances_packet_form_id_idx
  on public.field_instances (packet_form_id)
  where status = 'ACTIVE';

create index field_instances_field_id_idx
  on public.field_instances (field_id)
  where status = 'ACTIVE';

create index field_instances_packet_form_field_idx
  on public.field_instances (packet_form_id, field_id)
  where status = 'ACTIVE';

create trigger field_instances_set_update_date
before update on public.field_instances
for each row execute function public.set_update_date();

-- ---------------------------------------------------------------------------
-- field_instance_mappings — optional packet-form placement overrides
-- ---------------------------------------------------------------------------

create table public.field_instance_mappings (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),
  status varchar(20) not null default 'ACTIVE',

  field_instance_id uuid
    references public.field_instances (id) on delete set null,
  packet_id bigint not null
    references public.packets (id) on delete restrict,
  packet_form_id bigint not null
    references public.packet_forms (id) on delete restrict,
  field_id uuid not null
    references public.fields (id) on delete restrict,
  form_field_mapping_id uuid
    references public.form_field_mappings (id) on delete set null,
  page_number integer not null,
  x numeric not null,
  y numeric not null,
  width numeric,
  height numeric,
  page_width numeric,
  page_height numeric,
  font_size numeric,
  alignment text,
  notes text,

  constraint field_instance_mappings_status_check
    check (status in ('ACTIVE', 'INACTIVE', 'DELETED')),
  constraint field_instance_mappings_page_number_positive
    check (page_number >= 1)
);

create index field_instance_mappings_status_idx
  on public.field_instance_mappings (status);

create index field_instance_mappings_packet_form_id_idx
  on public.field_instance_mappings (packet_form_id)
  where status = 'ACTIVE';

create index field_instance_mappings_field_instance_id_idx
  on public.field_instance_mappings (field_instance_id)
  where status = 'ACTIVE';

create index field_instance_mappings_form_field_mapping_id_idx
  on public.field_instance_mappings (form_field_mapping_id)
  where status = 'ACTIVE';

create trigger field_instance_mappings_set_update_date
before update on public.field_instance_mappings
for each row execute function public.set_update_date();

-- ---------------------------------------------------------------------------
-- Migrate catalog rows from legacy field/mapping tables
-- ---------------------------------------------------------------------------

with field_keys as (
  select distinct upper(trim(field_key)) as field_key
  from legacy_template_pdf_fields
  where status = 'ACTIVE'
  union
  select distinct upper(trim(field_key)) as field_key
  from legacy_form_field_mappings
  where status = 'ACTIVE'
),
catalog_source as (
  select
    fk.field_key,
    coalesce(tpf.field_label, ffm.field_label) as field_label,
    coalesce(tpf.field_type, ffm.field_type) as legacy_field_type,
    ffm.static_value,
    coalesce(tpf.is_required, ffm.is_required, false) as required,
    ffm.source_type,
    ffm.source_field,
    ffm.mapping_origin
  from field_keys fk
  left join lateral (
    select *
    from legacy_template_pdf_fields t
    where upper(trim(t.field_key)) = fk.field_key
      and t.status = 'ACTIVE'
    order by t.update_date desc
    limit 1
  ) tpf on true
  left join lateral (
    select *
    from legacy_form_field_mappings m
    where upper(trim(m.field_key)) = fk.field_key
      and m.status = 'ACTIVE'
    order by m.update_date desc
    limit 1
  ) ffm on true
)
insert into public.fields (
  field_key,
  field_name,
  field_label,
  field_data_type,
  field_widget_type,
  default_value,
  default_checked,
  required,
  notes
)
select
  cs.field_key,
  cs.field_key,
  cs.field_label,
  case cs.legacy_field_type
    when 'CHECKBOX' then 'boolean'
    when 'DATE' then 'date'
    when 'SIGNATURE_PLACEHOLDER' then 'signature'
    when 'INITIAL_PLACEHOLDER' then 'initial'
    else 'text'
  end,
  case cs.legacy_field_type
    when 'CHECKBOX' then 'checkbox'
    when 'DATE' then 'date'
    when 'SIGNATURE_PLACEHOLDER' then 'signature'
    when 'INITIAL_PLACEHOLDER' then 'initial'
    else 'text'
  end,
  cs.static_value,
  case
    when cs.legacy_field_type = 'CHECKBOX'
      then coalesce(lower(trim(cs.static_value)) in ('true', '1', 'yes'), false)
    else null
  end,
  cs.required,
  case
    when cs.source_type is not null
      or cs.mapping_origin is not null
      then jsonb_build_object(
        'legacy_source_type', cs.source_type,
        'legacy_source_field', cs.source_field,
        'mapping_origin', cs.mapping_origin
      )::text
    else null
  end
from catalog_source cs;

-- ---------------------------------------------------------------------------
-- Migrate template placements into form_field_mappings
-- ---------------------------------------------------------------------------

with form_field_pairs as (
  select form_id, upper(trim(field_key)) as field_key
  from legacy_template_pdf_fields
  where status = 'ACTIVE'
  union
  select form_id, upper(trim(field_key)) as field_key
  from legacy_form_field_mappings
  where status = 'ACTIVE'
),
merged_placements as (
  select
    p.form_id,
    p.field_key,
    coalesce(t.page_number, m.page_number, 1) as page_number,
    coalesce(t.x_position, m.x_position, 0) as x,
    coalesce(t.y_position, m.y_position, 0) as y,
    coalesce(t.width, m.width) as width,
    coalesce(t.height, m.height) as height,
    t.page_width,
    t.page_height,
    coalesce(t.font_size, m.font_size, 10) as font_size,
    coalesce(t.is_required, m.is_required, false) as required,
    coalesce(t.field_type, m.field_type) as legacy_field_type,
    m.static_value as default_value_override,
    coalesce(m.notes, t.notes) as notes,
    m.mapping_origin
  from form_field_pairs p
  left join legacy_template_pdf_fields t
    on t.form_id = p.form_id
   and upper(trim(t.field_key)) = p.field_key
   and t.status = 'ACTIVE'
  left join legacy_form_field_mappings m
    on m.form_id = p.form_id
   and upper(trim(m.field_key)) = p.field_key
   and m.status = 'ACTIVE'
)
insert into public.form_field_mappings (
  form_id,
  field_id,
  occurrence_index,
  page_number,
  x,
  y,
  width,
  height,
  page_width,
  page_height,
  font_size,
  field_widget_type,
  default_value_override,
  required,
  notes
)
select
  mp.form_id,
  f.id,
  0,
  mp.page_number,
  mp.x,
  mp.y,
  mp.width,
  mp.height,
  mp.page_width,
  mp.page_height,
  mp.font_size,
  case mp.legacy_field_type
    when 'CHECKBOX' then 'checkbox'
    when 'DATE' then 'date'
    when 'SIGNATURE_PLACEHOLDER' then 'signature'
    when 'INITIAL_PLACEHOLDER' then 'initial'
    else 'text'
  end,
  mp.default_value_override,
  mp.required,
  case
    when mp.mapping_origin is not null and mp.notes is null
      then 'Migrated from legacy mapping_origin: ' || mp.mapping_origin
    else mp.notes
  end
from merged_placements mp
join public.fields f
  on lower(f.field_key) = lower(mp.field_key)
 and f.status = 'ACTIVE';

-- ---------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------

alter table public.fields enable row level security;
alter table public.form_field_mappings enable row level security;
alter table public.field_instances enable row level security;
alter table public.field_instance_mappings enable row level security;

create policy "fields_authenticated_all"
  on public.fields for all to authenticated
  using (true) with check (true);

create policy "form_field_mappings_authenticated_all"
  on public.form_field_mappings for all to authenticated
  using (true) with check (true);

create policy "field_instances_authenticated_all"
  on public.field_instances for all to authenticated
  using (true) with check (true);

create policy "field_instance_mappings_authenticated_all"
  on public.field_instance_mappings for all to authenticated
  using (true) with check (true);

grant select, insert, update, delete on table public.fields to authenticated;
grant select, insert, update, delete on table public.form_field_mappings to authenticated;
grant select, insert, update, delete on table public.field_instances to authenticated;
grant select, insert, update, delete on table public.field_instance_mappings to authenticated;
