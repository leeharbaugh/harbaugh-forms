-- Corrective: clear inappropriate Global catalog money-zero defaults.
-- The prior migration 20260715180000 intentionally left UNKNOWN money zeros on
-- Global fields.default_value. Final classification: these are preference-like
-- values, not structural constants, and must not remain Global.
--
-- Also finalize CONTRACT_PROPERTY_AS_IS as Lee's PRIVATE preference (notes only;
-- the ACTIVE PRIVATE field_defaults row is preserved).
--
-- Forward-only. Soft-clear of catalog default values (no hard deletes).
-- Does not create GLOBAL field_defaults rows. Does not convert zeros to
-- ORGANIZATION defaults.

begin;

-- ---------------------------------------------------------------------------
-- 1. Finalize Lee PRIVATE classification notes for CONTRACT_PROPERTY_AS_IS
-- field_id: 71cc5bb4-8b16-4e6d-861a-a925a650da91
-- Lee:      e26c8f57-c0aa-4474-b43e-6e15f0260e99
-- ---------------------------------------------------------------------------
update public.field_defaults
set
  notes = 'Classified 2026-07-17: Lee PRIVATE preference (Property Accepted As Is).',
  update_date = now(),
  updated_by_user_id = 'e26c8f57-c0aa-4474-b43e-6e15f0260e99'::uuid
where status = 'ACTIVE'
  and scope = 'PRIVATE'
  and owner_user_id = 'e26c8f57-c0aa-4474-b43e-6e15f0260e99'::uuid
  and field_id = '71cc5bb4-8b16-4e6d-861a-a925a650da91'::uuid
  and form_id is null
  and form_field_mapping_id is null
  and default_checked is true
  and coalesce(notes, '') like '%HUMAN_REVIEW_REQUIRED%';

-- ---------------------------------------------------------------------------
-- 2. Clear Global structural zeros that must not participate in resolution.
-- BUYER_REP_RETAINER_AMOUNT: e39569b9-d5e3-4e8d-a391-09bdf02d2aad
-- CONTRACT_SERVICE_CONTRACT_REIMBURSEMENT_AMOUNT: b4cfd37f-98ec-4b44-95e5-a47ffce8dc9d
-- Narrow: ACTIVE GLOBAL fields with field_key + default_value = '0' only.
-- Preserves CREATE_DATE; sets UPDATE_DATE. Does not touch other money zeros
-- (e.g. CONTRACT_SELLER_EXPENSE_CONTRIBUTION_AMOUNT) or any field_defaults.
-- ---------------------------------------------------------------------------
update public.fields
set
  default_value = null,
  update_date = now()
where status = 'ACTIVE'
  and scope = 'GLOBAL'
  and default_value = '0'
  and id in (
    'e39569b9-d5e3-4e8d-a391-09bdf02d2aad'::uuid, -- BUYER_REP_RETAINER_AMOUNT
    'b4cfd37f-98ec-4b44-95e5-a47ffce8dc9d'::uuid  -- CONTRACT_SERVICE_CONTRACT_REIMBURSEMENT_AMOUNT
  )
  and field_key in (
    'BUYER_REP_RETAINER_AMOUNT',
    'CONTRACT_SERVICE_CONTRACT_REIMBURSEMENT_AMOUNT'
  );

commit;
