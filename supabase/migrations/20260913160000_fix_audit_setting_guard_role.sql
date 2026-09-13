-- Security remediation F9: audit_settings writes are allowed only to privileged
-- database roles. Trigger functions run under the caller role so the check
-- cannot be confused by a security-definer context.

begin;

create or replace function public.audit_settings_trusted_write_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'audit settings can only be changed through the trusted audit operation'
      using errcode = 'insufficient_privilege';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

commit;