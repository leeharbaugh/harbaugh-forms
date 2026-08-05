-- Catalog metadata for the reusable Packet Tenant Names custom resolver.
-- Runtime resolution is TypeScript (`tenant_names` in CUSTOM_RESOLVER_KEYS /
-- resolveCustomResolverKey). This row keeps field_resolvers aligned with
-- buyer_names / seller_names for admin discoverability.

insert into public.field_resolvers (
  resolver_key,
  friendly_name,
  category,
  description,
  example_output,
  status
)
select
  'tenant_names',
  'Packet Tenant Names',
  'contact_tenant',
  'Comma-separated display names of active tenant-side packet contacts (same role set as tenant_1 / tenant_2), ordered by sort_order. Duplicate contact links and blank names are omitted.',
  'Jane Tenant, John Tenant',
  'ACTIVE'
where not exists (
  select 1
  from public.field_resolvers
  where resolver_key = 'tenant_names'
    and status = 'ACTIVE'
);
