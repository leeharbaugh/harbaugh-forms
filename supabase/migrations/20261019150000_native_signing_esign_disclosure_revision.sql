-- Native Signing electronic records and signatures disclosure, version
-- esign-disclosure-2026-10-19-revised.
--
-- Data only, forward-only, development first (approved by Lee 2026-10-19).
-- Publishes the revised disclosure and supersedes esign-disclosure-2026-10-19.
-- Only Paper copies, the email line of What you need, and Keeping your records
-- change; every other section is carried over verbatim. Published with
-- is_production_ready = false: it awaits counsel review, and production keeps
-- failing closed on a non-ready disclosure until an approved step marks
-- reviewed text ready.
--
-- Accepted versions are never rewritten. Participants who accepted an earlier
-- version keep that acceptance; this version applies to participants who have
-- not yet consented. The fingerprint is computed here from the stored text
-- rather than transcribed.
--
-- Carriage returns are stripped so the stored text, and so its fingerprint,
-- do not depend on the checkout's line endings (a CRLF working copy would
-- otherwise store different bytes than an LF one).

begin;

do $$
declare
  v_body constant text := replace($disclosure$Harbaugh Forms is the electronic signing service the sender of this Signing is using. Before you sign, please review how electronic records and signatures work here.

Your choice
You can choose to receive the documents for this Signing electronically and to sign them with electronic signatures. You are not required to. If you prefer paper documents or another way to sign, do not continue. Choose "Leave for now" and contact the sender to arrange another method. Harbaugh Forms does not provide a paper signing process.

What your consent covers
Your consent applies only to this Signing: its documents, your electronic signatures and initials on them, and the completed copies and notices about it. It does not apply to any other Signing or transaction.

Stopping before you finish
- "Leave for now" ends this browser session only. It does not withdraw your consent or decline the Signing, and you can return with your link.
- "Decline to sign" withdraws you from electronic signing for this Signing. It ends the Signing for everyone, notifies the sender, and cannot be undone.
Harbaugh Forms charges no fee for leaving or declining. Once you finish, your electronic signatures stay on the completed documents. If you later want paper copies instead, contact the sender.

Paper copies
After everyone has finished and the Signing is complete, Harbaugh Forms emails a personal link to the completed documents to each signer who has an email address on this Signing. If you don't receive the email, contact the sender. From that link, you can download, save, and print the completed documents.
If you signed in person without an email address, or need another copy, contact the sender. Harbaugh Forms charges no fee for downloading completed documents. To request a paper copy, contact the sender. Harbaugh Forms does not mail paper copies.

Your contact information
Your name and email address are set by the sender and cannot be changed here. If either is wrong, stop and contact the sender before signing. The sender will need to send a new Signing with the correct information.

What you need
- A device with an internet connection.
- A current web browser with JavaScript and cookies enabled.
- The ability to view PDF documents in your browser.
- If you're signing remotely, access to the email address where your Signing invitation was sent. If you have an email address on this Signing, your completed-documents link is sent there too.
- Storage space to save PDF files, or a printer, if you want to keep a copy.

Keeping your records
Download and save your completed documents when you receive the link. Your original Signing invitation link cannot be used to access completed documents. The completed-documents link may stop working if the sender replaces or revokes it, or access is otherwise restricted. Keep your own copy for your records.$disclosure$, chr(13), '');
begin
  if exists (
    select 1
    from public.signing_consent_disclosure_versions
    where version_key = 'esign-disclosure-2026-10-19-revised'
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
    'esign-disclosure-2026-10-19-revised',
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
