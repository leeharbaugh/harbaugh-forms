-- PDF field overlay mappings for form templates.

create table public.form_field_mappings (
  id bigint generated always as identity primary key,
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),
  status varchar(20) not null default 'ACTIVE',

  form_template_id bigint not null
    references public.form_templates (id) on delete restrict,
  field_key varchar(100) not null,
  field_label varchar(255),
  field_type varchar(30) not null,
  page_number integer not null,
  x_position numeric(10, 2) not null,
  y_position numeric(10, 2) not null,
  width numeric(10, 2),
  height numeric(10, 2),
  font_size numeric(5, 2) not null default 10,
  source_type varchar(50),
  source_field varchar(100),
  static_value text,
  is_required boolean not null default false,
  notes text,

  constraint form_field_mappings_status_check
    check (status in ('ACTIVE', 'INACTIVE', 'DELETED')),
  constraint form_field_mappings_field_type_check
    check (
      field_type in (
        'TEXT',
        'CHECKBOX',
        'DATE',
        'SIGNATURE_PLACEHOLDER',
        'INITIAL_PLACEHOLDER'
      )
    ),
  constraint form_field_mappings_source_type_check
    check (
      source_type is null
      or source_type in (
        'CLIENT',
        'BROKERAGE_SETTINGS',
        'BUYER_REP_DETAILS',
        'LISTING_DETAILS',
        'PROPERTY',
        'STATIC_VALUE',
        'MANUAL'
      )
    ),
  constraint form_field_mappings_field_key_not_blank
    check (length(trim(field_key)) > 0),
  constraint form_field_mappings_page_number_positive
    check (page_number >= 1)
);

create index form_field_mappings_status_idx
  on public.form_field_mappings (status);

create index form_field_mappings_form_template_id_idx
  on public.form_field_mappings (form_template_id)
  where status = 'ACTIVE';

create index form_field_mappings_field_key_idx
  on public.form_field_mappings (field_key)
  where status = 'ACTIVE';

create unique index form_field_mappings_template_field_active_uidx
  on public.form_field_mappings (form_template_id, lower(field_key))
  where status = 'ACTIVE';

create trigger form_field_mappings_set_update_date
before update on public.form_field_mappings
for each row execute function public.set_update_date();

alter table public.form_field_mappings enable row level security;

create policy "form_field_mappings_authenticated_all"
  on public.form_field_mappings for all to authenticated
  using (true) with check (true);

grant select, insert, update, delete on table public.form_field_mappings to authenticated;
