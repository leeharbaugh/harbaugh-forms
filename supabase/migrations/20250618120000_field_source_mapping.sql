-- Field source mapping columns for resolver configuration.

alter table public.fields
  add column if not exists source_type text,
  add column if not exists source_path text,
  add column if not exists resolver_key text,
  add column if not exists fallback_value text;

alter table public.fields
  drop constraint if exists fields_source_type_check;

alter table public.fields
  add constraint fields_source_type_check
  check (
    source_type is null
    or source_type in (
      'settings_agent',
      'settings_brokerage',
      'packet_contact',
      'packet_property',
      'packet',
      'static_default',
      'custom_resolver',
      'manual_only'
    )
  );
