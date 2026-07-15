-- Scoped field defaults: move preference defaults off Global fields into
-- public.field_defaults (PRIVATE / ORGANIZATION only). Additive.
-- Soft-delete via status update. App admins may manage org defaults and their
-- own private defaults, but not other users' PRIVATE rows.

begin;

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------

create table if not exists public.field_defaults (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),
  status varchar(20) not null default 'ACTIVE',

  field_id uuid not null
    references public.fields (id) on delete restrict,
  form_id bigint null
    references public.forms (id) on delete set null,
  form_field_mapping_id uuid null
    references public.form_field_mappings (id) on delete set null,

  scope varchar(20) not null,
  owner_user_id uuid null
    references auth.users (id) on delete set null,
  organization_id uuid null
    references public.organizations (id) on delete set null,

  default_value text null,
  default_checked boolean null,

  created_by_user_id uuid null,
  updated_by_user_id uuid null,
  notes text null,

  constraint field_defaults_status_check
    check (status in ('ACTIVE', 'INACTIVE', 'DELETED')),
  constraint field_defaults_scope_check
    check (scope in ('PRIVATE', 'ORGANIZATION')),
  constraint field_defaults_scope_ownership_check
    check (
      (scope = 'PRIVATE' and owner_user_id is not null and organization_id is null)
      or (scope = 'ORGANIZATION' and organization_id is not null and owner_user_id is null)
    ),
  -- Empty string is allowed for default_value; at least one of value/checked must be set.
  constraint field_defaults_has_default_check
    check (default_value is not null or default_checked is not null)
);

comment on table public.field_defaults is
  'User- or organization-scoped preference defaults for catalog fields. GLOBAL structural defaults remain on fields/form_field_mappings.';

comment on column public.field_defaults.id is
  'Primary key.';
comment on column public.field_defaults.create_date is
  'Row creation timestamp.';
comment on column public.field_defaults.update_date is
  'Row last-update timestamp; maintained by set_update_date trigger.';
comment on column public.field_defaults.status is
  'ACTIVE / INACTIVE / DELETED. Soft-delete via status update under mutate RLS rules.';
comment on column public.field_defaults.field_id is
  'Catalog field this default applies to.';
comment on column public.field_defaults.form_id is
  'Optional form scope; null means field-level default across forms.';
comment on column public.field_defaults.form_field_mapping_id is
  'Optional mapping scope; null means not tied to a specific form_field_mappings row.';
comment on column public.field_defaults.scope is
  'PRIVATE (owner_user_id) or ORGANIZATION (organization_id). No GLOBAL scope; structural defaults stay on fields.';
comment on column public.field_defaults.owner_user_id is
  'Required for PRIVATE; owner of this preference default. Null for ORGANIZATION.';
comment on column public.field_defaults.organization_id is
  'Required for ORGANIZATION; brokerage that owns this default. Null for PRIVATE.';
comment on column public.field_defaults.default_value is
  'Text/default value preference. Empty string is a valid set value.';
comment on column public.field_defaults.default_checked is
  'Checkbox preference when non-null.';
comment on column public.field_defaults.created_by_user_id is
  'User who created this row (audit).';
comment on column public.field_defaults.updated_by_user_id is
  'User who last updated this row (audit).';
comment on column public.field_defaults.notes is
  'Migration/review notes; not used for resolution.';

-- ---------------------------------------------------------------------------
-- 2. Indexes
-- ---------------------------------------------------------------------------

