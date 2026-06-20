-- Visual PDF field placements for form templates.

create table public.template_pdf_fields (
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
  is_required boolean not null default false,
  notes text,

  constraint template_pdf_fields_status_check
    check (status in ('ACTIVE', 'INACTIVE', 'DELETED')),
  constraint template_pdf_fields_field_type_check
    check (
      field_type in (
        'TEXT',
        'CHECKBOX',
        'DATE',
        'SIGNATURE_PLACEHOLDER',
        'INITIAL_PLACEHOLDER'
      )
    ),
  constraint template_pdf_fields_field_key_not_blank
    check (length(trim(field_key)) > 0),
  constraint template_pdf_fields_page_number_positive
    check (page_number >= 1)
);

create index template_pdf_fields_status_idx
  on public.template_pdf_fields (status);

create index template_pdf_fields_form_template_id_idx
  on public.template_pdf_fields (form_template_id)
  where status = 'ACTIVE';

create index template_pdf_fields_field_key_idx
  on public.template_pdf_fields (field_key)
  where status = 'ACTIVE';

create unique index template_pdf_fields_template_field_active_uidx
  on public.template_pdf_fields (form_template_id, lower(field_key))
  where status = 'ACTIVE';

create trigger template_pdf_fields_set_update_date
before update on public.template_pdf_fields
for each row execute function public.set_update_date();

alter table public.template_pdf_fields enable row level security;

create policy "template_pdf_fields_authenticated_all"
  on public.template_pdf_fields for all to authenticated
  using (true) with check (true);

grant select, insert, update, delete on table public.template_pdf_fields to authenticated;
