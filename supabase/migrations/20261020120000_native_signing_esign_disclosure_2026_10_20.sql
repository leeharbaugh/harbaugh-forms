-- Native Signing electronic records and signatures disclosure, version
-- esign-disclosure-2026-10-20.
--
-- Data only, forward-only, development first (Lee-approved product wording,
-- 2026-10-20; not counsel-approved). Publishes the reviewed revision of the
-- participant-facing disclosure and supersedes esign-disclosure-2026-10-19-revised.
-- Published with is_production_ready = false: production keeps failing closed
-- on a non-ready disclosure until counsel-approved copy is published as its
-- own production-ready version.
--
-- Accepted versions are never rewritten. Participants who accepted an earlier
-- version keep that acceptance; this version applies to participants who have
-- not yet consented. The fingerprint is computed here from the stored text and
-- must equal the fingerprint of the reviewed wording, or the migration aborts.
--
-- Carriage returns are stripped so the stored text, and so its fingerprint,
-- do not depend on the checkout's line endings.

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
Harbaugh Forms charges no fee for leaving or declining. Finishing your part does not mean the entire Signing is complete. Your accepted signing actions remain recorded. If the Signing is completed, your electronic signatures will appear on the completed documents. If you later want paper copies, contact the sender.
If you want to withdraw consent to receive future electronic records or notices after finishing your part, contact the sender. Harbaugh Forms does not offer a separate withdrawal control after you finish. Contacting the sender does not erase signing actions already recorded.

Paper copies
After everyone has finished and the Signing is complete, Harbaugh Forms emails a personal link to the completed documents to each signer who has an email address on this Signing. If you don't receive the email, contact the sender. From that link, you can download, save, and print the completed documents.
If you signed in person without an email address, or need another copy, contact the sender. Harbaugh Forms charges no fee for downloading completed documents. To request a paper copy, contact the sender about how to obtain it and whether the sender charges a fee for preparing or providing it. Harbaugh Forms does not mail paper copies.

Your contact information
Your name and email address are set by the sender and cannot be changed here. If either is wrong, stop and contact the sender before signing. The sender will need to send a new Signing with the correct information. If you discover an error after finishing your part, contact the sender to arrange how you can receive your documents. Finishing does not let you change the contact information recorded for this Signing.

What you need
- A device with an internet connection.
- A current web browser with JavaScript and cookies enabled.
- The ability to view PDF documents in your browser.
- If you're signing remotely, access to the email address where your Signing invitation was sent. If you have an email address on this Signing, your completed-documents link is sent there too.
- Storage space to save PDF files, or access to a printer, if you want to keep a copy.
If you cannot view PDF documents or have no way to save or print copies, choose "Leave for now" and contact the sender before continuing.

Keeping your records
Download and save your completed documents when you receive the link. Your original Signing invitation link cannot be used to access completed documents. The completed-documents link may stop working if the sender replaces or revokes it, or access is otherwise restricted. Keep your own copy for your records.$disclosure$, chr(13), '');
  v_expected_sha256 constant text :=
    'ac7de88cd2e003ed4c12d7887966288f273ea3a97db631e42193810ae99e9d9b';
begin
  if exists (
    select 1
    from public.signing_consent_disclosure_versions
    where version_key = 'esign-disclosure-2026-10-20'
  ) then
    return;
  end if;

  if encode(sha256(convert_to(v_body, 'UTF8')), 'hex') <> v_expected_sha256 then
    raise exception 'disclosure text does not match the reviewed fingerprint %', v_expected_sha256
      using errcode = 'data_exception';
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
    'esign-disclosure-2026-10-20',
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
