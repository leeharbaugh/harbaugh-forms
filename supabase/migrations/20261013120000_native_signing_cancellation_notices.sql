-- Native Signing: participant cancellation emails.
-- Development only. Forward-only. Do not edit prior migrations.
--
-- Cancel Signing records two separate values:
--   * cancellation_reason: required, internal audit history, never emailed;
--   * cancellation_participant_message: optional, participant-safe text
--     included in the cancellation email.
--
-- signing_cancel() is the authoritative cancellation transaction: it locks
-- the Signing, writes CANCELLED with both values, and queues exactly one
-- CANCELLATION delivery instruction plus outbox work item per invited
-- participant. The email itself is sent after commit by the Signing worker;
-- provider failure never touches lifecycle.
--
-- "Invited" is invitation history, not current link validity: a participant
-- with any INVITATION delivery instruction, or any credential on a Signing
-- activated by REMOTE_SEND (covers an enqueue that failed after activation).
-- In-person-only participants and never-activated Draft participants have
-- neither and receive nothing.

begin;

alter table public.signings
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by_user_id uuid,
  add column if not exists cancellation_reason text,
  add column if not exists cancellation_participant_message text;

comment on column public.signings.cancellation_reason is
  'Internal Cancel Signing reason for audit history. Never sent to participants.';
comment on column public.signings.cancellation_participant_message is
  'Optional participant-safe explanation included in cancellation emails.';

alter table public.signings
  drop constraint if exists signings_cancellation_reason_length;
alter table public.signings
  add constraint signings_cancellation_reason_length
  check (cancellation_reason is null or length(cancellation_reason) between 1 and 500);

alter table public.signings
  drop constraint if exists signings_cancellation_message_length;
alter table public.signings
  add constraint signings_cancellation_message_length
  check (
    cancellation_participant_message is null
    or length(cancellation_participant_message) between 1 and 1000
  );

-- ---------------------------------------------------------------------------
-- Delivery purpose
-- ---------------------------------------------------------------------------

alter table public.signing_delivery_instructions
  drop constraint if exists sdi_purpose_check;
alter table public.signing_delivery_instructions
  add constraint sdi_purpose_check
  check (purpose in ('INVITATION', 'COMPLETED_PACKAGE', 'CANCELLATION'));

alter table public.signing_delivery_instructions
  drop constraint if exists sdi_cancellation_requires_participant;
alter table public.signing_delivery_instructions
  add constraint sdi_cancellation_requires_participant
  check (purpose <> 'CANCELLATION' or signing_participant_id is not null);

-- At most one logical cancellation email per participant (cancellation is
-- terminal, so there is only ever one cancellation per Signing).
create unique index if not exists sdi_cancellation_participant_uidx
  on public.signing_delivery_instructions (signing_id, signing_participant_id)
  where purpose = 'CANCELLATION';

-- ---------------------------------------------------------------------------
-- Authoritative cancellation transaction
-- ---------------------------------------------------------------------------

