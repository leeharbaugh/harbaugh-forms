-- Expand buyer_rep_details with retainer, compensation, and optional addendum flags.
-- Does not touch public.forms or public.fields.

alter table public.buyer_rep_details
  add column if not exists retainer_applies_to_fee boolean not null default true,
  add column if not exists construction_compensation text not null default 'NA',
  add column if not exists other_compensation text not null default 'NA',
  add column if not exists add_lead_based_paint boolean not null default false,
  add column if not exists add_mold_remediation boolean not null default false,
  add column if not exists add_flood_hazard boolean not null default false,
  add column if not exists add_property_insurance boolean not null default false,
  add column if not exists add_general_information_notice boolean not null default false,
  add column if not exists add_other_document boolean not null default false,
  add column if not exists add_other_document_description text not null default 'NA';
