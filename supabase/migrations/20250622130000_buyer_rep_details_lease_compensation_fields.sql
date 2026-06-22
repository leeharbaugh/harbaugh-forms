-- TXR-1501 lease and purchase flat-fee compensation fields for buyer_rep_details.
-- Does not touch public.forms or public.fields.

alter table public.buyer_rep_details
  add column if not exists lease_one_month_rent_percent numeric(5, 3) not null default 0,
  add column if not exists lease_all_rents_percent numeric(5, 3) not null default 0,
  add column if not exists lease_flat_fee numeric(14, 2) not null default 0,
  add column if not exists purchase_flat_fee numeric(14, 2) not null default 0;
