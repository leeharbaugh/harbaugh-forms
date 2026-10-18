-- Native Signing: Archive Signing evidence guard fix.
-- Development only. Forward-only. Do not edit prior migrations.
--
-- 20261012120000 referenced signing_participants columns in a condition that
-- PL/pgSQL also evaluated for signing_adopted_marks and
-- signing_field_placements rows, so every mark/placement write failed. The
-- participant-only column comparison now runs only for that table.

begin;

create or replace function public.signing_reject_evidence_when_archived()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_signing record;
begin
  if tg_table_name = 'signing_participants' then
    if new.participant_status is not distinct from old.participant_status
       and new.consent_accepted_at is not distinct from old.consent_accepted_at
       and new.identity_confirmed_at is not distinct from old.identity_confirmed_at
       and new.finished_at is not distinct from old.finished_at
       and new.declined_at is not distinct from old.declined_at then
      return new;
    end if;
  end if;

  select lifecycle_state, archived_at
    into v_signing
    from public.signings
   where id = new.signing_id
   for share;

  if v_signing.archived_at is not null
     and v_signing.lifecycle_state = 'IN_PROGRESS' then
    raise exception 'SIGNING_ARCHIVED'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

commit;
