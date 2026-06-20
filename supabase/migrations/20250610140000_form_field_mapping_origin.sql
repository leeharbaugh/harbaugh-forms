-- Track whether a field mapping was created manually or approved from AI suggestions.

alter table public.form_field_mappings
  add column mapping_origin varchar(20) not null default 'MANUAL';

alter table public.form_field_mappings
  add constraint form_field_mappings_mapping_origin_check
    check (mapping_origin in ('MANUAL', 'AI_SUGGESTED'));
