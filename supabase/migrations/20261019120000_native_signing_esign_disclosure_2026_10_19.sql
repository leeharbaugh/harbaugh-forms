-- Native Signing electronic records and signatures disclosure, version
-- esign-disclosure-2026-10-19.
--
-- Data only, forward-only, development first (approved by Lee 2026-10-19).
-- Publishes the participant-facing disclosure that replaces the development
-- placeholder and supersedes it. Published with is_production_ready = false:
-- it awaits counsel review, and production keeps failing closed on a
-- non-ready disclosure until an approved step marks reviewed text ready.
--
-- Accepted versions are never rewritten. Participants who accepted the
-- placeholder keep that acceptance; this version applies to participants who
-- have not yet consented. The fingerprint is computed here from the stored
-- text rather than transcribed.

begin;

do $$
declare
  v_body constant text := $disclosure$Harbaugh Forms is the electronic signing service the sender of this Signing is using. Before you sign, please review how electronic records and signatures work here.

Your choice
You can choose to receive the documents for this Signing electronically and to sign them with electronic signatures. You are not required to. If you prefer paper documents or another way to sign, do not continue. Choose "Leave for now" and contact the sender to arrange another method. Harbaugh Forms does not provide a paper signing process.

What your consent covers
Your consent applies only to this Signing: its documents, your electronic signatures and initials on them, and the completed copies and notices about it. It does not apply to any other Signing or transaction.

Stopping before you finish
- "Leave for now" ends this browser session only. It does not withdraw your consent or decline the Signing, and you can return with your link.
- "Decline to sign" withdraws you from electronic signing for this Signing. It ends the Signing for everyone, notifies the sender, and cannot be undone.
Harbaugh Forms charges no fee for leaving or declining. Once you finish, your electronic signatures stay on the completed documents. If you later want paper copies instead, contact the sender.

Paper copies
After the Signing is complete, a download link for the completed documents is sent to the email address on this Signing, if there is one. You can download, save and print them. Harbaugh Forms charges no fee for this. To ask for a paper copy, or for your copy if you have no email address on this Signing, contact the sender. Harbaugh Forms does not mail paper copies.

Your contact information
Your name and email address are set by the sender and cannot be changed here. If either is wrong, stop and contact the sender before signing. The sender will need to send a new Signing with the correct information.

What you need
- A device with an internet connection.
- A current web browser with JavaScript and cookies enabled.
- The ability to view PDF documents in your browser.
- Access to the email address on this Signing, if there is one, to receive your link and completed copies.
- Storage space to save PDF files, or a printer, if you want to keep a copy.

Keeping your records
Download and save your completed copies when you receive them. The download link works until the sender replaces or revokes it, so don't rely on it as your only copy.$disclosure$;
begin
  if exists (
    select 1
    from public.signing_consent_disclosure_versions
    where version_key = 'esign-disclosure-2026-10-19'
  ) then
    return;
  end if;

  update public.signing_consent_disclosure_versions
  set superseded_at = now()
  where superseded_at is null;

  insert into public.signing_consent_disclosure_versions (
    version_key,
    title,
    body_text,
    content_sha256,
    is_production_ready
  )
  values (
    'esign-disclosure-2026-10-19',
    'Electronic records and signatures',
    v_body,
    encode(sha256(convert_to(v_body, 'UTF8')), 'hex'),
    false
  );
end $$;

do $$
declare
  current_count integer;
  mismatched integer;
begin
  select count(*) into current_count
  from public.signing_consent_disclosure_versions
  where superseded_at is null;
  if current_count <> 1 then
    raise exception 'expected exactly one current disclosure version, found %', current_count
      using errcode = 'data_exception';
  end if;

  select count(*) into mismatched
  from public.signing_consent_disclosure_versions
  where content_sha256 <> encode(sha256(convert_to(body_text, 'UTF8')), 'hex');
  if mismatched > 0 then
    raise exception '% disclosure version(s) do not match their fingerprint', mismatched
      using errcode = 'data_exception';
  end if;
end $$;

commit;
