-- Native Signing: participant electronic-consent withdrawal.
-- Development first. Forward-only, additive. Do not edit prior migrations.
--
-- An authorized manager records that a participant withdrew electronic
-- consent. The trusted server sets consent_withdrawn_at once and appends an
-- attributable CONSENT_WITHDRAWN event. After that, consent no longer
-- authorizes signing actions, and every automated email to that participant
-- is suppressed and recorded as SUPPRESSED rather than sent.
--
-- Withdrawal never rewrites history: the accepted disclosure version,
-- fingerprint and acceptance time stay exactly as recorded, and signatures,
-- placements, documents, events and completed-document links are untouched.
-- Re-consent within the same Signing is not supported; use a new Signing.

begin;

alter table public.signing_participants
  add column if not exists consent_withdrawn_at timestamptz;

comment on column public.signing_participants.consent_withdrawn_at is
  'When an authorized manager recorded this participant''s withdrawal of electronic consent. Set once by the trusted server; never cleared.';

alter table public.signing_participants
  drop constraint if exists signing_participants_consent_withdrawal_requires_acceptance;
alter table public.signing_participants
  add constraint signing_participants_consent_withdrawal_requires_acceptance
  check (consent_withdrawn_at is null or consent_accepted_at is not null);

create or replace function public.signing_participants_protect_consent_withdrawal()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.consent_withdrawn_at is null then
    return new;
  end if;

  if new.consent_withdrawn_at is distinct from old.consent_withdrawn_at then
    raise exception 'SIGNING_CONSENT_WITHDRAWAL_IMMUTABLE'
      using errcode = 'check_violation';
  end if;

  if new.consent_accepted_at is distinct from old.consent_accepted_at
     or new.consent_disclosure_version_id is distinct from old.consent_disclosure_version_id
     or new.consent_content_sha256 is distinct from old.consent_content_sha256 then
    raise exception 'SIGNING_CONSENT_WITHDRAWN'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function public.signing_participants_protect_consent_withdrawal() from public;

drop trigger if exists signing_participants_protect_consent_withdrawal
  on public.signing_participants;
create trigger signing_participants_protect_consent_withdrawal
  before update of consent_withdrawn_at, consent_accepted_at,
    consent_disclosure_version_id, consent_content_sha256
  on public.signing_participants
  for each row
  execute function public.signing_participants_protect_consent_withdrawal();

-- A delivery that was deliberately not sent is SUPPRESSED, not FAILED.
alter table public.signing_delivery_instructions
  drop constraint if exists sdi_delivery_state_check;
alter table public.signing_delivery_instructions
  add constraint sdi_delivery_state_check
  check (delivery_state in ('PENDING', 'QUEUED', 'ACCEPTED', 'FAILED', 'SUPPRESSED'));

alter table public.signing_delivery_attempts
  drop constraint if exists sda_outcome_check;
alter table public.signing_delivery_attempts
  add constraint sda_outcome_check
  check (outcome in ('ACCEPTED', 'FAILED', 'SUPPRESSED'));

commit;