create unique index if not exists field_defaults_private_active_uidx
  on public.field_defaults (
    owner_user_id,
    field_id,
    coalesce(form_id, 0),
    coalesce(form_field_mapping_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status = 'ACTIVE' and scope = 'PRIVATE';

create unique index if not exists field_defaults_organization_active_uidx
  on public.field_defaults (
    organization_id,
    field_id,
    coalesce(form_id, 0),
    coalesce(form_field_mapping_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status = 'ACTIVE' and scope = 'ORGANIZATION';

create index if not exists field_defaults_field_id_idx
  on public.field_defaults (field_id);

create index if not exists field_defaults_owner_user_id_idx
  on public.field_defaults (owner_user_id);

create index if not exists field_defaults_organization_id_idx
  on public.field_defaults (organization_id);

create index if not exists field_defaults_status_idx
  on public.field_defaults (status);

drop trigger if exists field_defaults_set_update_date on public.field_defaults;
create trigger field_defaults_set_update_date
before update on public.field_defaults
for each row execute function public.set_update_date();

-- ---------------------------------------------------------------------------
-- 3. RLS
-- App admin may SELECT all rows; mutate support is own PRIVATE + any ORGANIZATION.
-- App admin intentionally cannot UPDATE/INSERT other users' PRIVATE defaults.
-- Soft-delete is status UPDATE under the same mutate rules (no DELETE policy).
-- ---------------------------------------------------------------------------

alter table public.field_defaults enable row level security;

drop policy if exists "field_defaults_select" on public.field_defaults;
drop policy if exists "field_defaults_insert" on public.field_defaults;
drop policy if exists "field_defaults_update" on public.field_defaults;

create policy "field_defaults_select"
  on public.field_defaults
  for select
  to authenticated
  using (
    public.is_app_admin()
    or (scope = 'PRIVATE' and owner_user_id = auth.uid())
    or (
      scope = 'ORGANIZATION'
      and organization_id is not null
      and public.is_active_organization_member(organization_id)
    )
  );

create policy "field_defaults_insert"
  on public.field_defaults
  for insert
  to authenticated
  with check (
    -- PRIVATE: caller must be the owner (app admin: own private only for now)
    (
      scope = 'PRIVATE'
      and owner_user_id = auth.uid()
      and organization_id is null
    )
    or (
      -- ORGANIZATION: org admin or app admin
      scope = 'ORGANIZATION'
      and organization_id is not null
      and owner_user_id is null
      and (
        public.is_active_organization_admin(organization_id)
        or public.is_app_admin()
      )
    )
  );

create policy "field_defaults_update"
  on public.field_defaults
  for update
  to authenticated
  using (
    (scope = 'PRIVATE' and owner_user_id = auth.uid())
    or (
      scope = 'ORGANIZATION'
      and organization_id is not null
      and (
        public.is_active_organization_admin(organization_id)
        or public.is_app_admin()
      )
    )
  )
  with check (
    (scope = 'PRIVATE' and owner_user_id = auth.uid())
    or (
      scope = 'ORGANIZATION'
      and organization_id is not null
      and owner_user_id is null
      and (
        public.is_active_organization_admin(organization_id)
        or public.is_app_admin()
      )
    )
  );

grant select, insert, update on table public.field_defaults to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Data migration (inventory 2026-07-15)
-- Lee PRIVATE: 54 + CONTRACT_PROPERTY_AS_IS (UNKNOWN → PRIVATE with review note)
-- Org ORGANIZATION: 4
-- Clear Global defaults for migrated + packet + INACTIVE AcroForm Off duplicates.
-- Leave STRUCTURAL NA / money-zero STRUCTURAL / money-zero UNKNOWN on Global.
-- Do not touch ACTIVE mapping Off overrides.
-- Values taken from _defaults_inventory.json (match current Global fields rows).
-- ---------------------------------------------------------------------------

do $$
declare
  v_lee uuid := 'e26c8f57-c0aa-4474-b43e-6e15f0260e99'::uuid;
  v_org uuid := 'b788f525-53f4-42ed-b5a1-cb741398a974'::uuid;
begin
  if not exists (select 1 from public.profiles p where p.id = v_lee) then
    raise exception 'field_defaults migration: Lee profile % does not exist', v_lee;
  end if;

  if not exists (select 1 from public.organizations o where o.id = v_org) then
    raise exception 'field_defaults migration: organization % does not exist', v_org;
  end if;
end;
$$;

insert into public.field_defaults (
  field_id,
  default_value,
  default_checked,
  scope,
  owner_user_id,
  organization_id,
  notes,
  created_by_user_id
)
select
  v.field_id,
  v.default_value,
  v.default_checked,
  v.scope,
  v.owner_user_id,
  v.organization_id,
  v.notes,
  'e26c8f57-c0aa-4474-b43e-6e15f0260e99'::uuid
from (
  values
  (
    $fdv$a528c4e3-d980-42f8-9b90-789d746f6145$fdv$::uuid,
    null::text,
    true,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- CONTRACT_WATER_DISCLOSURE_NOT_REQUIRED
,  (
    $fdv$947bb7a8-4cbe-46c0-bc0f-fc6e8a31366e$fdv$::uuid,
    null::text,
    true,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    $fdn$Source field is INACTIVE; retained as Lee private preference if revived.$fdn$
  ) -- ALLOW_INTERMEDIARY
,  (
    $fdv$36daae3b-ffb0-4be0-ab63-ec17c2f5d006$fdv$::uuid,
    null::text,
    true,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- BUYER_REP_ADD_GENERAL_INFORMATION_NOTICE
,  (
    $fdv$7ca1c044-59f3-4fbe-9ff6-d2509cd61313$fdv$::uuid,
    null::text,
    true,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- BUYER_REP_ADD_WIRE_FRAUD
,  (
    $fdv$31b47d47-9fa6-454e-874e-a1a36ef2c1c0$fdv$::uuid,
    $fdv$Dallas/Tarrant$fdv$,
    null::boolean,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- PAYMENT_COUNTY
,  (
    $fdv$09a715cb-7a37-4692-bba8-f8d2316074f0$fdv$::uuid,
    null::text,
    true,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- ADD_IABS
,  (
    $fdv$5ed7cc9f-622f-4c91-b5b7-5b8aa0e0585c$fdv$::uuid,
    $fdv$30$fdv$,
    null::boolean,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- PROTECTION_PERIOD_DAYS
,  (
    $fdv$dba66736-1ec2-41e0-8be2-5566cd7e6507$fdv$::uuid,
    null::text,
    true,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- BUYER_REP_INTERMEDIARY_STATUS_YES
,  (
    $fdv$d7cd8260-f5af-42b8-89cf-2d0da3399648$fdv$::uuid,
    null::text,
    true,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- BUYER_REP_ADD_HOME_INSPECTION
,  (
    $fdv$36a310d2-d5b4-43ea-be8c-19e25d5ae1bd$fdv$::uuid,
    null::text,
    true,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- ASSOCIATE_SIGNATURE_BOX
,  (
    $fdv$c212f8d3-fe1f-49cb-b50d-7ca25d285c54$fdv$::uuid,
    null::text,
    true,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- MLS_FILE_LISTING
,  (
    $fdv$6b65f1b8-8760-4b12-91e1-29f5fc4ea468$fdv$::uuid,
    null::text,
    true,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- LISTING_COMPENSATION_MODEL_WITH_COOP
,  (
    $fdv$b1fe245b-392a-4602-972e-00a3e1c375de$fdv$::uuid,
    null::text,
    true,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- MLS_FILE_IMMEDIATELY
,  (
    $fdv$4c8b9d81-896a-4516-8236-28266ff077a8$fdv$::uuid,
    null::text,
    true,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- KEYBOX_AUTHORIZED_YES
,  (
    $fdv$4cb5280f-65e4-4419-8c02-aab5f283ce2a$fdv$::uuid,
    null::text,
    true,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- LISTING_INTERMEDIARY_YES
,  (
    $fdv$3311c96c-eb8f-42c7-989a-9de1bb97c6ad$fdv$::uuid,
    null::text,
    true,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- FINANCING_CONVENTIONAL
,  (
    $fdv$9db19ac1-eabb-4826-9757-6c9efa83b45f$fdv$::uuid,
    null::text,
    true,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- FINANCING_FHA
,  (
    $fdv$966f8d2d-932a-4d8a-9a94-370550690cda$fdv$::uuid,
    null::text,
    true,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- FINANCING_VA
,  (
    $fdv$860c8696-5631-4e3e-a690-2a823795c173$fdv$::uuid,
    null::text,
    true,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- FINANCING_TEXAS_VETERANS
,  (
    $fdv$888cd309-28f6-46b0-bbc3-80e9330f7b85$fdv$::uuid,
    null::text,
    true,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- FINANCING_CASH
,  (
    $fdv$d5944d77-d968-489a-be3f-88f8b88016ec$fdv$::uuid,
    null::text,
    true,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- LISTING_ADD_SELLERS_DISCLOSURE
,  (
    $fdv$d5763dc1-8999-4644-a23a-6c8fd4e69731$fdv$::uuid,
    null::text,
    true,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- LISTING_ADD_MINERAL_INFO
,  (
    $fdv$c87c03a5-bf42-4449-af96-95763bdc7a2f$fdv$::uuid,
    $fdv$3$fdv$,
    null::boolean,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- TXR_2001_INVENTORY_CONDITION_DUE_DAYS
,  (
    $fdv$02c5a1ff-2a57-4aa5-bd5e-540fd1a0dab4$fdv$::uuid,
    $fdv$Twice per week as weather dictates$fdv$,
    null::boolean,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- TXR_2001_YARD_WATERING_TIMES
,  (
    $fdv$c7eabed4-ac1a-4d99-8448-03b60693bd17$fdv$::uuid,
    null::text,
    true,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- TXR_2001_YARD_MAINTAINED_BY_TENANT
,  (
    $fdv$d96b71d9-35ef-4a5a-a2cf-22819ef889b9$fdv$::uuid,
    null::text,
    true,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- CONTRACT_BUYER_POSSESSION_AT_CLOSING
,  (
    $fdv$ac99f38c-27f8-4858-aa3e-c68f1a94ae55$fdv$::uuid,
    $fdv$45$fdv$,
    null::boolean,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- TXR_2001_TERMINATION_NOTICE_DAYS_BEFORE_EXPIRATION
,  (
    $fdv$e8be8ea5-0f47-4d7a-baa6-0bf0fdf8e69d$fdv$::uuid,
    null::text,
    true,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- TXR_2001_SECURITY_DEPOSIT_DUE_ON_EXECUTION
,  (
    $fdv$c4e82ea4-c14b-404e-83e2-55ca575c7535$fdv$::uuid,
    null::text,
    true,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- TXR_2001_INITIAL_LATE_FEE_AMOUNT_CHECKED
,  (
    $fdv$c453bfe1-9afa-4a3a-ba26-42819066dd61$fdv$::uuid,
    $fdv$50$fdv$,
    null::boolean,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- TXR_2001_RETURNED_PAYMENT_FEE
,  (
    $fdv$bc48623b-d1e0-46bd-9e44-7d3d796dcb91$fdv$::uuid,
    $fdv$Single family only. No major auto repairs. No parking on grass. Tenant is responsible for light bulbs. Tenant is responsible for pest control.$fdv$,
    null::boolean,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- TXR_2001_SPECIAL_PROVISIONS
,  (
    $fdv$54b2daba-1958-42f2-a95d-dfae9fd24728$fdv$::uuid,
    null::text,
    true,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- TXR_2001_REPLACEMENT_TENANT_FEE_LANDLORD_PROCURES_PERCENT_CHECKED
,  (
    $fdv$9c2f4fc1-195f-40d6-8826-2d94bc9608c3$fdv$::uuid,
    null::text,
    true,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- TXR_2001_SMOKING_NOT_PERMITTED
,  (
    $fdv$8aa470f2-7d6e-4ef5-a537-4457e2d5bf61$fdv$::uuid,
    $fdv$10$fdv$,
    null::boolean,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- TXR_2001_UNAUTHORIZED_ANIMAL_DAILY_CHARGE
,  (
    $fdv$626ce306-4ef5-427d-b0df-f79d97ade2c8$fdv$::uuid,
    $fdv$100$fdv$,
    null::boolean,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- TXR_2001_ACCESS_TRIP_CHARGE
,  (
    $fdv$448d1e05-8510-48f1-a405-b2eac1863925$fdv$::uuid,
    $fdv$250$fdv$,
    null::boolean,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- TXR_2001_KEYBOX_WITHDRAWAL_FEE
,  (
    $fdv$621751ca-9f68-4547-acbd-b82cbc64ab89$fdv$::uuid,
    null::text,
    true,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- TXR_2001_LIABILITY_INSURANCE_REQUIRED_YES
,  (
    $fdv$f1e33c27-70d9-48bc-acc0-986f61ae262b$fdv$::uuid,
    $fdv$45$fdv$,
    null::boolean,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- TXR_2001_AUTO_RENEWAL_NOTICE_OTHER_DAYS
,  (
    $fdv$4cf3ac91-28b8-4558-a725-46c9288d8284$fdv$::uuid,
    $fdv$3$fdv$,
    null::boolean,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- TXR_2001_VEHICLE_LIMIT
,  (
    $fdv$e4ca3ca2-4d5f-4e1a-838d-744899221685$fdv$::uuid,
    null::text,
    true,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- TXR_2001_RENT_DUE_FIRST_DAY
,  (
    $fdv$62af561c-0adc-466d-bda6-830d95f4c4f1$fdv$::uuid,
    null::text,
    true,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- TXR_2001_ADDITIONAL_LATE_FEE_AMOUNT_CHECKED
,  (
    $fdv$7f820e7f-11a0-4fb6-a177-fbd7c9a797fa$fdv$::uuid,
    $fdv$45$fdv$,
    null::boolean,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- TXR_2001_KEYBOX_AUTHORIZED_LAST_DAYS
,  (
    $fdv$1c46fcb4-dfd4-45a1-a6ad-644422b99664$fdv$::uuid,
    $fdv$85$fdv$,
    null::boolean,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- TXR_2001_REPLACEMENT_TENANT_FEE_LANDLORD_PROCURES_PERCENT
,  (
    $fdv$ff54fb53-ea6f-43f7-abab-495296fb57ae$fdv$::uuid,
    null::text,
    true,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- TXR_2001_FIRST_MONTH_RENT_PAYABLE_TO_LANDLORD
,  (
    $fdv$bf743a7f-eb33-4570-af58-bcf9137b3af0$fdv$::uuid,
    $fdv$45$fdv$,
    null::boolean,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- TXR_2001_INITIAL_LATE_FEE_AMOUNT
,  (
    $fdv$e9ae5e97-4e78-4623-93f7-0902376f8c7d$fdv$::uuid,
    $fdv$10$fdv$,
    null::boolean,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- TXR_2001_ADDITIONAL_LATE_FEE_AMOUNT
,  (
    $fdv$7228e019-c849-43f9-baef-8ae0e4da6e73$fdv$::uuid,
    null::text,
    true,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- TXR_2001_MONTH_TO_MONTH_TERMINATION_LAST_DAY_NEXT_MONTH
,  (
    $fdv$aadc7808-7fb3-4c67-be1f-fd7c37df1522$fdv$::uuid,
    $fdv$85$fdv$,
    null::boolean,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- TXR_2001_REPLACEMENT_TENANT_FEE_TENANT_PROCURES_PERCENT
,  (
    $fdv$e9a0aa75-2b32-4a27-89b9-7664d3698e92$fdv$::uuid,
    $fdv$DFW Metro$fdv$,
    null::boolean,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- BUYER_REP_MARKET_AREA
,  (
    $fdv$5c0204ff-5609-4ac6-88be-d0de2a8f5c59$fdv$::uuid,
    $fdv$21$fdv$,
    null::boolean,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- TXR_2001_GUEST_CONSECUTIVE_DAY_LIMIT
,  (
    $fdv$18dab366-85ef-4c6b-8fe6-411eb5f09869$fdv$::uuid,
    $fdv$5th$fdv$,
    null::boolean,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- TXR_2001_LATE_FEE_DUE_DAY
,  (
    $fdv$03337afc-c3b0-4228-9227-978920a8816d$fdv$::uuid,
    null::text,
    true,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- TXR_2001_AUTO_RENEWAL_NOTICE_OTHER_DAYS_CHECKED
,  (
    $fdv$9c8ac69d-34b1-4ff8-8c57-0c7f59878d4c$fdv$::uuid,
    $fdv$300$fdv$,
    null::boolean,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- TXR_2001_UNAUTHORIZED_ANIMAL_INITIAL_CHARGE
,  (
    $fdv$509e6201-ce4e-446a-a055-af43001fc151$fdv$::uuid,
    null::text,
    true,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    null::text
  ) -- TXR_2001_REPLACEMENT_TENANT_FEE_TENANT_PROCURES_PERCENT_CHECKED
,  (
    $fdv$1c7ef2a8-0842-4a84-80ac-4e69a8ec2437$fdv$::uuid,
    $fdv$Broker Bay$fdv$,
    null::boolean,
    'ORGANIZATION',
    null::uuid,
    $fdv$b788f525-53f4-42ed-b5a1-cb741398a974$fdv$::uuid,
    null::text
  ) -- SCHEDULING_COMPANY
,  (
    $fdv$72cdf8b6-cbe1-43d1-8c6e-c427bff8741d$fdv$::uuid,
    $fdv$Broker Bay$fdv$,
    null::boolean,
    'ORGANIZATION',
    null::uuid,
    $fdv$b788f525-53f4-42ed-b5a1-cb741398a974$fdv$::uuid,
    null::text
  ) -- LEASE_SCHEDULING_COMPANY
,  (
    $fdv$2f3851c6-8cdc-40cc-95de-8c49f06bbe78$fdv$::uuid,
    null::text,
    true,
    'ORGANIZATION',
    null::uuid,
    $fdv$b788f525-53f4-42ed-b5a1-cb741398a974$fdv$::uuid,
    null::text
  ) -- TXR_2001_LANDLORD_BROKER_WILL_NOT_MANAGE
,  (
    $fdv$148ed8d3-a666-46ad-9cfc-5e4525b989f3$fdv$::uuid,
    null::text,
    true,
    'ORGANIZATION',
    null::uuid,
    $fdv$b788f525-53f4-42ed-b5a1-cb741398a974$fdv$::uuid,
    null::text
  ) -- TXR_2001_MANAGED_BY_LANDLORD
,  (
    $fdv$71cc5bb4-8b16-4e6d-861a-a925a650da91$fdv$::uuid,
    null::text,
    true,
    'PRIVATE',
    $fdv$e26c8f57-c0aa-4474-b43e-6e15f0260e99$fdv$::uuid,
    null::uuid,
    $fdn$HUMAN_REVIEW_REQUIRED: could be structural or private preference$fdn$
  ) -- CONTRACT_PROPERTY_AS_IS
) as v (
  field_id,
  default_value,
  default_checked,
  scope,
  owner_user_id,
  organization_id,
  notes
)
where not exists (
  select 1
  from public.field_defaults fd
  where fd.status = 'ACTIVE'
    and fd.scope = v.scope
    and fd.field_id = v.field_id
    and coalesce(fd.form_id, 0) = 0
    and coalesce(fd.form_field_mapping_id, '00000000-0000-0000-0000-000000000000'::uuid)
      = '00000000-0000-0000-0000-000000000000'::uuid
    and (
      (v.scope = 'PRIVATE' and fd.owner_user_id = v.owner_user_id)
      or (v.scope = 'ORGANIZATION' and fd.organization_id = v.organization_id)
    )
);

-- Clear preference / clutter defaults from Global fields.
-- Kept on Global: STRUCTURAL NA placeholders, structural money 0,
-- and UNKNOWN money zeros (BUYER_REP_RETAINER_AMOUNT,
-- CONTRACT_SERVICE_CONTRACT_REIMBURSEMENT_AMOUNT).
update public.fields
set
  default_value = null,
  default_checked = null,
  update_date = now()
where id in (
  $fdv$a528c4e3-d980-42f8-9b90-789d746f6145$fdv$::uuid,
  $fdv$947bb7a8-4cbe-46c0-bc0f-fc6e8a31366e$fdv$::uuid,
  $fdv$36daae3b-ffb0-4be0-ab63-ec17c2f5d006$fdv$::uuid,
  $fdv$7ca1c044-59f3-4fbe-9ff6-d2509cd61313$fdv$::uuid,
  $fdv$31b47d47-9fa6-454e-874e-a1a36ef2c1c0$fdv$::uuid,
  $fdv$09a715cb-7a37-4692-bba8-f8d2316074f0$fdv$::uuid,
  $fdv$5ed7cc9f-622f-4c91-b5b7-5b8aa0e0585c$fdv$::uuid,
  $fdv$dba66736-1ec2-41e0-8be2-5566cd7e6507$fdv$::uuid,
  $fdv$d7cd8260-f5af-42b8-89cf-2d0da3399648$fdv$::uuid,
  $fdv$36a310d2-d5b4-43ea-be8c-19e25d5ae1bd$fdv$::uuid,
  $fdv$c212f8d3-fe1f-49cb-b50d-7ca25d285c54$fdv$::uuid,
  $fdv$6b65f1b8-8760-4b12-91e1-29f5fc4ea468$fdv$::uuid,
  $fdv$b1fe245b-392a-4602-972e-00a3e1c375de$fdv$::uuid,
  $fdv$4c8b9d81-896a-4516-8236-28266ff077a8$fdv$::uuid,
  $fdv$4cb5280f-65e4-4419-8c02-aab5f283ce2a$fdv$::uuid,
  $fdv$3311c96c-eb8f-42c7-989a-9de1bb97c6ad$fdv$::uuid,
  $fdv$9db19ac1-eabb-4826-9757-6c9efa83b45f$fdv$::uuid,
  $fdv$966f8d2d-932a-4d8a-9a94-370550690cda$fdv$::uuid,
  $fdv$860c8696-5631-4e3e-a690-2a823795c173$fdv$::uuid,
  $fdv$888cd309-28f6-46b0-bbc3-80e9330f7b85$fdv$::uuid,
  $fdv$d5944d77-d968-489a-be3f-88f8b88016ec$fdv$::uuid,
  $fdv$d5763dc1-8999-4644-a23a-6c8fd4e69731$fdv$::uuid,
  $fdv$c87c03a5-bf42-4449-af96-95763bdc7a2f$fdv$::uuid,
  $fdv$02c5a1ff-2a57-4aa5-bd5e-540fd1a0dab4$fdv$::uuid,
  $fdv$c7eabed4-ac1a-4d99-8448-03b60693bd17$fdv$::uuid,
  $fdv$d96b71d9-35ef-4a5a-a2cf-22819ef889b9$fdv$::uuid,
  $fdv$ac99f38c-27f8-4858-aa3e-c68f1a94ae55$fdv$::uuid,
  $fdv$e8be8ea5-0f47-4d7a-baa6-0bf0fdf8e69d$fdv$::uuid,
  $fdv$c4e82ea4-c14b-404e-83e2-55ca575c7535$fdv$::uuid,
  $fdv$c453bfe1-9afa-4a3a-ba26-42819066dd61$fdv$::uuid,
  $fdv$bc48623b-d1e0-46bd-9e44-7d3d796dcb91$fdv$::uuid,
  $fdv$54b2daba-1958-42f2-a95d-dfae9fd24728$fdv$::uuid,
  $fdv$9c2f4fc1-195f-40d6-8826-2d94bc9608c3$fdv$::uuid,
  $fdv$8aa470f2-7d6e-4ef5-a537-4457e2d5bf61$fdv$::uuid,
  $fdv$626ce306-4ef5-427d-b0df-f79d97ade2c8$fdv$::uuid,
  $fdv$448d1e05-8510-48f1-a405-b2eac1863925$fdv$::uuid,
  $fdv$621751ca-9f68-4547-acbd-b82cbc64ab89$fdv$::uuid,
  $fdv$f1e33c27-70d9-48bc-acc0-986f61ae262b$fdv$::uuid,
  $fdv$4cf3ac91-28b8-4558-a725-46c9288d8284$fdv$::uuid,
  $fdv$e4ca3ca2-4d5f-4e1a-838d-744899221685$fdv$::uuid,
  $fdv$62af561c-0adc-466d-bda6-830d95f4c4f1$fdv$::uuid,
  $fdv$7f820e7f-11a0-4fb6-a177-fbd7c9a797fa$fdv$::uuid,
  $fdv$1c46fcb4-dfd4-45a1-a6ad-644422b99664$fdv$::uuid,
  $fdv$ff54fb53-ea6f-43f7-abab-495296fb57ae$fdv$::uuid,
  $fdv$bf743a7f-eb33-4570-af58-bcf9137b3af0$fdv$::uuid,
  $fdv$e9ae5e97-4e78-4623-93f7-0902376f8c7d$fdv$::uuid,
  $fdv$7228e019-c849-43f9-baef-8ae0e4da6e73$fdv$::uuid,
  $fdv$aadc7808-7fb3-4c67-be1f-fd7c37df1522$fdv$::uuid,
  $fdv$e9a0aa75-2b32-4a27-89b9-7664d3698e92$fdv$::uuid,
  $fdv$5c0204ff-5609-4ac6-88be-d0de2a8f5c59$fdv$::uuid,
  $fdv$18dab366-85ef-4c6b-8fe6-411eb5f09869$fdv$::uuid,
  $fdv$03337afc-c3b0-4228-9227-978920a8816d$fdv$::uuid,
  $fdv$9c8ac69d-34b1-4ff8-8c57-0c7f59878d4c$fdv$::uuid,
  $fdv$509e6201-ce4e-446a-a055-af43001fc151$fdv$::uuid,
  $fdv$1c7ef2a8-0842-4a84-80ac-4e69a8ec2437$fdv$::uuid,
  $fdv$72cdf8b6-cbe1-43d1-8c6e-c427bff8741d$fdv$::uuid,
  $fdv$2f3851c6-8cdc-40cc-95de-8c49f06bbe78$fdv$::uuid,
  $fdv$148ed8d3-a666-46ad-9cfc-5e4525b989f3$fdv$::uuid,
  $fdv$71cc5bb4-8b16-4e6d-861a-a925a650da91$fdv$::uuid,
  $fdv$b0548c8b-c4f7-44f9-8328-9c14899e09e7$fdv$::uuid,
  $fdv$5f480d14-2e06-402e-b4df-18a6c8497fec$fdv$::uuid,
  $fdv$a1404448-982a-459c-b271-600a440ca685$fdv$::uuid,
  $fdv$742fe165-51d1-47d0-93cb-628bfd0a2b88$fdv$::uuid,
  $fdv$b5934b51-ed28-46b9-afe5-4f946c7918bf$fdv$::uuid,
  $fdv$9420f5d9-cd4a-4580-b575-de3913e39738$fdv$::uuid,
  $fdv$c0bed14f-f60a-4a02-82b1-3f1f4a0471f4$fdv$::uuid,
  $fdv$5254ad06-34c6-4649-8128-5aa99bf7f8c3$fdv$::uuid,
  $fdv$ce0590d1-17ea-43dc-9520-32e12b008147$fdv$::uuid,
  $fdv$948dfe50-b56e-428e-bad9-eeeb63b23a31$fdv$::uuid,
  $fdv$793b8d36-94fe-4673-b5de-a854769256bb$fdv$::uuid,
  $fdv$b588ec62-0c76-4695-89b3-baa297de7d42$fdv$::uuid,
  $fdv$07b66176-594e-42a8-a926-9fff41a04765$fdv$::uuid,
  $fdv$6b8ce90a-3286-4d14-a9e2-fe315a50fcbf$fdv$::uuid,
  $fdv$ad8a3bfc-49ed-441d-b211-949a854ae1a6$fdv$::uuid,
  $fdv$52263155-4c81-4feb-89d6-e37008165734$fdv$::uuid
)
  and (
    default_value is not null
    or default_checked is not null
  );

commit;
