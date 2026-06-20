-- Allow representation agreement fields as a mapping data source.

alter table public.form_field_mappings
  drop constraint form_field_mappings_source_type_check;

alter table public.form_field_mappings
  add constraint form_field_mappings_source_type_check
    check (
      source_type is null
      or source_type in (
        'CLIENT',
        'BROKERAGE_SETTINGS',
        'BUYER_REP_DETAILS',
        'LISTING_DETAILS',
        'PROPERTY',
        'REPRESENTATION_AGREEMENT',
        'STATIC_VALUE',
        'MANUAL'
      )
    );
