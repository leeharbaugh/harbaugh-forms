-- Native Signing: one-time acknowledgement of the Draft auto-add notice.
-- Development only. Forward-only. Do not edit prior migrations.
--
-- `auto_added_from_packet_at` records that Draft auto-add inserted a
-- participant, so the "Added from the source Packet" notice survives a
-- discarded server render. This column records that a manager's browser
-- displayed the notice for that participant in a committed render; the
-- notice then lists only marked participants not yet acknowledged.
-- A later auto-add marks new rows, which start unacknowledged.
--
-- UI notification metadata only: never evidence, never part of package
-- fingerprints, written only by the trusted acknowledge action after Draft
-- manage authorization (the table has forced RLS with deny policies).

begin;

alter table public.signing_participants
  add column if not exists auto_add_notice_acknowledged_at timestamptz;

alter table public.signing_participants
  drop constraint if exists signing_participants_auto_add_ack_requires_marker;

alter table public.signing_participants
  add constraint signing_participants_auto_add_ack_requires_marker
  check (auto_add_notice_acknowledged_at is null or auto_added_from_packet_at is not null);

comment on column public.signing_participants.auto_add_notice_acknowledged_at is
  'Draft-only: when a manager''s browser displayed the auto-add notice for this participant. Notification metadata only; never evidence.';

commit;
