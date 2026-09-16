-- Stage 4 review fix: record which wrapping key version produced token_wrapped.
--
-- Wrapping uses a dedicated SIGNING_CREDENTIAL_WRAP_KEY (never the Supabase
-- service key). wrap_key_id names the key version so previous keys can decrypt
-- during rotation while new writes always use the current key. It is also bound
-- into the AES-GCM authenticated associated data, so a row's ciphertext cannot
-- be replayed under a different key version, credential, or Signing.
--
-- Nullable only for legacy development rows written before this column existed;
-- those rows fail closed on unwrap and must be re-issued. The application always
-- sets wrap_key_id on insert.
-- Forward-only. Development only.

begin;

alter table public.signing_participant_credentials
  add column if not exists wrap_key_id text;

alter table public.signing_participant_credentials
  drop constraint if exists spc_wrap_key_id_shape;
alter table public.signing_participant_credentials
  add constraint spc_wrap_key_id_shape
  check (
    wrap_key_id is null
    or wrap_key_id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
  );

-- Pre-review envelopes carry no key version and no AAD, so they can never be
-- unwrapped again. Clear the dead ciphertext instead of keeping it around.
-- token_hash is untouched: authentication and revocation history stay intact.
update public.signing_participant_credentials
   set token_wrapped = null
 where token_wrapped is not null
   and wrap_key_id is null;

-- A wrapped bearer without its key version id is unusable; reject that pairing.
alter table public.signing_participant_credentials
  drop constraint if exists spc_wrapped_requires_key_id;
alter table public.signing_participant_credentials
  add constraint spc_wrapped_requires_key_id
  check (token_wrapped is null or wrap_key_id is not null);

comment on column public.signing_participant_credentials.wrap_key_id is
  'Key version id (from SIGNING_CREDENTIAL_WRAP_KEY_ID) that wrapped token_wrapped. Part of the AES-GCM AAD. Never a verifier; token_hash remains authoritative for authentication.';

commit;
