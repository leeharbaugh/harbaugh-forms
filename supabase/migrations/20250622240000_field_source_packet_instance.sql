-- Add packet_instance as a first-class fields.source_type.

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
      'buyer_rep_details',
      'listing_agreement_details',
      'representation_agreement',
      'static_default',
      'custom_resolver',
      'manual_only',
      'packet_instance'
    )
  );
