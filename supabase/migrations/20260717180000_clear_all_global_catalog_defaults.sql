-- Clear remaining Global catalog preference literals from public.fields.
-- Governing rule (2026-07-17): Global catalog fields contain no user-preference
-- defaults. Private and Organization defaults live only in field_defaults.
-- Global catalog default_value / default_checked / fallback_value may be retained
-- only when deliberately classified as structural constants. None are currently
-- documented as approved structural constants.
--
-- Forward-only. Soft-clear of catalog columns only (no hard deletes).
-- Does not touch field_defaults, form_field_mappings, source_*, coordinates,
-- form ownership, or form scope. Does not change PRIVATE-scoped fields.

begin;

update public.fields
set
  default_value = null,
  default_checked = null,
  fallback_value = null,
  update_date = now()
where status = 'ACTIVE'
  and scope = 'GLOBAL'
  and (
    default_value is not null
    or default_checked is not null
    or fallback_value is not null
  );

commit;
