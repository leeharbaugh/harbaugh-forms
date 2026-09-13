-- Security remediation F9: make the table browser-inaccessible at the RLS
-- boundary. The administrator console uses a trusted service-role reader and
-- service-role-only RPC; no authenticated browser query needs this table.

begin;

drop policy if exists audit_settings_service_only on public.audit_settings;
create policy audit_settings_service_only
  on public.audit_settings
  as restrictive
  for all
  to authenticated
  using (false)
  with check (false);

commit;