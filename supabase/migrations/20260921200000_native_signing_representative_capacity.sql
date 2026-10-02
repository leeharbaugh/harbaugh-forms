-- Native Signing: representative capacity + Draft email flexibility
-- Development only. Forward-only. Do not edit prior migrations.
--
-- Product: representative signing is first-class for initial release
-- (stated capacity; Harbaugh Forms does not validate legal authority).
-- Draft participants may omit email; remote Send still requires valid email.

-- ---------------------------------------------------------------------------
-- 1. Participant capacity columns
-- ---------------------------------------------------------------------------

alter table public.signing_participants
  add column if not exists signing_capacity_mode text not null default 'PERSONAL';

alter table public.signing_participants
  drop constraint if exists signing_participants_capacity_mode_check;
alter table public.signing_participants
  add constraint signing_participants_capacity_mode_check
  check (signing_capacity_mode in ('PERSONAL', 'REPRESENTATIVE'));

alter table public.signing_participants
  add column if not exists represented_party_name text;

alter table public.signing_participants
  add column if not exists capacity_label text;

alter table public.signing_participants
  drop constraint if exists signing_participants_capacity_label_check;
alter table public.signing_participants
  add constraint signing_participants_capacity_label_check
  check (
    capacity_label is null
    or capacity_label in (
      'ATTORNEY_IN_FACT',
      'TRUSTEE',
      'GUARDIAN',
      'AUTHORIZED_ENTITY_REPRESENTATIVE',
      'EXECUTOR_ADMINISTRATOR',
      'OTHER'
    )
  );

alter table public.signing_participants
  add column if not exists capacity_wording text;

alter table public.signing_participants
  drop constraint if exists signing_participants_representative_fields_check;
alter table public.signing_participants
  add constraint signing_participants_representative_fields_check
  check (
    (
      signing_capacity_mode = 'PERSONAL'
      and represented_party_name is null
      and capacity_label is null
      and capacity_wording is null
    )
    or (
      signing_capacity_mode = 'REPRESENTATIVE'
      and represented_party_name is not null
      and length(trim(represented_party_name)) > 0
      and capacity_label is not null
      and capacity_wording is not null
      and length(trim(capacity_wording)) > 0
    )
  );

comment on column public.signing_participants.signing_capacity_mode is
  'PERSONAL or REPRESENTATIVE. Stated capacity only; not legal authority validation.';
comment on column public.signing_participants.represented_party_name is
  'Person or entity represented when signing_capacity_mode = REPRESENTATIVE.';
comment on column public.signing_participants.capacity_label is
  'Common capacity category or OTHER when representative.';
comment on column public.signing_participants.capacity_wording is
  'Exact agent-prepared execution wording for typed signature / certificate.';

-- Allow empty email in Draft (remote Send still blocked by readiness).
alter table public.signing_participants
  drop constraint if exists signing_participants_email_not_blank;
alter table public.signing_participants
  add constraint signing_participants_email_optional_or_nonblank
  check (email is not null and (email = '' or length(trim(email)) > 0));

-- ---------------------------------------------------------------------------
-- 2. Frozen revision participant evidence
-- ---------------------------------------------------------------------------

alter table public.signing_package_revision_participants
  add column if not exists frozen_signing_capacity_mode text not null default 'PERSONAL';

alter table public.signing_package_revision_participants
  drop constraint if exists sprp_capacity_mode_check;
alter table public.signing_package_revision_participants
  add constraint sprp_capacity_mode_check
  check (frozen_signing_capacity_mode in ('PERSONAL', 'REPRESENTATIVE'));

alter table public.signing_package_revision_participants
  add column if not exists frozen_represented_party_name text;

alter table public.signing_package_revision_participants
  add column if not exists frozen_capacity_label text;

alter table public.signing_package_revision_participants
  add column if not exists frozen_capacity_wording text;

alter table public.signing_package_revision_participants
  drop constraint if exists sprp_representative_fields_check;
alter table public.signing_package_revision_participants
  add constraint sprp_representative_fields_check
  check (
    (
      frozen_signing_capacity_mode = 'PERSONAL'
      and frozen_represented_party_name is null
      and frozen_capacity_label is null
      and frozen_capacity_wording is null
    )
    or (
      frozen_signing_capacity_mode = 'REPRESENTATIVE'
      and frozen_represented_party_name is not null
      and length(trim(frozen_represented_party_name)) > 0
      and frozen_capacity_label is not null
      and frozen_capacity_wording is not null
      and length(trim(frozen_capacity_wording)) > 0
    )
  );

alter table public.signing_package_revision_participants
  drop constraint if exists signing_package_revision_participants_email_not_blank;
alter table public.signing_package_revision_participants
  add constraint sprp_email_optional_or_nonblank
  check (
    frozen_email is not null
    and (frozen_email = '' or length(trim(frozen_email)) > 0)
  );

comment on column public.signing_package_revision_participants.frozen_signing_capacity_mode is
  'Frozen PERSONAL/REPRESENTATIVE capacity mode at package revision promotion.';
comment on column public.signing_package_revision_participants.frozen_capacity_wording is
  'Frozen exact execution wording; typed Signature must match when representative.';
