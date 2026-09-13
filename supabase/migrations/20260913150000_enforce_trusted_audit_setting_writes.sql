-- Security remediation F9 follow-up: PostgREST may report a denied RLS update as
-- a successful no-op. Guard audit_settings itself so an authenticated request
-- is explicitly rejected even if a future policy or grant is misconfigured.

begin;

create or replace function public.audit_settings_trusted_write_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    raise exception 'audit settings can only be changed through the trusted audit operation'
      using errcode = 'insufficient_privilege';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.audit_settings_trusted_write_guard() from public;

drop trigger if exists audit_settings_trusted_write_guard on public.audit_settings;
create trigger audit_settings_trusted_write_guard
before insert or update or delete on public.audit_settings
for each row execute function public.audit_settings_trusted_write_guard();

commit;