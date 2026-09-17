-- Native Signing Stage 5 follow-up: repair consent disclosure fingerprints.
-- Forward-only. Development only. Do not apply to production from this stage.
--
-- `20260917120000_native_signing_ceremony_foundation.sql` inserted the
-- development placeholder disclosure with a hand-written `content_sha256` that
-- does not match the SHA-256 of its own `body_text`. Consent evidence must
-- reference a fingerprint that can later reproduce the exact accepted text, so
-- the ceremony code verifies the recorded digest against the stored body and
-- fails closed on mismatch. Recompute the digest in SQL rather than trusting a
-- transcribed constant.
--
-- Only rows that have never been accepted are repaired: an accepted disclosure
-- version is historical evidence and is superseded, never rewritten.

begin;

update public.signing_consent_disclosure_versions v
set content_sha256 = encode(sha256(convert_to(v.body_text, 'UTF8')), 'hex')
where v.content_sha256 <> encode(sha256(convert_to(v.body_text, 'UTF8')), 'hex')
  and not exists (
    select 1
    from public.signing_participants p
    where p.consent_disclosure_version_id = v.id
  );

do $$
declare
  mismatched integer;
begin
  select count(*)
    into mismatched
  from public.signing_consent_disclosure_versions v
  where v.content_sha256 <> encode(sha256(convert_to(v.body_text, 'UTF8')), 'hex');

  if mismatched > 0 then
    raise exception
      '% consent disclosure version(s) still have a content_sha256 that does not match body_text', mismatched
      using errcode = 'data_exception';
  end if;
end $$;

comment on column public.signing_consent_disclosure_versions.content_sha256 is
  'SHA-256 hex of body_text (UTF-8). Verified on load; publish a new version instead of rewriting accepted text.';

commit;
