-- Remove user-maintained agreement_number from representation_agreements.
-- Agreements are identified by database id and meaningful business fields.

drop index if exists public.representation_agreements_number_active_uidx;

alter table public.representation_agreements
  drop constraint if exists representation_agreements_agreement_number_not_blank;

alter table public.representation_agreements
  drop column if exists agreement_number;
