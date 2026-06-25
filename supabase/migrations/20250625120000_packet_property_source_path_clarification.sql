-- Clarify packet_property source paths: migrate legacy "address" to "full_address".
-- Resolver still accepts "address" for backward compatibility.

update public.fields
set
  source_path = 'full_address',
  update_date = now()
where status = 'ACTIVE'
  and source_type = 'packet_property'
  and lower(trim(source_path)) = 'address';
