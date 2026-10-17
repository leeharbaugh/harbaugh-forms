-- Draft participant role override marker.
--
-- A manager's explicit Draft role change sets role_overridden_at; Packet role
-- sync never touches a participant once it is set. Draft preparation state
-- only: it is not copied into package revisions (roles freeze there as
-- frozen_role_code). Forward-only; additive; no backfill.

begin;

alter table public.signing_participants
  add column if not exists role_overridden_at timestamptz;

comment on column public.signing_participants.role_overridden_at is
  'Set when a manager explicitly changes this Draft participant''s role; Packet role sync then leaves role_code and optional_role alone.';

comment on column public.signing_participants.optional_role is
  'Optional descriptive relationship label (Primary, Co-client, Spouse, Power of attorney) shown after role_code; never a competing canonical role.';

commit;
