-- Security remediation F9: Supabase executes trigger functions through its
-- database owner, so current_user is not the request role. auth.role() reads
-- the signed request claim and remains accurate inside the trigger.

begin;

create or replace function public.audit_settings_trusted_write_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'audit settings can only be changed through the trusted audit operation'
      using errcode = 'insufficient_privilege';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

commit;