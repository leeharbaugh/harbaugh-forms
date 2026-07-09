-- Allow multiple active contacts to share the same email or phone number.
-- The original clients/contacts email uniqueness was a partial unique index on
-- lower(email) for ACTIVE rows with a non-null email.

drop index if exists public.contacts_email_active_uidx;

-- Defensive drops for phone uniqueness if it was ever added.
drop index if exists public.contacts_phone_active_uidx;
drop index if exists public.contacts_phone_primary_active_uidx;
drop index if exists public.contacts_phone_secondary_active_uidx;

-- Pre-rename index names (no-op if phase1 vocabulary alignment already ran).
drop index if exists public.clients_email_active_uidx;
drop index if exists public.clients_phone_active_uidx;