create or replace function public.signing_cancel(
  p_signing_id uuid,
  p_actor_user_id uuid,
  p_reason text,
  p_participant_message text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_signing record;
  v_now timestamptz := now();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_message text := nullif(btrim(coalesce(p_participant_message, '')), '');
  v_revision_id uuid;
  v_notices integer := 0;
begin
  select id, lifecycle_state, activation_mode, current_package_revision_id,
         frozen_package_revision_id, archived_at, cancelled_at
    into v_signing
    from public.signings
   where id = p_signing_id
   for update;

  if not found then
    raise exception 'SIGNING_CANCEL_NOT_FOUND';
  end if;

  if v_signing.lifecycle_state = 'CANCELLED' then
    select count(*) into v_notices
      from public.signing_delivery_instructions
     where signing_id = p_signing_id
       and purpose = 'CANCELLATION';
    return jsonb_build_object(
      'already_cancelled', true,
      'previous_lifecycle_state', 'CANCELLED',
      'cancelled_at', v_signing.cancelled_at,
      'archived', v_signing.archived_at is not null,
      'cancellation_notices', v_notices
    );
  end if;

  if v_signing.lifecycle_state not in ('DRAFT', 'IN_PROGRESS') then
    raise exception 'SIGNING_CANCEL_NOT_ALLOWED';
  end if;

  if v_reason is null then
    raise exception 'SIGNING_CANCEL_REASON_REQUIRED';
  end if;
  if length(v_reason) > 500 then
    raise exception 'SIGNING_CANCEL_REASON_TOO_LONG';
  end if;
  if v_message is not null and length(v_message) > 1000 then
    raise exception 'SIGNING_CANCEL_MESSAGE_TOO_LONG';
  end if;

  update public.signings
     set lifecycle_state = 'CANCELLED',
         cancelled_at = v_now,
         cancelled_by_user_id = p_actor_user_id,
         cancellation_reason = v_reason,
         cancellation_participant_message = v_message
   where id = p_signing_id;

  v_revision_id := coalesce(
    v_signing.frozen_package_revision_id,
    v_signing.current_package_revision_id
  );

  with invited as (
    select p.id as participant_id,
           p.full_name,
           p.email
      from public.signing_participants p
     where p.signing_id = p_signing_id
       and (
         exists (
           select 1
             from public.signing_delivery_instructions i
            where i.signing_id = p_signing_id
              and i.signing_participant_id = p.id
              and i.purpose = 'INVITATION'
         )
         or (
           v_signing.activation_mode = 'REMOTE_SEND'
           and exists (
             select 1
               from public.signing_participant_credentials c
              where c.signing_id = p_signing_id
                and c.signing_participant_id = p.id
           )
         )
       )
  ),
  recipients as (
    select inv.participant_id,
           coalesce(
             nullif(btrim(rp.frozen_email), ''),
             nullif(btrim(last_inv.recipient_email_snapshot), ''),
             nullif(btrim(inv.email), ''),
             '(missing)'
           ) as email,
           coalesce(
             nullif(btrim(rp.frozen_full_name), ''),
             nullif(btrim(last_inv.recipient_name_snapshot), ''),
             nullif(btrim(inv.full_name), ''),
             'Participant'
           ) as full_name
      from invited inv
      left join public.signing_package_revision_participants rp
        on rp.signing_id = p_signing_id
       and rp.package_revision_id = v_revision_id
       and rp.signing_participant_id = inv.participant_id
      left join lateral (
        select i.recipient_email_snapshot, i.recipient_name_snapshot
          from public.signing_delivery_instructions i
         where i.signing_id = p_signing_id
           and i.signing_participant_id = inv.participant_id
           and i.purpose = 'INVITATION'
         order by i.create_date desc
         limit 1
      ) last_inv on true
  ),
  inserted as (
    insert into public.signing_delivery_instructions (
      signing_id,
      signing_participant_id,
      purpose,
      recipient_email_snapshot,
      recipient_name_snapshot,
      package_revision_id,
      delivery_state,
      initiated_by_user_id
    )
    select p_signing_id,
           r.participant_id,
           'CANCELLATION',
           lower(r.email),
           r.full_name,
           v_revision_id,
           'QUEUED',
           p_actor_user_id
      from recipients r
    on conflict (signing_id, signing_participant_id)
      where purpose = 'CANCELLATION'
      do nothing
    returning id, signing_participant_id
  ),
  queued as (
    insert into public.signing_work_items (
      signing_id,
      work_type,
      idempotency_key,
      reference_json,
      processing_state,
      next_attempt_at
    )
    select p_signing_id,
           'PARTICIPANT_CANCELLATION_EMAIL',
           'cancellation:' || ins.signing_participant_id::text,
           jsonb_build_object(
             'deliveryInstructionId', ins.id,
             'signingParticipantId', ins.signing_participant_id
           ),
           'PENDING',
           v_now
      from inserted ins
    on conflict (signing_id, work_type, idempotency_key) do nothing
    returning id
  )
  select count(*) into v_notices from queued;

  return jsonb_build_object(
    'already_cancelled', false,
    'previous_lifecycle_state', v_signing.lifecycle_state,
    'cancelled_at', v_now,
    'archived', v_signing.archived_at is not null,
    'cancellation_notices', v_notices
  );
end;
$$;

revoke all on function public.signing_cancel(uuid, uuid, text, text) from public;
revoke all on function public.signing_cancel(uuid, uuid, text, text) from anon;
revoke all on function public.signing_cancel(uuid, uuid, text, text) from authenticated;
grant execute on function public.signing_cancel(uuid, uuid, text, text) to service_role;

commit;
