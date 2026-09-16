-- Stage 4 follow-up: server-only wrapped bearer for invitation retry.
-- Hash remains the authentication verifier. Wrapped ciphertext is decryptable
-- only with the server wrap key and is never logged or exposed to browsers.
-- Forward-only. Development only.

begin;

alter table public.signing_participant_credentials
  add column if not exists token_wrapped text;

comment on column public.signing_participant_credentials.token_wrapped is
  'AES-GCM wrapped bearer for server-side invitation retry only. Not a verifier; token_hash remains authoritative for authentication. Never expose to browsers or logs.';

commit;
