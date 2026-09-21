# Harbaugh Forms — Architectural Decisions

## Decision Format

Each decision should include:

- Date
- Decision
- Reason
- Consequences
- Related files or migrations

---

## Transaction Coordinators are delegated operators, not fake agents or signers

**Date:** 2026-09-17

**Decision:**
Harbaugh Forms supports a **Transaction Coordinator (TC)** as an authenticated User who may be **explicitly delegated** authority to create and administer Signings on behalf of a responsible agent and/or broker.

A TC:

* may perform operational Signing administration that the responsible agent/broker has authorized;
* is **not** made into a fake agent or fake co-agent merely to obtain permissions;
* is **not** a signing participant merely because they administer the Signing;
* cannot sign, adopt, or place Signature/Initials for the responsible agent/broker (or any participant) by virtue of TC authority;
* cannot impersonate the agent/broker in ceremony evidence;
* must retain their own identity in audit/events for every action they actually perform.

When a TC acts for Agent A, the Signing preserves both:

* **Responsible agent/broker:** Agent A (participant-facing sender/brokerage context and transaction responsibility);
* **Operational actor:** the TC (who clicked Send, amended, cancelled, requested finalization retry, etc.).

These identities must not be collapsed. Ordinary same-organization membership, Global Admin status, Packet access, or email domain alone never implies TC authority.

This decision is additive to **Signing access belongs to the originating brokerage and full-authority agents** (2026-09-06), which already stated that a trainee or assistant who should not have full Signing authority is not added as a co-agent. TC is the first-class answer to that gap.

**Reason:**
Brokerage workflows depend on coordinators who run paperwork without becoming the transaction's agent of record or a surrogate signer. Shoehorning TCs into `signing_agent_associations` as PRIMARY/CO_AGENT would falsify audit, certificates, and participant-facing sender identity.

**Consequences:**

* TC implementation uses explicit delegation records and Signing-scoped operator associations separate from agent associations (see following decisions).
* Stage 2 `canManage` and event `actor_type` vocabulary include an honest `TRANSACTION_COORDINATOR` path rather than overloading PRIMARY_AGENT.
* Participant ceremony authority remains entirely separate from TC operational authority.

**Related files or migrations:**

* `supabase/migrations/20260917150000_native_signing_tc_operator_authority.sql`
* `lib/signing/authority.ts`, `lib/signing/operator-delegations.ts`, `lib/signing/operations.ts`

---

## Persistent TC delegation plus Signing-scoped operator association

**Date:** 2026-09-17

**Decision:**
TC authority uses a hybrid model:

1. **`signing_operator_delegations`** — persistent many-to-many grants (organization, responsible User, delegate User, role=`TRANSACTION_COORDINATOR`, status, effective/revoked provenance). Supports one TC → many responsible Users and one responsible User → many TCs.
2. **`signing_operator_associations`** — Signing-scoped operator rows (role=`TRANSACTION_COORDINATOR`, display-name snapshot, delegation reference, effective period). Multiple active TCs per Signing are allowed.

`signing_agent_associations` remains PRIMARY/CO_AGENT only. Do not store TC identity as a profile `transaction_coordinator_user_id` field.

**Creator provenance:** `signings.created_by_user_id` records the actual creating User (may be a TC). `original_sender_*` and PRIMARY association remain the responsible agent/broker. Event `SIGNING_CREATED` also attributes the TC actor. Creator and responsible concepts are never overwritten later; DB BEFORE UPDATE trigger restores `created_by_user_id` and `original_sender_*` on any update.

**Reason:** Persistent grants enable brokerage-wide TC assignment; Signing associations preserve historical operator evidence and management scope without falsifying agent relationships.

**Consequences:**

* Manage requires active operator association **and** currently valid delegation (revalidated on writes).
* Revocation ends associations for manage but retains historical rows for read.
* RLS denies browser self-service on both tables; trusted server mutations only.

**Related files or migrations:**

* `supabase/migrations/20260917150000_native_signing_tc_operator_authority.sql`

---

## Agent or ORG_ADMIN may grant TC delegation; TC cannot self-grant

**Date:** 2026-09-17

**Decision:**
An active TC delegation may be granted or revoked by:

* the responsible User themselves; or
* an authorized `ORG_ADMIN` for that organization.

Ordinary MEMBER cannot grant. A TC cannot grant or revoke their own delegation. App/Global Admin status alone does not create a business TC delegation. The responsible User is any eligible organization User (agent or broker/responsible brokerage User) — not a salesperson-only subtype. Do not infer brokerage responsibility from generic org membership alone.

**Reason:** Brokerages need ORG_ADMIN to configure TCs without requiring every agent to click every grant, while preventing privilege self-escalation.

**Consequences:**

* `grantOperatorDelegationWithActor` / `revokeOperatorDelegationWithActor` enforce these gates server-side.
* Cross-organization grants fail closed.

---

## TC capability bundle (v1) and cancellation authority

**Date:** 2026-09-17

**Decision:**
An active TC management association (backed by a valid delegation) grants the operational TC bundle without fine-grained per-capability RBAC in v1: create/manage delegated Signings, Draft document/participant/field prep, Keep Current / Update to Latest, readiness, Send / Begin In-Person, handoff, credential-admin operations already available to managers, permitted pre-freeze amendment lock/acquire, Cancel under the same lifecycle rules as agents, and (once Stage 6 exists) request Retry Finalization and read completed artifacts via trusted server mediation.

TC may Cancel; wording/attribution preserves “Cancelled by [TC], Transaction Coordinator, on behalf of [responsible agent/broker]”. TC cannot Decline for a participant.

**Historical read after revoke:** When delegation or active operator authority ends, all future management writes fail immediately. The TC retains historical read of Signings on which they had a genuine operator association. Historical read never restores manage. Modeled similarly in principle to ended agent associations, with roles kept semantically separate.

**Participant-facing sender:** Remains responsible agent/broker + brokerage (e.g. `Lee Harbaugh — Davey Goosmann Realty`). TC is not default invitation/Reply-To identity in v1.

**Actor attribution:** Meaningful events distinguish PRIMARY_AGENT, CO_AGENT, TRANSACTION_COORDINATOR, BROKERAGE_ADMINISTRATOR (ORG_ADMIN), PARTICIPANT, SYSTEM_ADMINISTRATOR, SYSTEM. Precedence when multiple paths apply: active agent association → active TC operator association → ORG_ADMIN.

**ORG_ADMIN vs TC vs App ADMIN:** ORG_ADMIN is organization administrative authority; TC is explicit delegated operational authority; App/Global Admin does not become business manager, TC, or responsible sender.

**Reason:** Coordinators need a coherent operational bundle without ceremony signing power or sender identity confusion.

**Consequences:**

* Ceremony prohibitions are absolute (affirm, consent, adopt, place, Finish, satisfy agent fields, representative shortcut).
* Revocation is authoritative on the next server action; open browser pages are not authority.

---

## A completed Signing has exactly one immutable audit certificate

**Date:** 2026-09-17

**Decision:**
A successfully completed Signing has **exactly one** canonical immutable Signing-wide audit certificate. There are no certificate “versions” caused by resend, download, copy-recipient addition, credential replacement, or later delivery activity.

If the transaction later requires changed documents after successful completion, that work requires a **new Signing**, not a new certificate for the completed Signing. Package revisions remain a **pre-completion / pre-freeze** amendment concept and are not created after successful completion merely to update a certificate.

Later delivery and operational history remain append-only Signing/system history (and delivery records) without mutating or replacing the completion certificate. This clarifies **Completed Signings preserve separate documents and provide one Signing-wide audit certificate** (2026-09-06) where that earlier text mentioned later delivery activity alongside an immutable certificate.

**Reason:**
Completion evidence must remain stable. Treating resends or copy-recipient adds as certificate revisions would undermine immutability and confuse recipients about which certificate is authoritative.

**Consequences:**

* Finalization produces one AUDIT_CERTIFICATE artifact bound to the frozen package revision.
* Delivery stages must not regenerate or version that certificate.
* Material post-completion document change ⇒ new Signing.
* No implementation is authorized by this decision alone.

**Related files or migrations:**

* This file: **Completed Signings preserve separate documents…** (2026-09-06); **Finish Signing and finalization…** (2026-09-08)

---

## Combined convenience PDF is supported and non-blocking for Complete

**Date:** 2026-09-17

**Decision:**
Harbaugh Forms will support a **combined convenience PDF** of the completed package in addition to the authoritative individual completed signed PDFs and the Signing-wide audit certificate.

* Individual completed PDFs remain separately downloadable and authoritative.
* The Signing-wide audit certificate remains authoritative.
* The combined PDF does not replace individual files.
* It may be generated only from already-verified completed document artifacts (and must not invent content).
* Combined-artifact generation failure must **not** block Signing lifecycle `COMPLETE`.
* When generated, the combined PDF is its own immutable `signing_artifacts` row (`COMBINED_PACKAGE`) with its own opaque Storage object and SHA-256 fingerprint.
* Prefer an **optional post-required-artifacts work item** after required completed PDFs + certificate verify; `COMPLETE` must not wait on combined PDF generation.

Exact Stage timing must preserve the non-blocking rule. Combined PDF is not implemented in the TC authority foundation.

**Reason:**
Agents often want one downloadable packet, but completion evidence cannot depend on a convenience merge succeeding.

**Consequences:**

* Schema already anticipates `COMBINED_PACKAGE`; generation is still unimplemented.
* Finalization eligibility for Complete must not require a verified combined artifact.
* No combined-PDF implementation is authorized by the TC foundation work.

**Related files or migrations:**

* This file: **Completed Signings preserve separate documents…** (2026-09-06); Stage 1 `signing_artifacts.artifact_category`

---

## Draft Signing creation establishes mutable preparation state; package revisions freeze at activation

**Date:** 2026-09-15

**Decision:**
Creating a Signing creates the Signing's **mutable Draft preparation state**. It does **not** establish the immutable package-revision / prepared-PDF evidence boundary.

During Draft preparation:

* Preparation is private to authorized agents of the originating brokerage under the approved Signing authority rules.
* Draft configuration may continue changing (documents, participants, fields, and related preparation state as later stages allow).
* Ordinary Draft preparation does **not** continually create immutable prepared PDFs.
* Ordinary Draft preparation does **not** create Package Revision 1 or any other `signing_package_revision`.
* Adding a document to a Draft Signing selects a **Signing-owned Draft source snapshot** for that logical document; it does **not** create a `signing_document_version`, an immutable prepared PDF, or a package revision. See **Draft document selections use Signing-owned source snapshots until activation** (2026-09-15).

The first package revision is created only when the Signing is **activated** through:

* **Send for Signature**, or
* **Begin In-Person Signing**.

At activation, the **currently selected Draft configuration**—including each document's selected Draft source snapshot—is atomically frozen/promoted as **Package Revision 1** under the existing promoted-package-revision rules. Later permitted pre-signature amendments create later monotonically numbered package revisions. The first accepted signature or initial permanently pins/freezes the applicable revision according to the existing amendment/freeze decisions.

`packet_forms.document_state` remains separate from Signing lifecycle. Creating, activating, or completing a Signing does not require `FINAL` and must not use `SIGNED` to represent Native Signing progress.

This decision supersedes the earlier 2026-09-05 rule that treated **Create Signing** itself as the immutable snapshot boundary. It does not reopen the durable rule that working-document Final is optional and that Signing progress does not belong on `packet_forms.document_state`.

**Reason:**
Agents need a private Draft workspace before participants ever see a package. Treating Create Signing as an immediate immutable PDF/package boundary forced evidence too early, conflicted with the later package-revision model, and made ordinary Draft edits look like continual evidence creation. Activation is the correct first evidence freeze because that is when the package becomes actionable for participants.

**Consequences:**

* Stage 2 Draft create/read/title-update remains consistent with this boundary: it may create a Signing root and associations without package revisions or prepared PDFs.
* Stage 3 and later preparation work must not promote Package Revision 1 merely because Draft state changed.
* Revision 1 becomes authoritative only as part of activation (Send or Begin In-Person Signing), not as a side effect of Draft editing.
* Pre-signature amendments after activation continue to use exclusive locks and complete atomic package revisions.
* Draft source-snapshot representation, Keep Current / Update to Latest mechanics, common activation transaction shape, and UI copy remain Stage 4+ technical design where not already implemented.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this documentation reconciliation alone.

**Related files or migrations:**

* `project_status.md` (Stage 3/4 planning)
* This file: **Draft document selections use Signing-owned source snapshots until activation** (2026-09-15); **Send and Begin In-Person Signing share one activation model** (2026-09-15); **Promoted package revisions are complete, immutable, and atomically actionable** (2026-09-14); **Working Signing data model…** (2026-09-10); **Creating a Signing snapshots the working document without requiring Final** (2026-09-05, superseded for snapshot timing); **Signing lifecycle distinguishes setup…** (2026-09-05)
* No SQL migration; no schema change

---

## Draft document selections use Signing-owned source snapshots until activation

**Date:** 2026-09-15

**Decision:**
Harbaugh Forms uses a **hybrid Draft-source-snapshot model** for documents included in a Draft Signing.

### Three distinct concepts

1. **Draft source snapshot** — Signing-owned preparation state capturing the persisted working-document source the agent selected when (or after) adding a logical Signing Document. It must preserve enough reproducible source data and provenance to render that selected state later even if the live `packet_form` changes. Merely storing an `update_date`, revision counter, or hash/fingerprint **without** reproducible source state is insufficient.
2. **Immutable prepared document version** (`signing_document_versions`) — the exact SHA-256-fingerprinted prepared PDF evidence created or reused at package promotion.
3. **Package Revision** (`signing_package_revisions` and revision-scoped children) — the complete promoted package composition participants may act upon. Package Revision 1 is created only at activation.

These are not interchangeable. A Draft source snapshot is **not** a `signing_document_version`, not an immutable prepared Signing PDF, not a Package Revision, not Revision 1, and not participant-actionable evidence.

### Adding a document to Draft

When an agent adds an eligible working `packet_form` to a Draft Signing:

* Harbaugh Forms records the logical `signing_document`; and
* Harbaugh Forms captures a Signing-owned Draft source snapshot of the persisted source state selected at that moment.

Ordinary Draft add/edit/reorder/remove of documents, participants, or Draft signer fields still creates neither a permanent immutable prepared PDF nor any `signing_package_revision`. Permanent immutable prepared document versions are created or safely reused only when package promotion occurs.

### Live source changes never silently rewrite the Draft selection

If the working `packet_form` later changes—seconds later, minutes later, in another session, or before the agent returns to the Signing dashboard:

* the selected Draft source snapshot does **not** automatically change;
* the Signing continues to refer to the source state previously selected by the agent;
* Harbaugh Forms detects that the live source differs from the Draft-selected source state;
* the Signing dashboard / readiness preflight surfaces a **Source Changed** (or equivalent) condition;
* the system must not silently replace the selected Draft state with the current working source.

### Explicit agent choice: Keep Current or Update to Latest

A detected source change requires an explicit agent decision before activation. Exact UI wording is not settled here. The durable choices are:

* **Keep Current Signing Version / keep current Draft source state** — the Draft continues using its previously captured Draft source snapshot; later activation renders that selected state; the newer live `packet_form` is not substituted.
* **Update to Latest** — a deliberate Draft preparation action that replaces/advances the Draft source snapshot to the then-current persisted source state. It still does **not** create a permanent immutable prepared PDF, package revision, or Revision 1.

Activation must not infer either choice.

### Activation uses the selected Draft source snapshot

When the agent confirms **Send** or **Begin In-Person Signing**, the common activation algorithm uses each document's **currently selected Draft source snapshot**, not whatever happens to be in the mutable live `packet_form` at that instant. Activation then renders that selected state into exact prepared PDF bytes, creates or reuses the appropriate immutable `signing_document_version`, fingerprints exact stored bytes, and freezes Package Revision 1 under the existing promotion rules.

### After promotion, immutability is absolute

Once a `signing_document_version` is included in a promoted package revision:

* later edits to the source `packet_form` never modify it;
* later Draft-source changes never modify it;
* later package revisions never rewrite it;
* historical package revisions continue pointing to the exact versions they originally contained.

If an eligible pre-signature amendment deliberately adopts newer source content, the system selects a new Draft source state and subsequent promotion creates a new immutable version when prepared bytes differ; earlier versions and revisions remain preserved. This is never an automatic update of an old Revision.

**Reason:**
Agents need Draft selections to remain stable and intentional while still deferring evidentiary PDF freeze until activation. Silently following the live working document would make the Signing package ambiguous and could surprise the agent at Send time. Creating permanent PDF evidence at document-add time would reintroduce the superseded “Create Signing = immutable snapshot” timing and inflate immutable storage during private preparation.

**Consequences:**

* Stage 3's Draft/evidence table separation remains intact: `signing_documents` / `signing_participants` / `signing_draft_fields` are preparation; `signing_document_versions` and package-revision tables are promoted evidence.
* Ready/preflight must treat unresolved source-change conditions as activation blockers until the agent explicitly keeps or updates the Draft source snapshot.
* Exact Draft source-snapshot storage/representation remains technical design. Current Stage 3 code stores a live `source_packet_form_id` and renders from the current `packet_form` at internal promotion time; that is **not** yet a sufficient reproducible Draft source snapshot. Stage 4 must implement the approved hybrid model before exposing activation.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this documentation decision.

**Related files or migrations:**

* `project_status.md` (Stage 3 gap + Stage 4 prerequisite)
* This file: **Draft Signing creation establishes mutable preparation state…** (2026-09-15); **Send and Begin In-Person Signing share one activation model** (2026-09-15); **Package revisions may reuse unchanged Signing document versions** (2026-09-15); **Creating a Signing snapshots the working document without requiring Final** (2026-09-05, superseded for snapshot timing)
* No SQL migration; no schema change

---

## Send and Begin In-Person Signing share one activation model

**Date:** 2026-09-15

**Decision:**
The agent dashboard presents two activation choices for a Draft Signing:

* **Send** (remote invitation path after activation); and
* **Begin In-Person Signing** (supervised in-person ceremony/handoff path after activation).

Both choices:

1. perform/display readiness validation / preflight;
2. require explicit agent confirmation;
3. invoke the **same common activation algorithm**;
4. produce the same canonical immutable package state (Package Revision 1 and required participant-access state);
5. move the Signing from **Draft → In Progress** only after that durable activation state exists.

They diverge **only after** common activation succeeds:

* Send proceeds to remote invitation/delivery behavior;
* Begin In-Person Signing proceeds to the supervised in-person ceremony/handoff behavior.

There are not two different definitions of what constitutes an activated package.

### Activation success boundary

A Signing becomes **In Progress** only after the common activation operation has durably established:

* the canonical promoted Package Revision 1 (including exact prepared document versions, participant snapshots, and frozen signer fields); and
* the required participant access state/credentials for that activated Signing.

Participant identity/contact information is prepared while the Signing is still Draft. Bearer access secrets/tokens do not need to exist merely because a Signing is Draft; they become usable as part of successful activation.

### Email delivery is outside the activation-success boundary

Remote email delivery is a separate retryable operational concern. Therefore:

* email failure does **not** return the Signing to Draft;
* email failure does **not** undo Revision 1;
* email retry does **not** create Revision 2;
* delivery status may be retried/monitored without mutating canonical activation evidence.

**Reason:**
Send and in-person launch are different participant experiences over one evidentiary package. Binding In Progress to durable package + access state prevents a Signing from appearing activated when participants cannot yet act, while keeping email out of the success boundary avoids turning a delivery outage into an evidence rollback.

**Consequences:**

* Stage 4 must implement one shared activation primitive used by both dashboard actions.
* Delivery/retry systems must not rewrite package revisions or document versions.
* Exact credential issuance, email provider wiring, and in-person handoff UI remain Stage 4+ technical design.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this documentation decision.

**Related files or migrations:**

* `project_status.md` (Stage 4 planning)
* This file: **Draft Signing creation establishes mutable preparation state…** (2026-09-15); **Draft document selections use Signing-owned source snapshots until activation** (2026-09-15); **Promoted package revisions are complete, immutable, and atomically actionable** (2026-09-14); **Signing lifecycle distinguishes setup…** (2026-09-05)
* No SQL migration; no schema change

---

## Draft source snapshots store exact render inputs; credentials hash with optional server wrap

**Date:** 2026-09-15

**Decision:**
Stage 4 persists each Draft document selection as a row in **`signing_draft_source_snapshots`**: exact source PDF bytes in the private `signing-artifacts` bucket, JSON render inputs (`field_views_json`, `annotations_json`) sufficient for `fillPacketFormPdfBytes`, and a content fingerprint over those inputs. Logical documents point at the selected snapshot via `selected_draft_source_snapshot_id`. Snapshots are immutable preparation rows; Update to Latest inserts a new snapshot rather than rewriting the prior one.

Participant invitation credentials store a SHA-256 **`token_hash`** for authentication. A server-only AES-GCM **`token_wrapped`** value may exist solely so invitation delivery can retry the **same** link without logging or browser exposure of the raw bearer. Raw tokens never appear in events, work-item `reference_json`, or ordinary logs. Credentials remain unusable until the Signing is **In Progress**.

**Reason:**
Fingerprints alone cannot reproduce a PDF after the live form changes. Storing prepared Signing PDF evidence at document-add time would violate the Draft/evidence boundary. Invitation retry must reuse the same credential/link unless revoked, which requires a server-recoverable form that is not plaintext and is not the auth verifier.

**Consequences:**

* ~~Prefer `SIGNING_CREDENTIAL_WRAP_KEY`; fall back to hashing `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY` only when unset.~~ **Superseded 2026-09-15** by **Credential wrapping requires a dedicated versioned key bound to its credential row**: the wrap key is mandatory and purpose-separated, and there is no Supabase-key fallback.
* Promotion and activation must render from the selected Draft snapshot, never live packet-form content.
* No schema/application change is authorized for production by this decision alone.

**Related files or migrations:**

* `supabase/migrations/20260915160000_native_signing_stage4_draft_snapshots_activation.sql`
* `supabase/migrations/20260915161000_native_signing_stage4_credential_wrap.sql`
* `lib/signing/draft-source-snapshots.ts`, `credentials.ts`, `activation.ts`, `delivery.ts`

---

## Immutable Draft snapshot bytes are preparation history, not evidence

**Date:** 2026-09-15

**Decision:**
A Draft source snapshot's bytes are immutable once captured, and that immutability says nothing about evidentiary status. Two distinct kinds of immutable bytes live in the private `signing-artifacts` bucket and are kept in separate object-key namespaces:

* **Preparation history** — `signings/{signingId}/documents/{documentId}/draft-snapshots/{snapshotId}/source.pdf`. A `signing_draft_source_snapshots` row: how the agent set the package up. Never signer evidence.
* **Evidence** — `signings/{signingId}/documents/{documentId}/versions/{versionId}.pdf`. A `signing_document_versions` row: what a package revision freezes and what participants sign against.

`isDraftSourceObjectKey()` / `isPreparedVersionObjectKey()` in `lib/signing/stage1-schema.ts` are the canonical predicates for that distinction, so retention, cleanup, and audit code never has to infer intent from a path by eye.

**Retention:** superseded Draft snapshots (every snapshot a document no longer selects, e.g. after Update to Latest) are **retained as preparation history for audit and debugging** of how a package was prepared. They are not evidentiary, they are not referenced by any package revision, and a later explicit retention policy may prune them. Until that policy exists, they are kept.

**Soft-orphan Storage cleanup:** removing a Draft document that has **no** evidence yet (no `signing_document_versions`, no `signing_package_revision_documents`) discards its preparation state completely: the `selected_draft_source_snapshot_id` pointer is cleared first (RESTRICT FK), then its snapshot rows are deleted, then their Storage objects are removed. Removing a document that **does** have evidence soft-excludes it (`included_in_draft = false`) and deletes nothing.

**Reason:**
"Immutable" was doing two jobs at once and invited treating any stable PDF in the bucket as evidence. Separate namespaces plus explicit predicates make the boundary checkable in code and in review, and make it safe to prune preparation history later without risking evidence.

**Consequences:**

* Snapshot bytes may be pruned by a future retention policy; prepared version bytes may not.
* Storage cleanup on document removal is bounded by the evidence check and never touches the `versions/` namespace.
* Ceremony and finalization stages must continue to source evidence from `signing_document_versions`, never from a Draft snapshot.

**Related files or migrations:**

* `lib/signing/stage1-schema.ts` (`isDraftSourceObjectKey`, `isPreparedVersionObjectKey`)
* `lib/signing/draft-source-snapshots.ts`, `prepare-pdf.ts`, `draft-documents.ts`
* No SQL migration; no schema change

---

## Credential wrapping requires a dedicated versioned key bound to its credential row

**Date:** 2026-09-15

**Decision:**
The AES-256-GCM wrap of a participant bearer credential (`signing_participant_credentials.token_wrapped`) uses a **dedicated, purpose-separated wrapping key**. The Supabase secret / service-role key is **never** acceptable wrapping material, and there is no fallback of any kind: missing or malformed configuration fails closed.

Environment model:

| Variable | Required | Meaning |
|---|---|---|
| `SIGNING_CREDENTIAL_WRAP_KEY_ID` | yes | Current key version id, e.g. `v1` (short alphanumeric) |
| `SIGNING_CREDENTIAL_WRAP_KEY` | yes | Current key material: 32 bytes as base64/base64url, or a passphrase of ≥ 32 characters which is SHA-256'd |
| `SIGNING_CREDENTIAL_WRAP_PREVIOUS_KEYS` | no | Comma-separated `id:material` pairs, **decrypt-only**, for rotation |

`signing_participant_credentials.wrap_key_id` records which version wrapped each row. Encryption always uses the current version; decryption selects by the recorded version. Rotation is therefore: add the old key to `SIGNING_CREDENTIAL_WRAP_PREVIOUS_KEYS`, point `SIGNING_CREDENTIAL_WRAP_KEY(_ID)` at the new one, and later drop the old entry — after which old rows fail closed and must be re-issued.

The credential id is generated **before** wrapping so the ciphertext can be bound by authenticated associated data to `credentialId|signingId|participantId|wrapKeyId`. A ciphertext copied to another credential row, another Signing, or another key version fails the GCM tag check. Envelopes are versioned (`v2.`); pre-review `v1.` envelopes (no AAD, service-key derived) are not accepted and the dead ciphertext was cleared by migration.

**Authentication remains hash-only.** `validateParticipantCredential` reads `token_hash` and never decrypts anything; unwrapping exists solely so invitation retry can resend the *same* link.

**Reason:**
Reusing the database credential as a long-lived encryption key coupled two independent rotations and widened the blast radius of a leaked service key. Without a key version id, rotation meant re-issuing every credential. Without AAD, a wrapped bearer was a portable blob rather than a row-bound one.

**Consequences:**

* Any environment that activates a Signing must configure both wrap-key variables; activation fails closed otherwise (development, preview, and any future production enablement alike).
* Wrap/unwrap are exposed as pure keyring functions so rotation, AAD binding, and tamper behaviour are testable without a database.
* Rotating the Supabase service key no longer invalidates wrapped bearers, and rotating the wrap key no longer touches database access.
* No production schema or configuration change is authorized by this decision alone.

**Related files or migrations:**

* `supabase/migrations/20260915162000_native_signing_stage4_wrap_key_version.sql`
* `lib/signing/credentials.ts`, `lib/signing/delivery.ts`
* `scripts/validate-native-signing-stage4-dev.ts`
* This file: **Draft source snapshots store exact render inputs; credentials hash with optional server wrap** (2026-09-15, fallback consequence superseded)

---

## Opening a Signing invitation exchanges the bearer for a short-lived entry session

**Date:** 2026-09-15

**Decision:**
The invitation URL stays `{APP_BASE_URL}/sign/{rawCredentialToken}` — a path segment, never a query string. Opening it does **not** render the participant experience. `/sign/{token}` is a server-only redirector that validates the credential, creates a **`signing_entry_sessions`** row, sets the raw session token in an `HttpOnly; Secure; SameSite=Lax; Path=/sign` cookie named `hf_signing_entry`, and issues a 303 redirect to `/sign/continue`. Every later request carries the session in a cookie, so no bearer appears in a URL after the first hop.

`signing_entry_sessions` stores `session_token_hash` (SHA-256 hex) only, plus `expires_at` (30 minutes), `revoked_at`, and same-Signing FKs to the participant and the originating credential, under the same deny-by-default FORCE RLS as every other Stage 4 table. Validation on every read re-checks that the session is unexpired and unrevoked, that the Signing is still **In Progress**, that the originating credential is still `is_current` and unrevoked, and that the participant is not `REMOVED` — so revoking or re-issuing a credential immediately kills its sessions. Every failure mode returns an indistinguishable 404. Neither the credential token nor the session token is ever logged.

`/sign/:path*` responses send `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, and `X-Robots-Tag: noindex, nofollow`.

This is access plumbing only: it is **not** the signing ceremony. `/sign/continue` still shows a disabled "I am [Name]" shell.

**Reason:**
A bearer credential in a URL persists in browser history, bookmarks, shared links, and any referrer that escapes. Exchanging it once, at open time, for a short-lived HttpOnly cookie removes that exposure without changing the invitation email or forcing participants through a login they do not have.

**Consequences:**

* `app/sign/[token]` is a Route Handler (a Server Component cannot set cookies), and the participant shell lives at `app/sign/continue`.
* Sessions are additive access state and are deleted, not preserved, when Signing fixtures are cleaned up; they are never signer evidence.
* The ceremony stage builds on the validated entry session rather than re-reading a bearer from the URL.

**Related files or migrations:**

* `supabase/migrations/20260915163000_native_signing_stage4_entry_sessions.sql`
* `lib/signing/entry-sessions.ts`, `app/sign/[token]/route.ts`, `app/sign/continue/page.tsx`, `app/sign/layout.tsx`, `next.config.ts`

---

## Entry sessions and ceremony browser sessions are separate runtime layers (Model B)

**Date:** 2026-09-17

**Decision:**
Stage 4 `hf_signing_entry` / `signing_entry_sessions` remains pre-ceremony access plumbing only. After the participant affirmatively selects **I am [Participant Name]**, the server creates a distinct ceremony browser session represented by **`signing_browser_sessions`**.

The ceremony browser session belongs to exactly one Signing and one participant, derives only from a validated participant entry session or approved in-person handoff, is never a general Harbaugh Forms login, replaces the entry session as authority for ceremony actions, uses its own HttpOnly cookie, supports the approved 60-minute inactivity model, and revalidates the underlying credential (when remote), participant, Signing state, package revision, and locks on every meaningful action. Once the ceremony session is established, the entry session is terminated or otherwise rendered non-authoritative.

**Reason:**
Keeping entry exchange separate from ceremony authority prevents a short-lived access cookie from becoming indefinite signing power, supports anti-fixation, and matches the already-approved `signing_browser_sessions` domain model.

**Consequences:**

* Entry-session validation alone must never accept Signature/Initials placements, Finish, or Decline.
* Ceremony routes read the ceremony cookie, not `hf_signing_entry`.
* Exact cookie name/path and supersession SQL remain technical design.

**Related files or migrations:**

* This file: **Opening a Signing invitation exchanges the bearer for a short-lived entry session** (2026-09-15); **Signing credentials, completed-package credentials, copy recipients, and temporary browser sessions are separate** (2026-09-14)

---

## At most one active ceremony browser session per participant

**Date:** 2026-09-17

**Decision:**
Only one **ACTIVE** ceremony browser session may exist for a given participant within a Signing. When the same participant re-enters and establishes a new ceremony session, the prior active session is atomically superseded/invalidated, its presence lease is released, and all already server-accepted work is preserved. The older browser or tab must fail future writes and show an inactive-session / reopen-link message. No important signing state may exist only unsaved in the browser; all meaningful ceremony actions are server-authoritative and autosaved.

**Reason:**
Concurrent active sessions for one participant create confusing presence, ambiguous amendment blocking, and write races without improving participant usability.

**Consequences:**

* Session creation and supersession must be transactional.
* Idempotent server state remains the resume source of truth.

**Related files or migrations:**

* This file: **Entry sessions and ceremony browser sessions are separate runtime layers (Model B)** (2026-09-17)

---

## Participant presence leases start only after identity affirmation

**Date:** 2026-09-17

**Decision:**
Participant presence begins when the ceremony browser session is established after **I am [Name]**. Merely opening the Stage 4 entry page does not block amendments. The active ceremony browser session owns and renews the participant presence lease. Only the current active ceremony session for that participant may own that participant's presence lease. Timeout, supersession, revocation, Finish, Decline, or explicit exit releases or expires the lease.

**Reason:**
Abandoned pre-affirmation tabs must not prevent an agent from acquiring a permitted amendment lock.

**Consequences:**

* Presence lease rows reference the ceremony browser session, not the entry session.
* Lease heartbeat may renew presence without resetting the ceremony inactivity deadline.

**Related files or migrations:**

* This file: **Signing presence leases and amendment locks are temporary, server-expiring concurrency records** (2026-09-14)

---

## Pre-affirmation disclosure shows participant, agent, and brokerage context

**Date:** 2026-09-17

**Decision:**
Before **I am [Participant Name]**, the participant shell shows only minimal identity and official-business context: the participant name, the sending agent's name, the sending agent's brokerage name, and optionally the neutral Signing title when already available. It must not expose document titles, PDF or document contents, contractual details, field assignments, signing progress, or other participants' activity. No ceremony document bytes are disclosed before affirmation. Sender and brokerage identification is a product choice that reinforces that the Signing is official real-estate business, independent of whether a particular communication is technically subject to an advertising rule.

**Reason:**
Participants need enough context to recognize a legitimate Signing before affirming identity, without premature disclosure of contract content.

**Consequences:**

* `/sign/continue` (and in-person pre-affirmation) load only approved context fields.
* Document viewers and field progress load only after a valid ceremony browser session exists.

**Related files or migrations:**

* This file: **Remote participants use emailed links with explicit identity confirmation** (2026-09-06); **Electronic-signing consent is a single per-Signing disclosure and affirmative access confirmation** (2026-09-14)

---

## Ceremony inactivity uses meaningful participant activity, not heartbeat alone

**Date:** 2026-09-17

**Decision:**
Ceremony browser sessions continue to use the approved **60-minute inactivity** rule. Meaningful activity that resets the inactivity clock includes deliberate participant interaction such as identity/consent/adoption actions, Start Signing, document/page navigation, detectable active scrolling/review interaction when recorded server-side without excessive logging, placement attempts, placement replacement/removal, Finish, and Decline. Heartbeat alone must not keep an abandoned session alive indefinitely. Presence-lease renewal may use heartbeat, but the ceremony session inactivity deadline remains based on meaningful participant activity. After timeout, accepted server state survives; the participant re-enters through the existing valid Signing link or in-person handoff, must repeat **I am [Name]**, and receives a new ceremony browser session that replaces the old one.

**Reason:**
Separating presence heartbeat from ceremony inactivity prevents abandoned tabs from indefinitely blocking amendments while still allowing short renewable presence leases.

**Consequences:**

* `last_meaningful_activity_at` and presence `renewed_at` are distinct operational timestamps.
* Ordinary navigation/heartbeat is not durable Signing-event history.

**Related files or migrations:**

* This file: **Signing participants use a focused, autosaving signature-and-initials ceremony** (2026-09-06)

---

## Session timeout repeats identity affirmation but not electronic-signing consent when disclosure is unchanged

**Date:** 2026-09-17

**Decision:**
If consent was already validly accepted for the applicable disclosure version, a browser-session timeout does not require consent again. Identity affirmation repeats; consent remains valid; accepted marks and placements remain valid. If consent was never completed, the participant resumes at consent. If the applicable disclosure version later changes through an approved process, fresh consent may be required; an existing acceptance must not silently bind to changed disclosure text. This timeout rule is distinct from a permitted pre-signature package amendment, which may require ceremony review to restart under existing amendment decisions.

**Reason:**
Repeating identity affirmation after inactivity preserves the attestation boundary without forcing redundant disclosure clicks when the accepted disclosure is unchanged.

**Consequences:**

* Consent evidence must identify disclosure version and content fingerprint, not only `consent_accepted_at`.
* Ceremony routing after re-affirmation skips consent when the stored acceptance still matches the current applicable disclosure.

**Related files or migrations:**

* This file: **Electronic-signing consent is a single per-Signing disclosure and affirmative access confirmation** (2026-09-14)

---

## Adopted-mark locking is per participant and mark type, distinct from package freeze

**Date:** 2026-09-17

**Decision:**
Package freeze and adopted-mark freeze are separate concepts. The first accepted Signature or Initials placement anywhere in the Signing freezes the package revision globally. Each participant's adopted mark locks only when **that participant first successfully uses that particular mark type**. Participant A's Signature use does not lock Participant B's unused Signature, and does not automatically lock Participant A's unused Initials. Once a mark type has been used successfully by that participant, that adopted-mark representation cannot be changed for that Signing; field placements may still be removed or replaced before Finish using the same locked mark. This supersedes earlier wording that locked both signature and initials together after a participant's first placement of either kind.

**Reason:**
Participants often adopt Signature before Initials (or the reverse). Locking unused mark types early creates unnecessary ceremony friction without improving package integrity.

**Consequences:**

* `signing_adopted_marks.locked_at` is set per mark row/kind on first successful use of that kind.
* Global `signings.frozen_package_revision_id` remains the package-freeze pointer.

**Related files or migrations:**

* This file: **Authenticated Users may keep one reusable signature and initials preset** (2026-09-06); **A Signing freezes on its first signature or initial** (earlier freeze decisions)

---

## Paired Date Signed tracks its Signature placement through remove and replace

**Date:** 2026-09-17

**Decision:**
A linked automatic Date Signed follows its Signature placement. If a participant removes a Signature before Finish, the linked Date Signed ceases to be effective with it, while prior Signature/Date activity remains historical. If a participant replaces the Signature, the new Signature acceptance receives a new automatic Date Signed derived from the new server acceptance time; the old Date Signed value is not reused.

**Reason:**
Date Signed is evidence of the corresponding Signature act, so it must move with that act's effective state.

**Consequences:**

* Placement acceptance/removal transactions update the linked Date Signed disposition in the same authoritative write path.
* Initials still do not auto-create Date Signed unless an independently configured Date Signed field exists.

**Related files or migrations:**

* This file: **Signature fields create optional paired dates; initials do not** (2026-09-06)

---

## Personal typed signatures match the displayed name exactly without OCR

**Date:** 2026-09-17

**Decision:**
For personal signing, typed signature text must exactly match the approved displayed Signing participant name. This stage does not implement OCR or PDF-name matching. The agent remains responsible for preparing the document with the intended signer name before signing. Representative signing continues to follow the separate approved capacity/represented-party model and does not claim authority verification.

**Reason:**
Exact displayed-name enforcement is already approved product behavior; PDF text extraction would be brittle and is unnecessary for the ceremony stage.

**Consequences:**

* Ceremony UI and server validation compare typed text to the current/frozen participant display name only.
* Document-content name detection remains out of scope.

**Related files or migrations:**

* This file: **A personal participant's signing name must match the document and ceremony** (2026-09-14)

---

## Consent evidence records disclosure version, fingerprint, and acceptance scope

**Date:** 2026-09-17

**Decision:**
Consent evidence must preserve more than `consent_accepted_at`. The system retains a stable disclosure version/id, a SHA-256 (or equivalent) content fingerprint, the accepted timestamp, and participant/Signing (and package-revision/session provenance as appropriate). Prefer retaining or referencing the exact disclosure content in a durable immutable way sufficient for later reproduction. Do not rely only on a mutable global disclosure string. Development may use clearly marked non-production placeholder disclosure copy; production enablement still requires Texas legal review of final disclosure language.

**Reason:**
Later audit and certificate generation must prove exactly which disclosure the participant accepted.

**Consequences:**

* Ceremony migrations introduce durable disclosure-version storage and participant acceptance references.
* Changing disclosure text publishes a new version rather than rewriting historical acceptance rows.

**Related files or migrations:**

* This file: **Electronic-signing consent is a single per-Signing disclosure and affirmative access confirmation** (2026-09-14)

---

## Typed initials are a suggested convenience, not a legal validation

**Date:** 2026-09-17

**Decision:**
Suggested typed initials are derived from the participant's full approved display name on this Signing. The participant may freely edit that suggestion before the first successful Initials use. The server must not reject typed initials merely because they differ from the suggestion. Initials lock on first successful Initials use only; Signature adoption and locking remain independent. The UI must not present suggested initials as legally required or server-verified identity.

**Reason:**
Initials are a practical shorthand; enforcing exact derived initials conflicts with diverse name structures and misstates what the product verifies (typed Signature still matches the displayed name exactly).

**Consequences:**

* Ceremony UI prefills a suggestion and states it is editable and not legal verification.
* Server validation for typed Initials accepts reasonable participant-entered text within bounds; only typed Signature remains exact-match to the displayed name.

**Related files or migrations:**

* `lib/signing/adopted-marks.ts`
* `components/sign/ceremony-shell.tsx`
* This file: **Personal typed Signature remains exact-match; Initials remain editable suggestions** (2026-09-17)

---

## Participant signing names are free-form and support multiple middle names

**Date:** 2026-09-17

**Decision:**
Signing participant display names are free-form text without a rigid first/middle/last assumption. The product supports zero, one, or many middle names, compounds, hyphens, apostrophes, prefixes/suffixes, and cultural name structures without truncation. Initials suggestion tokenizes the full display name and includes all meaningful name components. For suggestion only, common generational suffixes (Jr, Sr, II, III, IV, and similar) are skipped; the participant may still edit the result. This stage does not implement OCR or PDF-name detection.

**Reason:**
Real signer names do not fit a single Western three-part schema; initials suggestion should assist without constraining legal or cultural naming.

**Consequences:**

* Initials suggestion algorithm skips honorific prefixes and generational suffixes for convenience only.
* Agent-prepared display names remain authoritative for typed Signature exact match.

**Related files or migrations:**

* `lib/signing/adopted-marks.ts`
* `lib/signing/initials-suggestion.test.ts`

---

## Personal typed Signature remains exact-match; Initials remain editable suggestions

**Date:** 2026-09-17

**Decision:**
Personal typed Signature text must still exactly match the approved displayed Signing participant name. Typed Initials remain a suggested default that the participant may edit until first successful Initials use; they are not required to match the suggestion.

**Reason:**
Preserves the approved personal-signature integrity rule while separating initials convenience from identity verification.

**Consequences:**

* `adoptCeremonyMark` enforces exact display name for SIGNATURE typed marks only.
* Initials typed marks validate format and length, not equality to the suggestion.

**Related files or migrations:**

* `lib/signing/adopted-marks.ts`

---

## In-person handoff locks the ordinary agent workspace until Return-to-Agent unlock

**Date:** 2026-09-17

**Decision:**
When an agent begins supervised in-person handoff on a shared device, the ordinary agent workspace is locked until an explicit Return-to-Agent unlock. Flow: handoff issued → workspace locked → participant pre-affirmation and ceremony → participant Finish/Decline/Exit → Return-to-Agent screen → explicit agent unlock → workspace restored. After Finish, Decline, or Exit, the participant must not land in the agent authenticated workspace. Browser Back must not expose cached agent workspace routes while the device lock is active (server-side redirect enforces this).

**Reason:**
A shared device must not leave brokerage workspace and participant ceremony accessible in the same browser session without a deliberate agent-controlled boundary.

**Consequences:**

* Durable device handoff lock rows and an HttpOnly lock cookie scope workspace routing.
* The lock is **browser/device scoped** (cookies on the handed-off browser), not account-global: an agent on a second independent device is not locked out of Harbaugh Forms unless that browser also holds the lock cookie.
* Private authenticated workspace responses use `Cache-Control: no-store` (and related private/no-cache headers). A readable companion flag plus a `pageshow`/bfcache guard force Return-to-Agent when a restored history entry would otherwise briefly show pre-handoff workspace HTML. Server/proxy lock validation remains authoritative.
* Ceremony completion redirects to Return-to-Agent when the lock is active, not to agent dashboards.
* Handoff entry and unlock prefer `location.replace` so ordinary Back does not re-enter the prior workspace history entry.

**Related files or migrations:**

* `supabase/migrations/20260917140000_native_signing_ceremony_device_handoff_lock.sql`
* `lib/signing/device-handoff-lock.ts`
* `components/device-handoff-bfcache-guard.tsx`
* `app/sign/return-to-agent/page.tsx`
* `lib/supabase/proxy.ts`
* `next.config.ts` (private workspace `no-store` headers)

---

## Return-to-Agent is a device-control boundary, not Signing finalization

**Date:** 2026-09-17

**Decision:**
The Return-to-Agent screen and unlock action restore agent workspace access on a shared device. They do not complete the Signing, enqueue finalization, or replace participant Finish. Signing finalization and lifecycle `COMPLETE` remain a later stage.

**Reason:**
Device handoff safety and Signing completion are separate concerns; conflating unlock with finalization would mis-state product state.

**Consequences:**

* Return-to-Agent UI explains handoff mode and excludes document content.
* Unlock releases the device lock only; it does not mutate finalization evidence.

**Related files or migrations:**

* `app/sign/return-to-agent/page.tsx`
* `lib/signing/device-handoff-lock.ts`

---

## Agent unlock after in-person ceremony requires an explicit verified transition

**Date:** 2026-09-17

**Decision:**
Restoring the agent workspace after in-person ceremony requires a dedicated locked Return-to-Agent screen and an explicit "Return to Agent Workspace" action. Prefer password re-authentication when the auth stack supports it; at minimum there is no automatic restoration of agent workspace routes while the device lock cookie is present. Failed re-authentication fails closed.

**Reason:**
Explicit agent verification on a device the participant just used reduces accidental or opportunistic access to brokerage workspace.

**Consequences:**

* Unlock validates the authenticated agent matches the lock issuer and re-verifies password before releasing the lock and clearing the cookie.
* Residual: full protection against a determined local attacker with physical device access is not claimed; routing and cookie scope provide the practical boundary.

**Related files or migrations:**

* `lib/signing/device-handoff-lock.ts`
* `lib/signing/ceremony-agent-actions.ts` (unlock action)

---

## Mutable Draft signer-field instructions use `signing_draft_fields`, not revision-scoped `signing_fields`

**Date:** 2026-09-15

**Decision:**
Stage 3 Draft preparation stores Signature / Initials / linked system DATE_SIGNED placement instructions in **`signing_draft_fields`**. Revision-scoped **`signing_fields`** remain immutable package-revision evidence created only during promotion.

`signing_documents` and `signing_participants` are the mutable Signing-level Draft records for logical documents and participants. After a logical document has prepared versions or package-revision history, removing it from Draft soft-excludes it via **`included_in_draft = false`** rather than deleting historical evidence rows. Later revisions may omit that document while earlier revisions retain it.

Ordinary Draft add/edit/reorder/remove of documents, participants, and draft fields must not create `signing_document_versions` or `signing_package_revisions`. Internal promotion may create those only when invoked deliberately (future activation, or Stage 3 tests/validators).

**Reason:**
`signing_fields` was designed as frozen revision evidence. Reusing it for mutable Draft editing would blur evidence with preparation and risk rewriting promoted placements. Soft exclusion preserves the “complete revision snapshot / omit without rewriting history” rule.

**Consequences:**

* Browser clients remain denied on `signing_draft_fields` under the same server-authoritative Signing-write model as Stage 1 evidence tables.
* Promotion copies Draft field instructions into revision-scoped `signing_fields` and advances `current_package_revision_id` only after the complete snapshot validates.
* Send / Begin In-Person Signing remain Stage 4+; Stage 3 does not export activation actions.

**Related files or migrations:**

* `supabase/migrations/20260915120000_native_signing_stage3_draft_preparation.sql`
* `supabase/migrations/20260915130000_native_signing_stage3_draft_document_inclusion.sql`
* `lib/signing/draft-*.ts`, `package-promotion.ts`, `document-versions.ts`, `prepare-pdf.ts`, `integrity.ts`

---

## Prepared Signing PDFs render working-document Fill Form content; annotations are not ceremony evidence

**Date:** 2026-09-15

**Decision:**
When promotion prepares an immutable PDF for a Signing Document, the trusted renderer reuses the existing Fill Form pipeline (`getFilledPacketFormPdfBytes` / `fillPacketFormPdfBytes`). That means the prepared PDF includes the working packet form’s field overlays and ACTIVE `typed_signature` / `date_signed` annotations as **working-document visual content**.

Those Fill Form annotations are **not** Native Signing ceremony evidence. Ceremony Signature / Initials / Date Signed placements are Draft instructions (`signing_draft_fields`) that freeze into revision-scoped `signing_fields` and are later fulfilled by participant adopted marks/placements. Prepared-PDF rendering does not apply ceremony marks.

**Reason:**
Participants must see the same working-document content the agent prepared. Reusing the proven Fill Form render path avoids inventing a second PDF pipeline while preserving the settled separation between agent markup and Signing ceremony evidence.

**Consequences:**

* Changing working-document content or annotations changes the prepared-byte fingerprint and requires a new document version for that logical Signing Document.
* Integrity verification hashes exact stored prepared bytes; mismatch preserves the recorded fingerprint and fails closed for reuse/promotion.
* No admin integrity remediation UI is implied by Stage 3.

**Related files or migrations:**

* `lib/signing/prepare-pdf.ts`, `lib/packet-form-download.ts`, `lib/fill-packet-form-pdf.ts`
* This file: Fill Form annotations vs Signing evidence (orientation); Package revision / SHA-256 decisions (2026-09-14/15)

---

## Package revisions may reuse unchanged Signing document versions

**Date:** 2026-09-15

**Decision:**
A **Signing Document** (`signing_documents`) is the logical document within a Signing. A **Document Version** (`signing_document_versions`) is one exact immutable prepared PDF for that logical Signing Document. A **Package Revision** (`signing_package_revisions` plus its revision-scoped child snapshots) freezes the complete package composition and all relevant revision-scoped state for participant action.

A new package revision does **not** imply that every included document receives a new document version.

* If a logical Signing Document's exact prepared PDF has not changed, a later package revision may cite/reuse the same immutable `signing_document_version`.
* If that document's exact prepared PDF changes, create a new immutable document version; never overwrite an earlier version.
* Package revisions may add or omit documents without modifying earlier revisions and without unnecessarily recreating unchanged document versions.
* Reuse is scoped to the **same logical Signing Document and its existing immutable version**. Do not deduplicate unrelated logical documents merely because their bytes or SHA-256 fingerprints happen to match.

Thus one package revision remains a distinct complete frozen composition even when some or all of its document-version references are reused from an earlier revision.

**Reason:**
Amendments often change roster, field geometry, display order, or which documents are included without changing every PDF. Forcing a new document version for unchanged bytes would invent false document history and inflate immutable storage. Cross-document byte/hash deduplication would falsely collapse unrelated logical documents and confuse provenance.

**Consequences:**

* `signing_package_revision_documents` is the place a revision names its exact document-version set; reuse is expressed by repeating a version id, not by mutating prior revision rows.
* Unchanged prepared PDFs keep one fingerprint and one storage object identity across revisions that reuse them.
* Integrity verification remains per stored version/artifact; reuse does not create a second authoritative fingerprint for the same version row.
* Exact introduction-revision bookkeeping, storage-object sharing, and activation/amendment algorithms remain technical design.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (Stage 3 scope clarification)
* This file: **Promoted package revisions are complete, immutable, and atomically actionable** (2026-09-14); **Working Signing data model…** (2026-09-10); **Signing artifacts and events receive verifiable cryptographic integrity evidence** (2026-09-14); **Each Signing document preserves prepared and completed immutable artifacts** (2026-09-06)
* No SQL migration; no schema change

---

## Native Signing Stage 2 uses a trusted server actor/authority boundary

**Date:** 2026-09-14

**Decision:**
Native Signing agent-side Draft operations execute only through a trusted server boundary. The server resolves the authenticated User, application-account eligibility, originating brokerage membership, and Signing association authority before any service-role read or write. Browser clients never supply authoritative `user_id`, organization id, app role, or primary-agent identity. Current management authority requires an active primary/co-agent association **and** current eligibility in the originating brokerage, or originating-brokerage `ORG_ADMIN` membership. Former associated agents retain historical read without management when eligibility ends. Possession of a Signing UUID alone never grants access.

**Originating organization on Draft create** uses the settled Harbaugh Forms primary-organization convention already used for Organization defaults (`profiles.primary_organization_id`):
1. If `primary_organization_id` is set and the User has an ACTIVE membership in that ACTIVE organization, that organization is the originating brokerage.
2. Else if the User has exactly one ACTIVE membership in an ACTIVE organization, that sole membership is used.
3. Else create fails closed (`AMBIGUOUS_ORGANIZATION` / ineligible). The server never silently picks an arbitrary organization among multiple memberships, and the browser never supplies the organization id.

Organization derivation applies to **create only**. Read and title-update evaluate authority against the Signing’s stored originating organization and associations; they do not require re-deriving a create-time primary organization.

Stage 2 exposes only Draft create, authorized read, and Draft title update. It does not add authenticated browser RLS policies for Signing evidence tables.

**Reason:**
Stage 1 established deny-by-default evidence storage. Stage 2 must introduce the earliest agent operations without recreating F6-style ungated service-role readers or weakening Stage 1 R12 denial. Using `primary_organization_id` avoids inventing a parallel org-selection mechanism while remaining fail-closed for ambiguous multi-org Users.

**Consequences:**

* Future Signing UI must call server actions/helpers rather than querying `signings` directly.
* Multi-org Users must set a valid primary organization before creating a Signing.
* Brokerage administrators are not modeled as fake agent-association rows.
* Participant/ceremony credentials remain deferred.

**Related files or migrations:**

* `lib/signing/actor.ts`, `lib/signing/authority.ts`, `lib/signing/eligibility.ts`, `lib/signing/operations.ts`, `lib/signing/actions.ts`
* `scripts/validate-native-signing-stage2-dev.ts`
* This file: **Signing access belongs to the originating brokerage and full-authority agents** (2026-09-06); **Signing writes are server-authoritative…** (2026-09-14); Organization defaults / `primary_organization_id` convention

---

## Native Signing Stage 1 uses env feature gate and private signing-artifacts bucket

**Date:** 2026-09-14

**Decision:**
Native Signing availability is controlled by the server-only environment variable `NATIVE_SIGNING_ENABLED`. The feature is enabled only when that value is exactly `true`. It is not exposed as a `NEXT_PUBLIC_*` flag. Helpers live in `lib/signing/feature-gate.ts` (`isNativeSigningEnabled`, `assertNativeSigningEnabled`). Later Signing stages must call these helpers before exposing Signing behavior.

Immutable Signing artifacts use the private Supabase Storage bucket id `signing-artifacts`. Authenticated and anonymous browser clients receive no direct Storage access to that bucket. Stage 1 does not implement short-lived download URLs or upload APIs.

**Reason:**
Stage 1 needs the smallest gate consistent with existing env-based configuration and a stable bucket identifier matching the approved dedicated-artifact-store decision, without inventing a large feature-flag framework or participant download machinery.

**Consequences:**

* Incomplete Signing surfaces stay off until explicitly enabled in an environment.
* Artifact bytes never live in `generated-documents` or `form-templates` as Signing evidence.
* Bucket object-key format and mediated download behavior remain later-stage design.

**Related files or migrations:**

* `lib/signing/feature-gate.ts`
* `supabase/migrations/20260914200000_native_signing_stage1_foundation.sql`
* This file: **Signing artifacts use a dedicated private Supabase bucket at initial release** (2026-09-14); **Native Signing implementation is additive, staged, and feature-gated** (2026-09-14)

---

## Native Signing Stage 1 evidence tables are browser-inaccessible by default

**Date:** 2026-09-14

**Decision:**
The Stage 1 Signing evidence tables (`signings` and the approved core child tables introduced in migration `20260914200000`, tightened by `20260914210000`) enable and force RLS, apply restrictive deny policies for `anon` and `authenticated`, and revoke browser-role grants. Service-role/trusted server access remains the only intended write path. Composite `(signing_id, id)` uniqueness plus same-Signing foreign keys enforce cross-Signing rejection where the schema can express it. Root current/frozen package-revision and primary-agent pointers use composite `(signings.id, pointer)` foreign keys so they cannot reference another Signing. Package-revision document snapshots require the cited version to belong to that logical document, and signer fields require revision document/participant snapshots from the same package revision. `signing_events.sequence_number` is server-assigned; updates to `signing_events` are blocked. Foreign keys use `ON DELETE RESTRICT` or `SET NULL` only—never `CASCADE` into Signing evidence.

Credential, session, delivery, lease, lock, work-item, and idempotency tables remain deferred to later stages.

**Reason:**
Server-authoritative Signing writes require deny-by-default browser posture before any ceremony exists. Introducing credential/session tables before their access model would create unused attack surface. Single-column root pointer FKs would allow a foreign Signing UUID to satisfy a superficially valid reference.

**Consequences:**

* Ordinary authenticated Users and anonymous clients cannot SELECT/INSERT/UPDATE/DELETE Signing evidence through PostgREST.
* Later stages must add narrow, explicit server-mediated or credential-scoped access rather than relaxing Stage 1 into broad authenticated policies.
* SHA-256 fingerprint columns and reserved event-integrity columns may exist without claiming verification is implemented.

**Related files or migrations:**

* `supabase/migrations/20260914200000_native_signing_stage1_foundation.sql`
* `supabase/migrations/20260914210000_native_signing_stage1_same_signing_pointers.sql`
* `supabase/migrations/20260914211000_native_signing_stage1_shorten_constraint_names.sql`
* `scripts/validate-native-signing-stage1-dev.ts`
* This file: **Signing writes are server-authoritative and link/session access is narrowly scoped** (2026-09-14); **Every Signing child relationship remains within its one parent Signing** (2026-09-14)

---

## Native Signing development preserves the verified security baseline

**Date:** 2026-09-14

**Decision:**
Every Native Signing implementation stage must preserve the post-remediation security baseline established by findings F1–F11 and recorded in the private local `security.md` regression matrix. Signing work is additive and feature-gated; it must not weaken, bypass, inconsistently duplicate, or replace those controls. Before any Signing stage is declared complete, the applicable existing security regression tests must pass, relevant application regressions must pass, and new automated tests must cover any new Signing security boundary introduced by that stage.

Fill Form `packet_form_annotations` (`typed_signature`, `date_signed`) remain agent markup on the working packet document. Ceremony signer fields, adopted marks, placements, credentials, artifacts, and append-only events belong to the approved Signing-owned tables. Do not treat an agent-placed typed signature annotation as a legally completed Signing placement, and do not implement Signing evidence by mutating ordinary packet-form annotation rows into Signing state.

**Reason:**
The 2026-09-14 Signatures orientation verified that F1–F11 remediations are present in migrations and application code. Signing introduces new trust boundaries (external participants, bearer credentials, private artifacts, server-only evidence writes) that sit beside—not instead of—the existing packet, account-state, Storage, admin, and publication controls. Collapsing Signing evidence into Fill Form annotations would confuse agent markup with participant ceremony evidence and would undermine the approved immutable Signing model.

**Consequences:**

* Security validation is a required completion criterion for every Signing stage, not a final cleanup step.
* If a Signing feature appears to require weakening an existing invariant, stop and obtain explicit approval rather than shipping the weaker behavior.
* Sensitive security reproduction details remain only in the private local `security.md` file, which stays gitignored and out of deployment.
* Stage 1 may introduce Signing tables and a private artifacts bucket under deny-by-default browser access without enabling ceremony UI.

**Related files or migrations:**

* Private local `security.md` (not tracked in Git)
* `project_status.md` (Signatures orientation section)
* This file: **Native Signing implementation is additive, staged, and feature-gated** (2026-09-14); **Signing writes are server-authoritative and link/session access is narrowly scoped** (2026-09-14); **Working Signing data model…** (2026-09-10)
* No SQL migration; no schema change by this decision

---

## Packet Forms have editable packet-specific display names

**Date:** 2026-09-14

**Decision:**
`packet_forms.document_name` is the editable display name for that one form instance in a Packet. Renaming it never changes the canonical `forms.form_name`, the source form template, field mappings, or the stored PDF bytes. An active Draft or Final Packet Form may be renamed; Signed and Void Packet Forms remain read-only. Duplicate Packet Form names are permitted, but agents can give repeated forms such as multiple amendments clear, distinct labels.

The packet-specific display name is used in packet UI and human-readable download filenames. A Signing captures the packet display name into its immutable package-revision document snapshot, so a later Packet Form rename never rewrites a sent or completed Signing's participant view, completed documents, filenames, or evidence.

**Reason:**
One transaction frequently includes more than one instance of a standard form. The agent needs to distinguish those instances without corrupting the canonical form library or historical Signing evidence.

**Consequences:**

* Agents can name a Packet Form, for example, “Listing Addendum — price change to $400k.”
* The canonical Forms library keeps its original title.
* No new schema field or migration is needed because the packet-specific name already exists.
* Renaming does not alter document contents, source storage, or field values.
* Signed and Void working-document records remain read-only.

**Related files or migrations:**

* `lib/types/packet-form.ts`
* `components/packets/packet-forms-live-editor.tsx`
* This file: **Working Signing data model records workflow, revisions, documents, participants, placements, artifacts, and events separately** (2026-09-14); **Packet Form Document Lifecycle** (2026-07-17)
* No SQL migration

---

## “Show only my data” is a personal workspace filter, not an authority change

**Date:** 2026-09-14

**Decision:**
Harbaugh Forms stores a per-user “Show only my data” workspace preference. When enabled, it filters the regular Contacts, Properties, Packets, and representation-agreement lists, as well as their normal selection searches, to records owned by the current user. Existing selected or linked records remain available where necessary to preserve the context of the work already open.

The preference does not change database access, administrative authority, ownership, RLS policies, or what the user may manage after deliberately turning the filter off. It is a reversible personal display choice and defaults to showing all records already available to the user.

**Reason:**
An application administrator needs day-to-day focus on their own business records without losing broker or administrator oversight of the larger workspace.

**Consequences:**

* The preference is saved in the existing user-preferences record and survives a new browser session.
* It is available from Settings as “My Workspace View,” where users naturally manage a personal display choice.
* The setting is not a security boundary and must never be described as one.
* Direct work already open or explicitly selected is not silently broken by a view preference.

**Related files or migrations:**

* `lib/types/user-preferences.ts`
* `lib/user-preferences.ts`
* `components/settings/settings-page.tsx`
* Affected workspace lists and pickers
* No SQL migration

---

## The Signing ceremony has an accessible, non-coercive interaction baseline

**Date:** 2026-09-14

**Decision:**
The native Signing experience supports keyboard-only operation; clear visible focus and error feedback; meaningful screen-reader labels, instructions, and status announcements; typed signatures and initials as an alternative to drawing; and instructions that do not depend on color alone. It does not impose a short forced interaction timeout. The approved inactivity session timeout warns the participant, preserves server-confirmed work, and allows them to resume through the approved re-entry flow.

The Signing ceremony must not claim that every source PDF or underlying transaction document is accessible merely because the application controls are accessible. If a source document needs an accommodation, the agent uses an appropriate accessible source or other accommodation rather than Harbaugh Forms silently altering the frozen transaction document. An agent may assist with navigation or explanation but may not place a participant's marks; representative signing remains the separate approved capacity workflow.

**Reason:**
Participants should be able to complete the electronic ceremony without being excluded by a mouse-only, drawing-only, color-dependent, or rushed interface. The product must also avoid overstating what it can guarantee about source documents it did not author.

**Consequences:**

* Accessibility requirements apply to the focused Signing experience from its first release.
* Typed adoption remains an equal alternative to a drawn signature or initials.
* Session expiry does not discard confirmed work or force a participant to begin again.
* Source-document accessibility and transaction-specific accommodation remain the agent's responsibility, supported by appropriate workflow choices rather than evidence-altering automatic edits.
* Exact accessibility standard, testing method, PDF-viewer capabilities, language support, and accommodation UI remain implementation and compliance design.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Signing participants use a focused, autosaving signature-and-initials ceremony** (2026-09-06); **In-person signing uses the same evidence model through an explicit shared-device handoff** (2026-09-14)
* No SQL migration; no schema change

---

## Signing email starts on Resend with a provider-neutral delivery boundary

**Date:** 2026-09-14

**Decision:**
Native Signing uses Resend's free transactional-email tier for the initial release. Harbaugh Forms records its own delivery instructions, attempts, outcomes, recipient links, and immutable artifacts; no provider-specific record is the authoritative Signing evidence. The delivery implementation uses a narrow provider-neutral boundary so that Resend can later be upgraded or replaced without changing the Signing workflow, credentials, artifacts, or evidence history.

The system treats Resend's current free-tier daily sending allowance as a real operational limit. It records provider rejection or failure accurately, applies the approved retry and sender-notification behavior, and never represents an unsent message as delivered. Sending-domain authentication and webhook handling are configured before production Signing use.

**Reason:**
Resend's free tier is appropriate for Harbaugh Forms' current small user base. A provider-neutral boundary preserves an easy path to a paid Resend plan, Postmark, or another transactional provider when volume, deliverability operations, or support needs change.

**Consequences:**

* Initial Signing email costs no additional provider subscription while volume remains within Resend's free allowance.
* The daily allowance is monitored as a delivery constraint, especially because invitations, reminders, and completed-document delivery can create multiple recipient messages.
* Delivery evidence is retained by Harbaugh Forms rather than delegated to a provider's limited activity-retention period.
* A later provider change does not invalidate historical delivery evidence or require reissuing recipient links.
* Exact sending domain, Resend account ownership, credentials, webhook verification, quota monitoring thresholds, retry timing, and provider-adapter interface remain implementation design.
* No application code, schema, migration, storage configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Signing delivery instructions and attempts preserve every email outcome separately from workflow state** (2026-09-14); **Signing artifacts use a dedicated private Supabase bucket at initial release** (2026-09-14)
* No SQL migration; no email-provider configuration change

---

## Signing artifacts use a dedicated private Supabase bucket at initial release

**Date:** 2026-09-14

**Decision:**
Native Signing artifacts use a dedicated private Signing-artifacts bucket in Harbaugh Forms' existing Supabase environment for the initial release. The application server remains the sole authority that mediates artifact access; neither browser clients nor email recipients receive direct bucket access. The bucket follows the previously approved immutable-object, opaque-key, and short-lived artifact-download authorization design.

**Reason:**
Using the existing managed environment keeps the first release operationally focused while preserving the separate protected storage boundary required for Signing evidence.

**Consequences:**

* Signing artifacts are separated from ordinary packet/form storage even though both use the existing Supabase environment.
* No new object-storage provider is required for the initial release.
* A later storage-provider migration remains possible without changing the Signing evidence or access principles.
* Bucket configuration, retention settings, service credentials, backup/export operations, and migration procedures remain implementation design.
* No application code, schema, migration, storage configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Signing artifacts use private immutable storage and server-mediated downloads** (2026-09-14); **Signing recovery preserves evidence and begins in a non-delivering safe mode** (2026-09-14)
* No SQL migration; no storage configuration change

---

## Agents sign through the same evidence-bearing ceremony as other participants

**Date:** 2026-09-14

**Decision:**
When a primary agent or co-agent is also assigned a signature or initials field, they complete those fields through the same participant Signing ceremony, placement rules, identity affirmation, consent record, adopted-mark rules, autosave, and immutable evidence model as any other participant. Their authenticated workspace provides the entry path and may offer their approved reusable User signature and initials preset; it does not permit a special direct-write or agent-only signing shortcut.

The server attributes the action to both the authenticated User and the explicitly assigned Signing participant. The agent's normal workspace authority remains separate from their participant act of signing and cannot be used to alter frozen evidence or bypass field assignment.

**Reason:**
An agent's own signature must be as clear, durable, and auditable as every other signature. Reusing the same ceremony avoids an unexplainable second standard for evidence.

**Consequences:**

* Agents may enter their assigned Signing fields from their authenticated workspace rather than through an emailed invitation.
* Agent signatures, initials, paired automatic dates, and completion events have the same evidence structure as participant actions.
* Workspace authority never substitutes for a participant-field assignment or the affirmative signing ceremony.
* Exact workspace entry UI, association rules, and re-authentication details remain implementation design.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Signing participants use a focused, autosaving signature-and-initials ceremony** (2026-09-06); **Authenticated Users may keep one reusable signature and initials preset** (2026-09-06)
* No SQL migration; no schema change

---

## Representative authority is stated by users, not validated by Harbaugh Forms

**Date:** 2026-09-14

**Decision:**
Harbaugh Forms enables a person to sign in an agent-prepared representative capacity, such as under a power of attorney or as a guardian, but makes no claim to determine legal authority, legal validity, or the adequacy of the execution wording. The agent and signatory are responsible for selecting the capacity, represented person, and document wording. The product records the stated relationship as Signing evidence without application-level fact-checking or validation.

An authority document, such as a power of attorney or guardianship record, is not required to create or complete a representative Signing. An authorized agent may optionally associate a supporting authority document as a separate protected artifact. It is not automatically included with participant or completed-copy delivery; the agent deliberately chooses whether to include it for a particular delivery.

**Reason:**
Representative signing is a practical workflow feature, not a legal-adjudication service. Requiring or purporting to validate authority would create an inaccurate expectation that Harbaugh Forms has decided a legal fact.

**Consequences:**

* The product records what users state, rather than certifying the authority behind it.
* Representative Signing remains usable when the authority document is handled outside Harbaugh Forms.
* Optional supporting documents receive the same protected handling as other Signing artifacts, but are delivered only through an explicit agent choice.
* Participant-facing language must not imply that Harbaugh Forms approved, verified, or endorsed an authority claim.
* Exact attachment controls, access rules, audit details, and compliance review remain implementation design.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Representative signing is a first-class ceremony with a stated capacity** (2026-09-14); **Signing artifacts use private immutable storage and server-mediated downloads** (2026-09-14)
* No SQL migration; no schema change

---

## A personal participant's signing name must match the document and Signing identity

**Date:** 2026-09-14

**Decision:**
For a participant signing personally, the name used in the Signing, the name presented for their signing ceremony, and the name appearing on the document for that signer must match. A personal participant cannot choose a fuller, shorter, customary, or otherwise different name as their adopted typed signature. If the intended name is wrong or incomplete, an authorized agent corrects the participant identity and document before the first accepted signature or initials placement under the approved amendment process. Representative signing uses the distinct execution-capacity decision below.

For a typed signature, the product only permits the exact displayed signing name. A drawn signature may naturally be stylized, but the participant expressly affirms that they are signing as that exact displayed/document name. The system records the participant identity, any typed representation or drawn mark, and the affirmation; the mark does not silently alter the participant's identity.

**Reason:**
Completed transaction documents need a clear, consistent signer name. Allowing a participant to sign "Kenneth Lee Harbaugh" where the document identifies "Lee Harbaugh," or the reverse, can create needless title-company and transaction-review problems.

**Consequences:**

* A personal Signing does not treat a customary or alternate name as an acceptable substitution for the document name.
* Name correction is a pre-first-mark preparation action, not participant self-service during the ceremony.
* Drawn signatures remain usable without pretending that their stylized appearance can be mechanically name-matched.
* Once the first accepted signature or initials is placed, the existing identity snapshot stays frozen; a material correction requires a new Signing.
* Exact document-name detection, validation UI, and exception/escalation handling remain implementation design.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Participant identity is agent-correctable only before the first signing mark** (2026-09-14); **Electronic-signing consent is affirmative and records the exact disclosure accepted** (2026-09-14)
* No SQL migration; no schema change

---

## Representative signing is a first-class ceremony with a stated capacity

**Date:** 2026-09-14

**Decision:**
Harbaugh Forms supports representative signing from the initial native Signing release through one generic stated-capacity model. The agent may select common labels such as attorney-in-fact / POA, guardian, trustee, or authorized entity signer, and supplies the exact capacity wording together with the represented person or entity. The person who completes the ceremony is the signatory; the Signing separately records the party represented and the stated signing capacity. The document execution wording must match that prepared relationship, for example, "Kenneth Lee Harbaugh as Attorney-in-Fact for Richard Harbaugh."

The invitation or in-person handoff, identity affirmation, electronic consent, adopted signature or initials, placements, and activity history belong to the actual signatory. The represented person's identity and capacity are immutable Signing evidence associated with that act. A drawn signature may be the signatory's ordinary mark with the execution-capacity wording rendered alongside it; a typed signature follows the exact approved execution wording.

An agent prepares the representative capacity before the first accepted signature or initials placement. The participant cannot convert an ordinary personal ceremony into representative signing, change the represented person, or change capacity during the ceremony. Harbaugh Forms records the claimed authority and does not determine the legal validity of a power of attorney, guardianship, or other authority document.

**Reason:**
Power-of-attorney and guardianship signings occur regularly in real-estate transactions. They must be represented as the actual person's authorized act rather than be forced into an inaccurate personal-signature model.

**Consequences:**

* POA, guardian, trustee, and authorized-entity signing fit one out-of-the-box representative model rather than separate legal workflows.
* The actual signatory remains clearly distinguished from the person represented.
* Document execution wording, the electronic ceremony, and evidence describe the same relationship.
* The product records a stated capacity; it does not make a legal determination about authority validity.
* Exact common-label list and UI/data modeling remain implementation design; supplied capacity wording is not interpreted by the application.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **A personal participant's signing name must match the document and Signing identity** (2026-09-14); **Representative authority is stated by users, not validated by Harbaugh Forms** (2026-09-14)
* No SQL migration; no schema change

---

## Electronic-signing consent is a single per-Signing disclosure and affirmative access confirmation

**Date:** 2026-09-14

**Decision:**
After the participant completes the approved identity affirmation and before they may place the first signature or initials in a Signing, Harbaugh Forms presents one plain-language electronic-records and electronic-signature disclosure for that Signing. The participant can view, download, print, and retain the full disclosure. They affirm that they can access and retain the electronic records and agree to sign electronically; no OTP, test email, forced scrolling, or repeated consent step is required.

The disclosure explains the scope of consent, availability of electronic completed copies, the participant's ability to obtain paper records or decline electronic signing through the agent, the absence of an application fee for doing so, and the basic technical ability needed to access, retain, and print the records. Consent is limited to that one Signing, not an indefinite blanket consent. The system records the exact disclosure version and content fingerprint, the participant, the Signing, the consent action, and the accepted-at time as Signing evidence.

A later disclosure revision applies to future, unstarted participant ceremonies. It does not rewrite, invalidate, or silently re-prompt consent already accepted for an active Signing. A participant who does not consent cannot sign electronically through that ceremony and may decline or use an appropriate alternative workflow outside it. The final disclosure text and operational instructions require Texas legal review before production release; Harbaugh Forms must not claim that its disclosure independently establishes legal compliance.

**Reason:**
The Signing evidence must show both that the participant affirmatively consented and which disclosure they actually accepted, while keeping the ceremony clear and low-friction for ordinary real-estate participants.

**Consequences:**

* One affirmative access-and-consent action is a clear precondition to the first electronic signing mark.
* The participant receives a retainable disclosure and later completed electronic copies without a login requirement.
* Evidence retains the applicable disclosure rather than relying on later, mutable wording.
* Updating general product wording does not alter historical consent records.
* Exact counsel-approved disclosure copy, presentation layout, version-publication process, paper-record request handling, and jurisdiction-specific review remain implementation and compliance work.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Signing participants use a focused, autosaving signature-and-initials ceremony** (2026-09-06); **Completed copies are emailed without login and copy recipients remain addable** (2026-09-06)
* No SQL migration; no schema change

---

## Participant identity is agent-correctable only before the first signing mark

**Date:** 2026-09-14

**Decision:**
Participants cannot edit their displayed name, email address, or optional role from the Signing experience. Before any accepted signature or initials placement exists anywhere in the Signing, an authorized primary agent or co-agent may correct those details through the approved amendment lock and a new package revision.

If the participant email address changes, the existing participant credential is revoked and a new credential is issued to the corrected address. A name or role correction that does not change the authorized recipient may retain the existing credential. Once the first accepted signature or initials placement freezes the Signing, the participant identity snapshot is immutable; a material correction requires cancelling the Signing and issuing a new one.

**Reason:**
The displayed participant identity is evidence about who the system invited and who performed the ceremony. Letting a participant rewrite it during signing, or silently changing it after a mark exists, would weaken that evidence.

**Consequences:**

* An agent can fix a pre-signing typo without recreating the Signing.
* An email correction never leaves the old address with usable Signing access.
* Participant self-service editing does not create an ambiguous identity history.
* The first accepted signature or initials freezes both the package and identity snapshot already approved for the Signing.
* Exact materiality criteria, correction UI, and delivery wording remain implementation design.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **A Signing freezes on its first signature or initial** (2026-08-24); **In-person signing uses the same evidence model through an explicit shared-device handoff** (2026-09-14)
* No SQL migration; no schema change

---

## In-person signing uses the same evidence model through an explicit shared-device handoff

**Date:** 2026-09-14

**Decision:**
In-person signing uses the same durable Signing, participant, package revision, fields, placements, artifacts, events, and completion model as remote signing. It is not a separate kind of Signing or a shortcut around the approved ceremony. The agent starts a participant-specific shared-device handoff from the normal workspace; the regular agent workspace is then unavailable while the participant acts in the focused Signing experience.

The participant affirms the displayed identity, consents to electronic signing, adopts/uses the approved signature or initials, and completes only that participant's assigned fields. The server attributes actions to the Signing participant and in-person session, never to the agent merely because the agent was previously logged into the shared device. Returning to the normal agent workspace requires the agent to re-authenticate or otherwise complete a secure workspace unlock.

No invitation email, OTP, or participant account is required for the in-person ceremony. The participant's approved email remains available for required completed-copy delivery and later contact. If an in-person participant does not finish, the Signing may continue through the same approved participant workflow, including a later remote link when appropriate, without reclassifying or recreating the durable Signing.

**Reason:**
Handing a laptop across the table should eliminate printing, scanning, and needless email friction without confusing the agent's application identity with the participant's act of signing or weakening the evidence model.

**Consequences:**

* Remote and in-person participants produce the same immutable evidence structure.
* A shared device never gives a participant access to the agent workspace.
* In-person activity remains participant-attributed, server-authorized, and auditable.
* Unfinished in-person work can transition to approved remote participation without losing the Signing's history.
* Exact handoff UI, workspace-unlock method, session mechanics, in-person participant setup, and optional remote follow-up behavior remain implementation design.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **In-person signing is a first-class native Signing mode** (2026-08-24); **Signing writes are server-authoritative and link/session access is narrowly scoped** (2026-09-14)
* No SQL migration; no schema change

---

## Signing email identifies Harbaugh Forms while routing transaction replies to active agents

**Date:** 2026-09-14

**Decision:**
Signing invitations, reminders, completion delivery, and other participant-facing messages are sent by Harbaugh Forms on behalf of the originating brokerage and primary agent to preserve consistent, authenticated delivery. Transaction replies route to the current primary agent and every active co-agent on the Signing. This allows the participant to ask a transaction question through ordinary email while ensuring the agents with current full authority receive it.

Standard email reply routing addresses all configured reply recipients rather than forcing a literal CC on a participant's later reply. Harbaugh Forms therefore configures the primary agent and active co-agents as the reply recipients, which gives the primary agent the intended direct reply and copies active co-agents without requiring an inbound-mail relay or storing participant correspondence in the Signing system.

Participant-facing emails clearly distinguish transaction questions, which go to the agent reply recipients, from Harbaugh Forms support or security issues, which go to the appropriate product-support channel. Historical read-only agents and brokerage administrators are not automatically included in reply routing. The email itself does not expose protected technical metadata or raw access credentials beyond the deliberately provided Signing link.

**Reason:**
Participants need a simple human path for transaction questions, while the product needs consistent deliverability and should not turn general email correspondence into uncontrolled Signing evidence or a new mailbox feature.

**Consequences:**

* Primary agents and active co-agents receive participant transaction replies.
* Outbound delivery remains branded and authenticated through Harbaugh Forms.
* Harbaugh Forms does not build or retain a general inbound participant-email mailbox for Signings.
* Exact sender display format, authenticated sending domain, reply-recipient header behavior, support channel, email templates, and provider configuration remain implementation design.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Signing reminders, sender notifications, and requested completion dates use email only** (2026-09-06); **Signing access belongs to the originating brokerage and full-authority agents** (2026-09-06)
* No SQL migration; no schema change

---

## Signing monitoring separates technical escalation from business notifications

**Date:** 2026-09-14

**Decision:**
System-administrator monitoring and escalation cover integrity-check failures, repeated finalization or delivery failures, stuck work, abnormal credential activity, and recovery-safe-mode activation. These alerts contain only the operational context needed for diagnosis and remain restricted to authorized system administrators.

Primary agents and active co-agents receive business-level email notification when an automatic participant reminder is actually sent: it identifies the Signing and recipient but does not expose document contents or protected security metadata. The reminder is still recorded in Signing history and delivery records. If that reminder's delivery fails, the existing sender-delivery-failure notice applies. Former agents with read-only historical access and brokerage administrators do not receive duplicate reminder emails by default, but authorized brokerage administrators may review the business history and current status.

Agents, co-agents, and brokerage administrators see understandable business impact such as delayed finalization or delivery failure; raw technical diagnostics, credential-abuse signals, and security metadata remain system-administrator-only.

**Reason:**
The agent needs confirmation that the approved reminder workflow is actively helping move the transaction forward. Technical responders need earlier, richer signals without exposing security details or creating unnecessary recurring email for every historical viewer.

**Consequences:**

* Automatic reminder sends create an email notice to the active primary agent and co-agents.
* Business notifications remain email-only; SMS is not introduced.
* System monitoring remains distinct from participant and business-facing notification content.
* Exact alert thresholds, anomaly rules, monitoring provider, email copy, suppression/deduplication, and escalation schedule remain technical design.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Signing operations expose approved recovery controls without direct evidence editing** (2026-09-14); **Signing reminders, sender notifications, and requested completion dates use email only** (2026-09-06)
* No SQL migration; no schema change

---

## Signing operations expose approved recovery controls without direct evidence editing

**Date:** 2026-09-14

**Decision:**
The Signing operations experience is role-scoped and limited to approved actions. Primary agents, co-agents, and brokerage administrators see business-level status, documents, participant progress, deliveries, and history permitted by their existing authority. They may use approved business controls such as reminders/resends, credential revocation and replacement, reassignment, copy-recipient management, cancellation, and requesting a finalization retry.

Authorized system administrators additionally see protected technical diagnostics, work-item failure state, integrity-check results, and security metadata already restricted to that role. They may resume a failed finalization step or initiate the narrowly approved defect-remediation procedure. System-administrator tools remain server-authorized, attributable, and audited.

No operations screen permits direct editing of frozen documents, placements, events, artifacts, fingerprints, package revisions, or finalization results. It contains no manual **Complete** override. Operational actions request validated server processes that either satisfy the normal lifecycle/evidence requirements or fail visibly without changing the Signing.

**Reason:**
People need practical recovery and support controls without creating a backdoor that can alter evidence or let an administrative role substitute judgment for the completed Signing workflow.

**Consequences:**

* Business users receive only the controls already authorized by the Signing model.
* System administrators can diagnose and advance validated recovery work, but cannot rewrite or fabricate evidence.
* Every operational action remains attributable in Signing history or protected system audit as appropriate.
* Exact screen layout, role-query implementation, diagnostics, action confirmations, notification behavior, and RLS remain implementation design.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Signing access belongs to the originating brokerage and full-authority agents** (2026-09-06); **Finish Signing and finalization are idempotent, recoverable, and server-authoritative** (2026-09-08)
* No SQL migration; no schema change

---

## Native Signing requires security, integrity, recovery, and regression acceptance coverage before rollout

**Date:** 2026-09-14

**Decision:**
Native Signing cannot be enabled for real use until its staged implementation passes targeted acceptance coverage in addition to ordinary unit and integration tests. Required coverage includes authorization-bypass attempts; cross-Signing reference rejection; participant-link and completed-package-link scope, revocation, and replacement behavior; session expiry and invalidation; duplicate/retried request idempotency; participant/agent amendment races and stale locks; immutable artifact and event-chain verification; recoverable finalization failure; delivery retry behavior; backup/restore recovery-safe mode; and regression proof that existing packet forms, annotations, documents, and legacy lifecycle behavior remain unchanged.

Acceptance tests must use disposable data and isolated storage/communications where possible. No test may send a real participant communication, expose raw credentials, or mutate production evidence without an explicitly approved, narrowly scoped production validation plan. Production enablement follows successful development validation and confirms the live schema, storage policies, server-side authority boundaries, background work configuration, and feature-gate state.

**Reason:**
The Signing feature depends on coordinated database, storage, authentication, rendering, background work, and delivery behavior. A normal happy-path test cannot establish that evidence survives failures or that direct/browser access cannot bypass the ceremony.

**Consequences:**

* Security, race, integrity, recovery, and regression checks are release requirements—not optional later hardening.
* Development and production validation remain deliberately separated.
* Existing packet behavior is a protected regression target during Signing rollout.
* Exact test commands, fixtures, mocks, production-smoke scope, and CI configuration remain implementation planning.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Native Signing implementation is additive, staged, and feature-gated** (2026-09-14); **Signing recovery preserves evidence and begins in a non-delivering safe mode** (2026-09-14)
* No SQL migration; no schema change

---

## Native Signing implementation is additive, staged, and feature-gated

**Date:** 2026-09-14

**Decision:**
Native Signing is implemented through additive, forward-only migrations and a feature-gated rollout rather than a single replacement of existing packet-document behavior. The initial technical sequence is: isolated Signing tables and private artifact storage; trusted server-side authorization, integrity, and operational foundations; agent preparation and package-revision workflow; participant ceremony; finalization and artifact verification; then completion delivery, reminders, and administrative recovery controls.

Each stage is independently testable in development before controlled production enablement. The feature remains gated until its required database constraints, storage policies, server operations, integrity checks, and recovery behavior are validated. Existing packet forms, annotations, generated-document behavior, and the unused `SIGNED`/`VOID` packet-form lifecycle values remain unchanged during this implementation sequence. Any later change to those legacy values requires the separately approved dependency/data audit and its own forward migration.

No migration rewrites existing packet documents or attempts to convert historical packet state into Signing evidence. Native Signings begin as new records with their own immutable versions, artifacts, events, credentials, and access model.

**Reason:**
Signing is a new evidentiary workflow, not a cosmetic extension of the existing editable packet-document model. Staging limits blast radius, makes each security boundary testable, and avoids retroactively assigning signing meaning to historical records that never followed the new ceremony.

**Consequences:**

* Signing launches behind a controlled feature gate after isolated development validation.
* Schema, storage, server authority, ceremony, finalization, and delivery are introduced in a deliberate dependency order.
* Existing packet behavior and legacy lifecycle values are not silently repurposed.
* No historical packet record is converted into a native Signing.
* Exact migration files, rollout audiences, feature-flag mechanism, test plans, production checks, and deployment order remain implementation planning.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Native e-signature is a planned in-app packet workflow** (2026-08-16); **Packet Form Document Lifecycle** (2026-07-17); **Signing writes are server-authoritative and link/session access is narrowly scoped** (2026-09-14)
* No SQL migration; no schema change

---

## Signing evidence is retained indefinitely unless an authorized disposition policy requires removal

**Date:** 2026-09-14

**Decision:**
Signing evidence has no automatic deletion or expiration policy at launch. Completed and retained non-completed Signings, immutable artifacts, events, identity snapshots, delivery history, and associated evidence remain available indefinitely under the approved access rules unless a later authorized legal or records-retention policy requires disposition.

Any future disposition process first disables recipient access, browser access, and pending delivery/work; checks applicable legal holds; and operates on the complete Signing evidence set rather than orphaning child records. It preserves a minimal, non-document disposition audit identifying the authority, policy basis, scope, timing, and outcome. Agents and ordinary brokerage administrators do not receive a general Signing-evidence deletion capability.

This decision does not choose a legal retention period, jurisdictional rule, legal-hold provider, or actual disposal mechanism. It establishes that later legal requirements must be implemented as an explicit, auditable policy rather than as ordinary product cleanup.

**Reason:**
Signing evidence is long-lived transaction history. Automatic cleanup or routine user deletion could undermine access, auditability, and recoverability; a future legal obligation to remove records must nevertheless be handled deliberately and cohesively.

**Consequences:**

* The default is indefinite evidence retention with no automatic purge.
* Any later removal disables access first and respects legal holds.
* Future disposition addresses a whole coherent evidence set and records a minimal audit without retaining the removed documents themselves.
* Ordinary agents and brokerage administrators cannot delete Signing evidence.
* Exact policy authority, legal-hold model, disposition scope, backup treatment, storage erasure, audit retention, and jurisdictional requirements remain legal/technical design.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Signing evidence survives source-record changes and requires audited defect remediation** (2026-09-14); **Signing recovery preserves evidence and begins in a non-delivering safe mode** (2026-09-14)
* No SQL migration; no schema change

---

## Signing recovery preserves evidence and begins in a non-delivering safe mode

**Date:** 2026-09-14

**Decision:**
Signing evidence is backed up as a coherent database-and-artifact set. Recovery validation checks that restored artifacts match their stored SHA-256 fingerprints and that restored event histories verify through their protected-key chain. Restore testing is a required operational capability; a backup that has not been restored and verified is not treated as sufficient evidence protection.

Any restored environment begins in a recovery-safe mode. Browser sessions, participant credentials, completed-package credentials, and background delivery/finalization work are disabled until an authorized administrator has completed the recovery review and deliberately re-enabled safe operation. A restored environment must not silently send email, resume reminders, process finalization, or reactivate a link that had been revoked after the backup point.

Recovery procedures preserve the distinction between the authoritative production environment and isolated restore testing. A test restore never sends participant communications or becomes a source of Signing evidence. Any production recovery follows a documented, auditable procedure that reconciles restored state, credential revocation state, pending work, and artifact integrity before normal operation resumes.

**Reason:**
Immutable evidence is only useful if it can be recovered and verified. A naïve rollback could otherwise resurrect revoked links, stale sessions, queued emails, or partial work—creating a security incident while attempting to recover from another incident.

**Consequences:**

* Database and artifact backup/restore planning is one Signing-evidence responsibility.
* Fingerprint and event-chain verification are required recovery checks.
* Restored systems are non-delivering and non-authorizing until explicit recovery activation.
* Restore testing remains isolated from live participant communications and evidence.
* Exact backup provider, frequency, recovery objectives, replicated-storage design, credential-reconciliation mechanism, recovery runbook, and monitoring remain operational/technical design.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Signing artifacts and events receive verifiable cryptographic integrity evidence** (2026-09-14); **Signing background work is durable, scoped, and revalidated on every retry** (2026-09-14)
* No SQL migration; no schema change

---

## Signing background work is durable, scoped, and revalidated on every retry

**Date:** 2026-09-14

**Decision:**
**`signing_work_items`** is the durable Signing-scoped outbox for work that cannot safely depend on one web request: artifact rendering, finalization, integrity verification, email delivery, automatic reminders, credential/session cleanup, and other approved retryable operations. Each item identifies its Signing, work type, idempotency record, required record references, processing/lease state, retry schedule, safe diagnostic information, and server-managed timestamps. It never stores raw credentials, secrets, or document content.

A worker may claim and retry eligible work, but every attempt revalidates current Signing state, authority, revision, artifact, and idempotency conditions. A work item is an operational instruction, not authority to mutate evidence or force a lifecycle outcome. Finalization work cannot mark a Signing Complete until the already approved artifact and integrity requirements are actually met. Delivery work cannot alter the Signing outcome. Meaningful result events and delivery attempts remain in their dedicated evidence/history records rather than relying on mutable work-item state.

Expired worker claims become eligible for safe retry under server control; a crashed worker cannot leave work permanently locked. Retries reuse the associated idempotency result where applicable and must not generate duplicate artifacts, events, or emails.

**Reason:**
Email providers, rendering, storage, and integrity checks can fail or outlast an interactive request. A durable outbox permits recovery without treating a transient worker as the source of truth or allowing it to bypass evidence requirements.

**Consequences:**

* Finalization and delivery can resume after restart, timeout, or provider failure.
* Workers receive narrowly scoped record references, not broad Signing authority or bearer secrets.
* Expired worker claims do not create permanent operational locks.
* Durable evidence remains in Signing artifacts, events, and delivery attempts—not mutable queue state.
* Exact work-type vocabulary, worker provider, payload schema, lease duration, retry/backoff policy, failure escalation, observability, and retention remain technical design.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Signing operations use scoped idempotency records for safe retries** (2026-09-14); **Finish Signing and finalization are idempotent, recoverable, and server-authoritative** (2026-09-08)
* No SQL migration; no schema change

---

## Signing operations use scoped idempotency records for safe retries

**Date:** 2026-09-14

**Decision:**
**`signing_operation_idempotency`** records a client or worker operation that may be retried. Each record binds one Signing, operation type, authenticated actor or participant scope, client-generated request identity, and canonical request fingerprint to its processing state and accepted result references. It applies to placements, Finish Signing, reminders, credential replacement, amendment promotion, finalization steps, and delivery attempts.

When the server receives the same operation identity with the same authenticated scope and request fingerprint, it returns or continues the original outcome instead of performing the action again. Reuse of that identity with a different actor/participant scope or different request content is rejected. Idempotency records are server-validated; a browser cannot use an arbitrary request identifier to access another actor's previous result.

Idempotency is operational support for durable actions, not a substitute for evidence. The accepted placement, event, artifact, delivery attempt, or other resulting record remains the authoritative historical fact. The idempotency record links retries to that result and may retain processing/failure state long enough to safely recover interrupted work under later retention rules.

**Reason:**
Networks, browsers, workers, and email providers can retry after an ambiguous timeout. Binding a request identity to both actor scope and canonical content prevents duplicate legal actions while also preventing a reused identifier from becoming an authorization shortcut.

**Consequences:**

* Repeated clicks and reconnect retries return the same result instead of creating duplicate placements, events, artifacts, jobs, or emails.
* A reused request ID with altered content is a safe rejection, not a new mutation.
* Idempotency records support recoverable in-progress and failed operations without becoming the Signing's evidence source.
* Exact request-ID format, fingerprint canonicalization, processing-state vocabulary, result-reference columns, retention, cleanup, and transaction mechanics remain technical design.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Finish Signing and finalization are idempotent, recoverable, and server-authoritative** (2026-09-08); **Signing writes are server-authoritative and link/session access is narrowly scoped** (2026-09-14)
* No SQL migration; no schema change

---

## Signing uniqueness constraints enforce one current fact where the workflow requires it

**Date:** 2026-09-14

**Decision:**
The database and trusted transactions enforce the approved one-of-a-kind workflow facts, rather than relying on browser timing or application convention alone. These include one event sequence number per Signing; one package-revision number per Signing; one occurrence of a logical document and one display position within a package revision; one effective accepted placement per signer field; one valid amendment lock per Signing; one current participant Signing credential per participant; one current completed-package credential per recipient; and one current-primary-agent association pointer per Signing.

Revoked, replaced, removed, superseded, or historical rows remain retained where required by the evidence model. “One current” therefore means that a partial/conditional uniqueness rule distinguishes the active fact from its retained history; it does not mean old evidence rows are deleted. Concurrent requests must either produce the same already-established result through idempotency or cause one conflicting request to be rejected cleanly.

**Reason:**
The model has several facts for which ambiguity would create incorrect access, conflicting documents, duplicate evidence, or an unclear authority holder. Database-backed uniqueness is the last line of defense when requests race.

**Consequences:**

* The system cannot create two current revisions, placements, credentials, locks, or primary-agent assignments where the workflow allows only one.
* Historical replacement and revocation evidence remains visible without competing with the current row.
* A concurrency conflict becomes an explicit, recoverable outcome rather than a silently inconsistent Signing.
* Exact partial-index predicates, pointer constraints, deferred validation, error codes, and transaction details remain technical design.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Every Signing child relationship remains within its one parent Signing** (2026-09-14); **Finish Signing and finalization are idempotent, recoverable, and server-authoritative** (2026-09-08)
* No SQL migration; no schema change

---

## Every Signing child relationship remains within its one parent Signing

**Date:** 2026-09-14

**Decision:**
Every document, version, package revision, revision snapshot, participant, field, adopted mark, placement, artifact, credential, delivery instruction, agent association, lease, lock, and event must resolve to one and the same parent Signing. No child relationship may mix records from different Signings.

In particular, a package-revision document must pair a logical document and immutable document version from the revision's Signing; a revision-participant snapshot must originate from that Signing's participant; a signer field must join a document and assigned participant from the same package revision; a placement must match its field and participant; and a completed artifact must identify the frozen revision and, when document-specific, the exact document version from that Signing. Credentials, browser sessions, deliveries, leases, locks, and events likewise cannot cross into another Signing through a referenced participant, artifact, or agent association.

The database enforces same-Signing relationships through composite keys/foreign keys wherever practical. A trusted server transaction performs an equivalent verification for relationships that cannot be represented directly by a database constraint. No browser request may choose a cross-Signing reference merely by supplying an identifier.

**Reason:**
A superficially valid foreign key is not enough if two child rows can belong to different transactions. Same-Signing integrity prevents accidental data mixing and blocks a class of authorization and evidence-corruption defects.

**Consequences:**

* Every participant-facing package, placement, artifact, credential, and event has one unambiguous Signing scope.
* Cross-Signing IDs supplied by a client or stale worker are rejected before any state or evidence changes.
* Foreign keys and transaction-time validation share responsibility for the invariant.
* Exact composite-key shapes, constraint declarations, deferrability, error handling, and index definitions remain technical design.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Promoted package revisions are complete, immutable, and atomically actionable** (2026-09-14); **Signing writes are server-authoritative and link/session access is narrowly scoped** (2026-09-14)
* No SQL migration; no schema change

---

## Promoted package revisions are complete, immutable, and atomically actionable

**Date:** 2026-09-14

**Decision:**
Each `signing_package_revision` is a complete immutable snapshot of the Signing configuration that participants may act upon: every included document version and display name, every revision-participant snapshot, every signer-field assignment and geometry, and every relevant preparation setting. A revision is never a partial patch layered on top of a prior revision.

The first promoted revision is the initial package and is created only at Signing activation (**Send for Signature** or **Begin In-Person Signing**), not during ordinary Draft preparation. Each permitted amendment creates the next monotonically numbered revision for that Signing, identifies its predecessor, and carries the approved amendment reason/note. Promotion atomically creates the complete child snapshot set, validates it, advances `signings.current_package_revision_id`, appends the corresponding event, and releases the amendment lock. If any part fails, the prior revision remains wholly current and actionable.

A later package revision may reuse unchanged immutable `signing_document_version` rows for logical documents whose exact prepared PDF did not change; see **Package revisions may reuse unchanged Signing document versions** (2026-09-15). Reuse does not make a revision partial, and it never mutates earlier revisions.

Once promoted, a revision and its snapshot rows are read-only. The root `signings` pointers alone identify the current actionable revision and, after the first accepted signature or initial, the permanently frozen revision. A freeze prevents any later package-revision promotion. Superseded revisions remain retained for history but cannot be acted upon by participants or silently reactivated.

**Reason:**
Participants must never receive a mixed package assembled from documents, participants, or fields that were saved at different times. Complete atomic revisions establish one canonical version for review and signing while preserving all prior permitted preparation history. Separating Draft preparation from the first promotion keeps private setup mutable until activation.

**Consequences:**

* Every participant-facing package can be reproduced from one revision and its child rows.
* Failed amendments leave the preceding package intact rather than partially updated.
* A later revision cannot modify an earlier revision's documents, assignments, or labels.
* The first accepted signature or initial freezes one complete package, not a collection of separately current records.
* Unchanged document versions may be cited by multiple revisions of the same Signing Document.
* Exact validation queries, unique constraints, pointer-cycle implementation, transaction mechanics, and indexes remain technical design.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **The `signings` row holds only workflow-wide current state** (2026-09-14); **Draft Signing creation establishes mutable preparation state; package revisions freeze at activation** (2026-09-15); **Package revisions may reuse unchanged Signing document versions** (2026-09-15); **Pre-signature amendments use an exclusive agent lock and retain participant links** (2026-09-05)
* No SQL migration; no schema change

---

## The `signings` row holds only workflow-wide current state

**Date:** 2026-09-14

**Decision:**
The root `signings` row holds only the current state and durable provenance of the overall workflow: originating brokerage, optional source Packet, immutable original-sender snapshot, current-primary-agent association pointer, user-facing title, lifecycle outcome, internal finalization condition, current and frozen package-revision pointers, sender timezone, optional requested completion date, reminder settings, and relevant server-managed timestamps.

The requested completion value is a sender-local calendar date for communication and Overdue display, not a legal deadline or a stored lifecycle outcome. Overdue remains derived from current Signing state and that requested date. Internal finalization conditions remain distinct from participant-facing lifecycle labels and cannot directly override a Signing to Complete.

`signings` does not contain document lists, participant identity/fields, completed placements, generated artifacts, access credentials, delivery records, agent history, or event history. Those facts stay in their dedicated child tables. The root row's pointers identify current actionable package state efficiently; they do not replace the immutable revision history.

**Reason:**
Keeping the root row focused makes current workflow state fast to authorize and display without duplicating detailed or historical data. It also prevents one wide, mutable row from becoming the accidental source of truth for document evidence, participants, or audit history.

**Consequences:**

* Workflow-wide current state is explicit and efficient to read.
* The public lifecycle and internal finalization condition remain separate.
* Overdue is derived and non-terminal.
* Child tables remain authoritative for their respective detailed and historical facts.
* Exact column names, defaults, nullability, pointer-constraint implementation, timestamp details, and indexes remain technical design.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Working Signing data model records workflow, revisions, documents, participants, placements, artifacts, and events separately** (2026-09-10); **Signing lifecycle distinguishes setup, active signing, completion, decline, and cancellation** (2026-09-05)
* No SQL migration; no schema change

---

## Signing tables use stable identifiers, controlled vocabularies, and relational core data

**Date:** 2026-09-14

**Decision:**
Durable Signing-domain rows use UUID primary keys and UUID foreign keys, consistent with the application's existing externally meaningful records. The one exception is `signing_events`, which uses a server-assigned bigint sequence for efficient, definitive ordering within a Signing; that sequence is never inferred from client time or client input. Every durable row carries the project's standard server-managed creation and update timestamps where it has mutable current state; immutable evidence rows retain the relevant creation/acceptance time without being routinely updated.

Lifecycle, role, field-type, artifact-category, credential-scope, delivery-purpose, and other controlled vocabulary values are stored as readable text and restricted by database `CHECK` constraints. Their permitted values expand only through additive, version-controlled migrations; an existing value's meaning is never repurposed. Lookup tables are not used merely to hold fixed historical vocabulary.

Core relationships, identity snapshots, timestamps, lifecycle state, authority, document lineage, package composition, credentials, and access scope are expressed as ordinary typed columns and foreign keys. JSONB is limited to sanitized, supplemental structured details such as safe provider diagnostics or event metadata; it must not be the authoritative location for a relationship, permission decision, lifecycle state, or data required to validate Signing integrity. Browser-controlled JSON is sanitized before persistence and never contains secrets or raw tokens.

**Reason:**
The model needs stable, non-guessable durable references; a reliable event order; readable historical values; and database-enforceable relationships. Keeping core facts out of flexible metadata makes later authorization, auditing, and integrity checks dependable.

**Consequences:**

* UUIDs identify durable Signing records; event sequence establishes authoritative order.
* Controlled values are readable in evidence rows and expand through reviewed migrations rather than mutable catalogs.
* Required domain facts remain relational and constraint-ready instead of being hidden in JSON.
* JSONB remains supplementary, sanitized, and non-authoritative.
* Exact individual column names, lengths, defaults, `CHECK` expressions, index definitions, timestamp trigger strategy, and migration order remain technical design.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Working Signing data model records workflow, revisions, documents, participants, placements, artifacts, and events separately** (2026-09-10); **Signing events, credentials, deliveries, agents, locks, and package revisions have separate responsibilities** (2026-09-08)
* No SQL migration; no schema change

---

## Signing artifacts use private immutable storage and server-mediated downloads

**Date:** 2026-09-14

**Decision:**
Prepared PDFs, completed PDFs, audit certificates, and optional combined-package PDFs use a dedicated private Signing-artifact store rather than the ordinary editable/generated-document storage path. Each artifact receives an opaque object key independent of document title, participant name, email address, or other personally meaningful values. Once verified, an artifact object is never overwritten in place; a changed artifact is a different artifact with a different key and fingerprint.

Browser clients do not receive direct general access to the Signing-artifact store. The server validates the caller's current authority or recipient credential, then grants only a short-lived, artifact-specific download authorization. The recipient's long-lived completed-package link remains non-expiring unless deliberately revoked; it is an application-level credential, not a permanent storage URL. Each use can therefore be rechecked and link revocation immediately blocks future downloads while retaining the immutable artifact.

Only trusted server-side operations may create, verify, or access Signing artifact objects. Object keys, artifact fingerprints, and the database artifact row remain linked, and verified objects are protected against ordinary browser update or deletion. Storage access, replacement, remediation, and later lawful deletion must preserve the approved evidence and no-cascade rules.

**Reason:**
Signing artifacts have materially different immutability, access, and long-term evidence requirements from working packet documents. A private store with server-mediated, short-lived file authorization protects recipient documents without shortening the recipient's approved long-lived access link.

**Consequences:**

* Non-expiring recipient links remain usable until explicitly revoked; only the internal file authorization is short-lived.
* Completed-material revocation stops future access without rewriting or deleting the completed files.
* Artifact object names do not disclose transaction or recipient information.
* Browser clients cannot directly overwrite, list broadly, or delete Signing artifacts.
* Exact bucket name, object-key format, storage provider controls, short-link duration, download headers, encryption/key-management configuration, storage relocation, and lawful deletion procedure remain technical design.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Signing artifacts and events receive verifiable cryptographic integrity evidence** (2026-09-14); **Signing writes are server-authoritative and link/session access is narrowly scoped** (2026-09-14); **Completed Signings preserve separate documents and provide one Signing-wide audit certificate** (2026-09-06)
* No SQL migration; no schema change

---

## Signing artifacts and events receive verifiable cryptographic integrity evidence

**Date:** 2026-09-14

**Decision:**
Every immutable prepared PDF, completed PDF, audit certificate, and optional combined-package PDF receives a SHA-256 fingerprint of its exact stored bytes. The fingerprint is retained with the corresponding `signing_document_versions` or `signing_artifacts` row and verified during finalization. An authorized administrator may later request an integrity verification that recomputes the fingerprint from stored bytes and reports the result without changing the artifact.

Each Signing event participates in a server-generated, per-Signing chain. The event's canonical immutable content, its sequence, and the prior event digest determine a current event digest; a protected server-held signing key produces a keyed authentication value for that digest. The event retains the prior digest, current digest, key identifier, and authentication value needed for later verification. Events are ordered by their server-assigned Signing sequence, not timestamp alone. Key material never resides in ordinary database rows, browser code, event metadata, or audit certificates.

Finalization verifies the frozen package's artifact fingerprints and the event chain through the finalization boundary before the Signing can become Complete. Later integrity checks may verify the complete retained artifact set and event chain. A basic database-only hash chain is not represented as independently tamper-proof; protected-key verification gives stronger evidence against an ordinary privileged database rewrite. External timestamp anchoring, third-party notarization, and public ledger anchoring are deferred unless later legal or business requirements justify their operational complexity.

**Integrity mismatch behavior (`SHA-256(stored bytes) != recorded SHA-256`):**

* **Preserve the original integrity record.** Never silently replace the expected/recorded fingerprint with the hash of whatever bytes currently exist in Storage. Never overwrite history to make a mismatch appear valid.
* **The artifact becomes untrusted, not invisible.** Authorized agents and authorized administrators may still be permitted to view or download the affected stored artifact, but the UI/download flow must clearly indicate that integrity verification failed and the file no longer matches the version recorded by Harbaugh Forms. Exact warning copy and UI are not settled here.
* **Evidence-producing use fails closed.** A document/artifact with a known integrity mismatch must not be used for activation/package promotion, participant signing, finalization, certificate generation, completed-evidence generation, or any other operation that would treat the artifact as verified Signing evidence.
* **Administrator visibility and remediation.** Integrity failures require administrator visibility. Administrators should eventually be able to inspect the affected file and integrity metadata. Integrity remediation must be explicit and auditable, and must preserve the originally recorded evidence/history. Do not create a simple "accept current file" mechanism that rewrites the original fingerprint. Exact admin UI and recovery mechanics are not designed here.
* This decision does **not** claim that an independently protected comparison copy of artifact bytes currently exists unless and until implementation actually provides one. Present integrity verification recomputes against the stored object and compares to the retained fingerprint.

**Reason:**
Exact document fingerprints identify the bytes presented and completed. A protected-key event chain makes a later alteration of event history materially more detectable than timestamps and database constraints alone, while retaining a practical implementation footprint. When stored bytes diverge from the recorded fingerprint, the original evidence claim must remain visible as failed rather than being quietly rewritten to match whatever remains in Storage.

**Consequences:**

* SHA-256 is the approved document-fingerprint algorithm for Signing artifacts.
* Event history is chained and authenticated by protected server-held key material rather than by a database-only digest alone.
* Integrity verification is a read-only check and finalization prerequisite, never a means of repairing or rewriting evidence.
* A known mismatch blocks evidence-producing Signing operations while still permitting clearly labeled authorized inspection/download.
* Remediation, if ever implemented, must append auditable history rather than overwriting the original fingerprint.
* The product does not overstate its integrity evidence as absolute proof against a fully compromised system or as legal notarization.
* Exact canonical encoding, protected-key service, key rotation/retention, authentication-tag format, verification-job design, mismatch alerting, external anchoring, and operational monitoring remain technical design.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Signing events, credentials, deliveries, agents, locks, and package revisions have separate responsibilities** (2026-09-08); **Each Signing document preserves prepared and completed immutable artifacts** (2026-09-06); **Package revisions may reuse unchanged Signing document versions** (2026-09-15)
* No SQL migration; no schema change

---

## Signing writes are server-authoritative and link/session access is narrowly scoped

**Date:** 2026-09-14

**Decision:**
The server is the final authority for every Signing write. Browser clients—including ordinary agents, brokerage administrators, and participants—must not directly create, alter, or delete evidence-bearing Signing records. Trusted server-side operations validate current authority, lifecycle, credential/session eligibility, package revision, and required lock/lease conditions before atomically updating current state and appending history.

Participant access remains scoped to one participant and one Signing. The raw emailed link token is used only to establish or resume eligible ceremony access; it is stored only as a hash and is never treated as a User identity. After entry, the service establishes a new server-controlled session with a secure, HttpOnly browser credential and redirects to a clean Signing route so the bearer token does not remain in the displayed URL, browser navigation, or referrer. Tokens and session secrets must be excluded from application logs, analytics, error reports, and event metadata.

Every participant request derives its participant and Signing scope from the validated credential/session, never from client-supplied participant, user, or Signing identifiers. The server rechecks revocation, participant status, Signing state, current package revision, session expiry, and any amendment lock before accepting a placement, identity affirmation, consent, Finish Signing, or other action. Sessions expire after approved inactivity and are invalidated when their originating credential, participant, or Signing becomes ineligible. Browser state-changing requests require the applicable origin and anti-forgery protections; rate limiting and anomaly logging apply without exposing technical metadata to ordinary users.

Email-only access intentionally retains one irreducible risk: a person who obtains an active bearer link may be able to use it as its participant. The approved design mitigates that risk with strong unguessable tokens, token-hash storage, clean-route exchange, secret handling controls, short-lived sessions, scope checks, use logging, revocation, and replacement. It does not falsely represent the **I am [Name]** affirmation as independent identity proof or claim that email-link-only access can make stolen-link use impossible.

Agents, co-agents, brokerage administrators, and system administrators are also authorized by trusted server-side operations rather than browser-supplied role assertions. Brokerage authority is re-evaluated from the originating brokerage's current authorized membership; historical Signing access rules remain as already approved. Only authorized system administrators may access protected technical security metadata or initiate the limited defect-remediation process.

**Reason:**
Signing evidence cannot rely on a browser honestly reporting who is acting or what state it observed. Server-derived scope, secret hygiene, session invalidation, and transaction-time validation protect against direct database writes, session fixation, confused-deputy requests, stale sessions, and routine bearer-token leakage while preserving the deliberately low-friction email-only ceremony.

**Consequences:**

* The browser is never the authority for actor identity, participant identity, Signing scope, package revision, or mutable evidence state.
* A valid login or administrator role does not by itself grant access to a participant ceremony or its saved signature; explicit Signing scope remains required.
* Link revocation immediately invalidates derived sessions and blocks later requests.
* The product documents email-link-only access accurately as a usability/security tradeoff, with a clear recovery path through revocation and replacement.
* Exact token construction, cookie/session protocol, anti-forgery mechanism, rate limits, anomaly thresholds, RLS expressions, security-monitoring provider, and implementation details remain technical design.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Signing credentials, copy recipients, and browser sessions use separate scoped tables** (2026-09-14); **Signing evidence survives source-record changes and requires audited defect remediation** (2026-09-14); **Remote participants use emailed links with explicit identity confirmation** (2026-09-06)
* No SQL migration; no schema change

---

## Signing evidence survives source-record changes and requires audited defect remediation

**Date:** 2026-09-14

**Decision:**
No evidence-bearing Signing record may be removed through an ordinary application action or a database cascade. This includes the Signing, its document and package-revision snapshots, participants and identity snapshots, agent associations, signer fields, adopted marks, placements, generated artifacts, credentials, delivery records, and immutable events. Foreign-key actions from a User, Contact, Packet, Packet Form, membership, or similar mutable source must never cascade into Signing evidence.

When a live source record is later deleted, deactivated, or changed, the Signing preserves its own snapshots and historical references. Where a live association can no longer remain valid, the reference may be cleared or marked unavailable without removing the historical Signing evidence. Removing a participant revokes future access but retains their prior actions and history. Normal application deletion remains recoverable/status-based rather than hard deletion; an unsent Draft may follow its separately approved recoverable-discard behavior.

A genuine system defect may require correction of erroneously created Signing records. That is a narrow system-administrator remediation path, never ordinary agent or brokerage administration. It must identify the defect and affected records, preserve a durable remediation event and before/after evidence, and quarantine or mark the faulty record as erroneous rather than silently erasing it. Temporary browser sessions, expired presence leases, and expired amendment locks are operational state—not signing evidence—and may be automatically cleaned up under later retention rules.

**Reason:**
Historical Signing evidence must not disappear because a source record is cleaned up, an association changes, or a user action reaches a related parent row. At the same time, the system needs a controlled response if a defect creates records that never represented a valid Signing action.

**Consequences:**

* Signing foreign keys must use restrictive, nullifying, or equivalent preservation behavior—not cascading deletion—for evidence-bearing relationships.
* Snapshot data remains readable even when its originating live record no longer exists.
* Participant removal, credential revocation, and recoverable discard alter future availability without rewriting evidence.
* Defect remediation is privileged, attributable, and auditable; it never becomes a general-purpose evidence-delete feature.
* Exact foreign-key actions, remediation authority, quarantine representation, temporary-row retention, lawful deletion policy, and RLS remain technical design.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Signing current state is explicit and changes are preserved as immutable events** (2026-09-06); **Signing agent associations preserve permanent history while separating current authority** (2026-09-14)
* No SQL migration; no schema change

---

## Signing presence leases and amendment locks are temporary, server-expiring concurrency records

**Date:** 2026-09-14

**Decision:**
Participant activity and agent amendment exclusion use separate temporary tables under server-time control.

* **`signing_participant_presence_leases`** records a short renewable presence lease for an active participant browser session. It identifies the Signing, participant, browser session, acquisition, most recent renewal, and server-calculated expiry. Any valid lease blocks acquisition of an amendment lock. A browser close, sleep, network failure, or missed renewal cannot leave a permanent block because only the server-calculated expiry determines validity.
* **`signing_amendment_locks`** records the one exclusive amendment lock for a Signing. It identifies the Signing, eligible primary-agent or co-agent association holding it, the expected current package revision, acquisition, expiry, and release facts. It may be acquired only when the Signing is In Progress, no accepted signature or initial exists, no valid participant presence lease exists, and no valid amendment lock already exists.

Every amendment write must establish that the amendment lock is still valid, belongs to the acting agent association, and names the expected current package revision. An expired or stale editor cannot save. Participants cannot enter or act while a valid amendment lock exists. Administrative clearing is allowed only for a demonstrably stale lock and appends an event; ordinary lease renewals, releases, and expirations are disposable operational records rather than immutable legal events.

**Reason:**
The product must maintain one canonical immutable package while allowing participants to resume after disconnection. Server-expiring leases prevent concurrent amendment and signing without relying on a browser's cooperation to relinquish a lock.

**Consequences:**

* A participant actively signing prevents pre-signature amendment; a valid amendment lock temporarily prevents participant activity.
* No orphaned browser session or agent editor can permanently block the Signing.
* An amendment promotion remains conditional on the same package revision for which the lock was granted.
* Operational heartbeat data stays out of the permanent legal-event history except for meaningful administrative intervention.
* Exact lease duration, renewal interval, cleanup retention, lock-secret design, database exclusion mechanism, transaction primitives, indexes, and RLS remain technical design.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Pre-signature amendments use an exclusive agent lock and retain participant links** (2026-09-05); **Signing agent associations preserve permanent history while separating current authority** (2026-09-14)
* No SQL migration; no schema change

---

## Signing agent associations preserve permanent history while separating current authority

**Date:** 2026-09-14

**Decision:**
**`signing_agent_associations`** records each primary-agent or co-agent relationship to a Signing. Each row identifies the Signing and agent, preserves the agent identity snapshot, records whether the person acts as the primary agent or co-agent, records its effective period, and retains the actor and reason for its addition, removal, or reassignment. Association rows are never deleted merely because the agent leaves the brokerage, changes brokerages, loses eligibility, or stops managing an unfinished Signing.

`signings.current_primary_agent_association_id` identifies the one association with current primary-agent authority. The original sender remains immutable on `signings`; reassignment changes the current-primary pointer and records the resulting association history without rewriting who originally sent the Signing. Ending management authority records when and why it ended, but does not remove the original or co-agent's permanent read access to the Signing's documents and business-level history.

An active co-agent association grants the same management authority as the current primary agent; no granular role or permission matrix exists. Current management authority additionally requires the person's current eligibility under the originating brokerage's applicable membership/sponsorship/license rules. Brokerage administrators are deliberately not copied into `signing_agent_associations`: their authority remains dynamically derived from current administrator membership in the originating brokerage.

**Reason:**
The people who originated or handled a transaction must remain historically identifiable and retain approved read access, while authority to amend, send, cancel, or manage an unfinished Signing must stop promptly when current brokerage eligibility ends. One association history allows both without treating a live membership record as the sole historical evidence.

**Consequences:**

* Every primary or co-agent relationship is attributable, dated, and retained.
* Primary-agent reassignment is an explicit, auditable change of current authority, not a rewrite of sender history.
* Co-agents remain all-or-nothing peers of the primary agent while eligible and active.
* Brokerage-administrator access continues to be derived, avoiding copied rows that could become stale.
* Exact association-state vocabulary, membership/license validation, foreign-key actions, indexes, RLS, and reassignment workflow remain technical design.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Signing access belongs to the originating brokerage and full-authority agents** (2026-09-06); **Working Signing data model records workflow, revisions, documents, participants, placements, artifacts, and events separately** (2026-09-10)
* No SQL migration; no schema change

---

## Signing delivery instructions and attempts preserve every email outcome separately from workflow state

**Date:** 2026-09-14

**Decision:**
Email delivery uses one durable request table and one append-only attempt table.

* **`signing_delivery_instructions`** records one request to send a particular purpose of message to exactly one Signing participant or copy recipient. It preserves the recipient's delivery snapshot, purpose (such as invitation, automatic or manual reminder, completed package, cancellation, or decline notice), current applicable credential, frozen package revision and artifacts when applicable, initiator, and current delivery state. An invitation or reminder uses the participant's current Signing credential; a completed-package instruction uses the separate completed-package credential. A later resend or reminder is a new instruction, not an overwrite of an earlier one.
* **`signing_delivery_attempts`** records each provider submission or outcome for one instruction: ordered attempt number, provider reference, attempt time, accepted/delivered/failed/bounced outcome where known, safe provider failure details, and retry relationship. Attempts append forever; a retry never replaces an earlier failure.

Delivery instructions and attempts do not determine Signing lifecycle or change frozen evidence. A failed invitation, reminder, or completed-package email is operationally visible and retryable, but cannot decline, cancel, reopen, or reverse a Signing. A completed-package instruction identifies the frozen revision and its individual completed PDFs plus Signing-wide certificate; the optional combined package remains supplemental.

**Reason:**
The intent to notify a recipient and the provider's individual delivery attempts are different facts. Separating them provides a durable audit trail for automatic reminders, agent-initiated reminders, resends, bounces, and later copy recipients without making the email provider the authority on whether a Signing is complete.

**Consequences:**

* Every invitation, reminder, final delivery, cancellation notice, and resend has a clear initiating record.
* Reminders reuse the approved current participant link; they do not silently create replacement links.
* Failed or bounced attempts remain historical and may be retried without duplicating the underlying Signing action.
* Delivery state remains operational state, distinct from the Signing's lifecycle and immutable artifacts.
* Exact purpose vocabulary, provider fields, attachment-size policy, retry scheduling, suppression rules, recipient-artifact selection, indexes, constraints, and RLS remain technical design.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Signing credentials, copy recipients, and browser sessions use separate scoped tables** (2026-09-14); **Completed Signings preserve separate documents and provide one Signing-wide audit certificate** (2026-09-06)
* No SQL migration; no schema change

---

## Signing credentials, copy recipients, and browser sessions use separate scoped tables

**Date:** 2026-09-14

**Decision:**
Remote ceremony access, completed-material access, and temporary browser state use distinct physical records with non-overlapping authority.

* **`signing_participant_credentials`** stores one or more participant-specific Signing-link records for a `signing_participant`. It stores only a strong token hash—not the raw emailed token—plus issuance, first-use, last-use, revocation, replacement, and issuer facts. A current link remains usable until the participant is removed, the credential is revoked or replaced, or the Signing becomes terminal. A permitted pre-signature amendment does not replace a retained participant's current link.
* **`signing_copy_recipients`** stores a recipient who receives completed materials but has no Signing access or signer fields. Email is required; name, role, User association, and Contact association remain optional. The row preserves who added it and when and may be created after completion without reopening or changing the Signing.
* **`signing_completed_package_credentials`** stores a separate strong token hash for read-only completed-material access. Each record belongs to exactly one `signing_participant` or one `signing_copy_recipient`, never both, and retains issuance, access, revocation, replacement, and issuer facts. It does not automatically expire but may be revoked and replaced. It cannot grant access to an active Signing ceremony.
* **`signing_browser_sessions`** stores only temporary, server-controlled ceremony state created after a valid participant credential and the required **I am [Name]** affirmation. It identifies the participant and originating participant credential and retains affirmation, creation, last-activity, expiry, and termination facts. It never stores a raw browser secret, never substitutes for the participant credential, and becomes ineligible when that credential, participant, or Signing becomes ineligible.

The database must enforce scope separation: a participant credential cannot be used as a completed-package credential, a completed-package credential cannot enter the Signing ceremony, and a browser session cannot outlive or bypass its originating participant credential. Shared email addresses remain distinct because credentials and sessions attach to recipient rows, not to email as an identity key. The later 2026-09-14 delivery-table decision keeps sending work separate from access authority.

**Reason:**
An emailed invitation, a long-lived completed-package link, and a short-lived browser session have different purposes, expiry rules, and security consequences. Separate tables and foreign keys make those boundaries visible and enforceable instead of relying on a generic token row and application convention.

**Consequences:**

* Only hashes of bearer and browser secrets are retained.
* Link replacement and revocation preserve prior access history without reusing or changing credentials.
* Adding a copy recipient later affects delivery entitlement only, never Signing eligibility or frozen evidence.
* Browser sessions are disposable runtime state; the durable credential and the Signing's authoritative progress remain intact after inactivity or disconnection.
* Exact token algorithm/entropy, session-secret transport, session-retention period, rate limits, indexes, foreign-key actions, RLS, and delivery-provider details remain technical design.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Working Signing data model records workflow, revisions, documents, participants, placements, artifacts, and events separately** (2026-09-10); **Remote participants use emailed links with explicit identity confirmation** (2026-09-06); **Completed copies are emailed without login and copy recipients remain addable** (2026-09-06)
* No SQL migration; no schema change

---

## Working Signing data model records workflow, revisions, documents, participants, placements, artifacts, and events separately

**Date:** 2026-09-10

**Decision:**
The following is the approved working relational model for native Signings. It records the table boundaries and relationships needed for later implementation; it does not authorize a migration or settle every column type, index, constraint, trigger, or access policy.

* **`signings`** is the central workflow row. Its approved workflow-wide responsibility is refined by the later 2026-09-14 root-row decision. A Signing does not carry a single document foreign key because one Signing may contain many documents.
* **`signing_documents`** is the Signing-owned logical-document row. It links to `signings`, retains provenance for the selected working Packet Form, and remains the same logical contract or addendum across permitted revisions. Under the 2026-09-15 hybrid Draft-source-snapshot model, Draft inclusion also captures a Signing-owned **Draft source snapshot** of the selected persisted source state; that preparation state is distinct from later immutable `signing_document_versions`. Exact Draft-snapshot representation remains technical design / Stage 4 where not yet implemented.
* **`signing_document_versions`** contains the immutable prepared PDF versions of one `signing_document`, including ordered version lineage, supersession relationship, the package revision that introduced it, creation reason, source snapshot, prepared-artifact storage reference, and fingerprint. A completed signed PDF is not a replacement version in this table. Later package revisions may reuse an unchanged version of the same logical document; they must not overwrite it or invent cross-document deduplication by hash alone.
* **`signing_package_revisions`** records each successfully promoted, whole-package configuration. It has a monotonic revision number per Signing, predecessor reference, initial/amendment reason, immutable amendment note where applicable, promoter snapshot, and promotion time. Private, incomplete Draft preparation is not itself a package revision; Package Revision 1 is created only at activation. `signings.current_package_revision_id` names the one actionable revision; after the first accepted signature or initial, `signings.frozen_package_revision_id` pins it and must identify that same revision.
* **`signing_package_revision_documents`** binds each package revision to its exact `signing_document` and immutable `signing_document_version`. It preserves display order, the frozen document display name used by participants, filenames, and completed delivery, and a source-title snapshot. A later Packet Form rename never rewrites this record.
* **`signing_participants`** records the durable person-in-the-workflow, including current participant status, optional User and Contact associations, and current identity/consent/finish/decline state. Email is not unique and neither association is required. **`signing_package_revision_participants`** freezes the participant name, email, optional role, order, and relevant identity association snapshot for one package revision. Signer assignments refer to that revision-specific participant snapshot.
* **`signing_fields`** records each immutable Signature, Initials, or system-generated Date Signed location on one package-revision document. It includes the assigned revision participant, required/optional status, page and geometry, and the linked Signature field when it is an automatic date. Participants never receive editable text, selection, or manual-date fields through this model.
* **`signing_adopted_marks`** preserves each participant's Signing-scoped signature or initials adoption, including typed or drawn representation, adoption/lock times, and an optional source User-preset reference. **`signing_field_placements`** records every accepted use of an adopted mark in a field: server acceptance time, rendered sender-local date when applicable, accepted/removed/replaced disposition, replacement relationship, and an idempotency identity. A field can have only one effective accepted placement at a time, without erasing earlier activity.
* **`signing_artifacts`** stores immutable generated outputs rather than placing completed PDFs on document versions. Artifact categories are separate completed-document PDFs, the one Signing-wide audit certificate, and an optional combined-package PDF. Every artifact identifies its Signing and frozen package revision; a completed document additionally identifies its document version. It retains storage reference, fingerprint, size/page facts, frozen filename, generation/verification times, audit-history sequence boundary where relevant, and idempotency reference. Recipient-specific certificate variants remain Signing-wide certificates, not per-document certificates.
* **`signing_events`** is an append-only event stream with a server-assigned per-Signing sequence and server UTC time. It uses a project-conventional sequence identifier, carries readable literal event and actor types, actor identity snapshot, visibility, relevant optional references (revision, participant, document version, field, or placement), summary/structured details, and an idempotency identity. Event and actor values are controlled by the eventual table definition rather than an editable lookup catalog; later values are additive, forward-only migrations and existing meanings are never repurposed.

Access credentials, copy recipients, temporary browser sessions, delivery instructions/attempts, agent-association history, participant-presence leases, and amendment locks are defined by later 2026-09-14 decisions.

**Reason:**
The Signing needs one authoritative workflow root, while its documents, frozen package composition, participant snapshots, requested locations, accepted marks, outputs, and historical actions answer different questions and change on different schedules. Explicit foreign-key relationships prevent a later Packet edit, document rename, participant edit, or artifact generation step from silently rewriting the evidence presented during the Signing.

**Consequences:**

* A many-document Signing is modeled through child rows, not a document foreign key on `signings`.
* One activated package revision can be reproduced from its document and participant snapshot rows; only an atomically promoted revision becomes actionable.
* The source Packet Form label and the Signing display name are distinct; the revision snapshot controls what participants and completed deliveries see.
* Prepared versions, completed artifacts, current workflow state, and immutable events have separate storage responsibilities.
* Remaining table-design decisions cover exact foreign-key actions, indexes, constraints, append-only enforcement, RLS, storage layout, and migration sequencing.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Core Signing records separate workflow, documents, versions, participants, fields, and placements** (2026-09-08); **Signing events, credentials, deliveries, agents, locks, and package revisions have separate responsibilities** (2026-09-08)
* No SQL migration; no schema change

---

## Core Signing records separate workflow, documents, versions, participants, fields, and placements

**Date:** 2026-09-08

**Decision:**
The core Signing model uses distinct durable concepts rather than collapsing the workflow into one record.

* A **Signing** is the overall workflow and owns its originating brokerage, agent associations, lifecycle, settings, participants, documents, deliveries, and current package revision.
* A **Signing Document** is one logical document within that Signing, such as a contract or addendum. It remains the same logical document across permitted pre-signature revisions and remains separately deliverable.
* A **Document Version** is one exact immutable prepared PDF for one Signing Document. One version is current at a time; superseded versions remain retained. The separately stored completed PDF is a final artifact of the exact prepared version that was signed, not an editable revision.
* A **Signing Participant** is one person acting across the Signing and may sign or initial several documents. Shared email addresses never merge participants. User and Contact references remain optional associations rather than identity keys.
* A **Signer Field** is an instruction assigned to exactly one participant at one page/location on one exact Document Version. Its type is Signature or Initials and it is required by default unless deliberately made optional. The automatically generated Date Signed is a linked system field associated with a Signature field and is not participant-editable.
* An **Adopted Mark** preserves the exact signature or initials appearance adopted for this Signing. A **Placement** is one server-accepted use of that mark in an assigned Signer Field. A reusable User preset is copied into the Signing as an immutable snapshot and is never referenced as mutable source content.

Participant current status is explicit and limited to Pending, Started, Finished, Declined, or Removed at the product/domain level. Current identity-confirmation, consent, required-field completion, Finish Signing, link, completion, and decline state is stored directly while corresponding meaningful changes remain events. Participant identity and associations freeze at the first accepted signature or initial as already approved.

Each placement identifies its participant, Signer Field, adopted mark, exact Document Version, server-accepted UTC time, and current accepted/removed/replaced disposition. Removing or replacing a placement before Finish Signing changes current state without erasing prior events. The preserved Date Signed value uses the sender timezone at signature acceptance and is never recalculated from later settings.

Every Signer Field belongs to exactly one prepared version and cannot silently carry to a replacement PDF. A pre-signature amendment creates the needed fields and assignments for the replacement version while retaining the superseded version's records. Every participant must have at least one assigned Signature or Initials field; someone who only receives materials is a copy recipient. Pre-send validation rejects unassigned fields and provides the approved participant-by-participant summary.

This decision settles conceptual record boundaries, not physical table names, columns, enum types, indexes, storage formats, or RLS policies.

**Reason:**
Logical documents, immutable files, requested fields, adopted identity marks, and completed placements answer different evidentiary questions. Keeping them distinct preserves exact history across amendments, corrections, shared email addresses, reusable presets, and separately delivered documents.

**Consequences:**

* One Signing contains multiple logical documents, and each document may retain multiple immutable prepared versions.
* Participants belong to the Signing; fields and placements belong to the exact version on which activity occurs.
* Requested fields, current placements, and historical events remain separate concepts.
* Completed PDFs remain artifacts of the signed prepared version and never overwrite it.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Signing current state is explicit and changes are preserved as immutable events** (2026-09-06); **Each Signing document preserves prepared and completed immutable artifacts** (2026-09-06)
* No SQL migration; no schema change

---

## Signing events, credentials, deliveries, agents, locks, and package revisions have separate responsibilities

**Date:** 2026-09-08

**Decision:**
Each Signing Event is append-only and receives a server-assigned sequence within its Signing in addition to a server UTC timestamp. Events preserve an actor type and identity snapshot, event type, related Signing concepts, structured change details, and participant/business/system-administrator visibility. Actors may be the primary agent, co-agent, brokerage administrator, participant, system administrator, or Harbaugh Forms process. Sequence—not timestamp alone—defines authoritative order. Current-state changes and their events commit together atomically.

Event and actor types are stored on each event as stable, human-readable literal values, rather than only as references to editable lookup rows. The eventual database definition may constrain those values to an approved vocabulary. New values are added only through a forward-only, version-controlled schema migration before a feature emits them; an existing value's meaning is never repurposed. A material behavioral change receives a new event type instead. This makes each historical event understandable without joining to a mutable catalog while allowing the vocabulary to grow when a real later need is identified.

Neither a constraint nor a lookup table alone proves that its definition was never changed. Evidence for vocabulary changes instead comes from immutable migration history, source-control and release history, and restricted production schema-write access. Event sequence and any later tamper-evident event-chain design protect the event records themselves; they do not by themselves prove that the surrounding schema definition was never modified.

Initial implementation prioritizes append-only enforcement, strict access, server sequencing, atomic state changes, and prepared/completed document fingerprints. The later 2026-09-14 integrity decision selects SHA-256 artifact fingerprints and a protected-key-authenticated per-Signing event chain; external anchoring remains deferred. The resulting evidence must not be described as independently tamper-proof against a fully compromised system.

Long-lived access and temporary runtime state remain separate:

* A **participant access credential** belongs to one participant, permits only that Signing ceremony while eligible, and is independently revocable and replaceable.
* A **completed-package credential** belongs to one participant or copy recipient, permits only read access to that recipient's completed materials, does not expire automatically, and is independently revocable and replaceable.
* A **browser session** is temporary state created after valid entry and identity affirmation, ends after the approved inactivity period, and never replaces the underlying emailed credential.

Only token hashes are stored; raw bearer tokens exist in recipient links. Every meaningful request revalidates the credential, participant, Signing status, package revision, and amendment state. Signing and completed-package credentials are never interchangeable.

Copy recipients, delivery instructions, and delivery attempts remain distinct. A copy recipient requires only email and never affects Signing completion. An instruction records the entitled recipient, artifacts, delivery method, initiator, and purpose. Every provider attempt records its result and retry relationship; retries append attempts rather than overwriting failures. Signing participants use the same delivery machinery for mandatory completed copies without being duplicated as copy-recipient records.

Agent history and current authority also remain distinct. Every Signing preserves immutable originating brokerage and original sender identity plus a current primary agent and explicit co-agent associations. Agent associations retain identity snapshots, effective periods, authority-ending reasons, and add/remove/reassignment actors. Brokerage-administrator authority derives from current administrator membership in the originating brokerage rather than copying every administrator onto each Signing. Reassignment changes current authority without rewriting origin or historical actions.

Concurrency uses short renewable **participant-presence leases** and an exclusive **amendment lock**. No lease or lock is permanent or depends on a browser releasing it. Server time controls expiration; browsers can renew but cannot create unlimited duration. Crashes, sleeping devices, lost networks, and abandoned tabs naturally expire. A stale agent editor cannot save after losing its lock. Administrative clearing is limited to demonstrably stale locks and is audited. Heartbeat renewals are disposable operational data rather than immutable legal history.

Each activated Signing has a monotonically increasing **package revision** representing the complete canonical combination of document versions, participants, identity snapshots, signer fields, assignments, and relevant preparation settings. Initial Draft configuration—including each document's selected Draft source snapshot—is privately prepared and atomically promoted as Revision 1 when Send or Begin In-Person Signing activates the Signing through the common activation algorithm. Each successfully saved eligible amendment creates the next revision. Participant links target the Signing and resolve its one authoritative current revision. The first accepted signature or initial permanently pins that revision. Older revisions remain preserved but not actionable.

Amendment promotion atomically validates the lock and prior revision, creates replacement artifacts and assignments, creates the new package revision, advances the current pointer, appends events, and releases the lock. Failure leaves the prior revision fully current; participants never observe a partially promoted package.

This decision settles responsibilities and invariants, not exact token entropy, lease intervals, event payload schemas, provider fields, database names, RLS expressions, hashing implementation, or transaction primitives.

**Reason:**
Credentials, sessions, delivery work, agent authority, locks, and package revisions have different lifetimes and security properties. Separating them prevents bearer links from becoming sessions, failed email attempts from rewriting history, stale editors from changing canonical files, and partial amendments from exposing mixed versions.

**Consequences:**

* Signing-specific sequence numbers establish definitive event order.
* Event and actor vocabularies remain controlled but extensible through additive, reviewable migrations; historical literal values and their meanings are never rewritten or repurposed.
* Raw access tokens are not stored and credential scopes cannot cross between signing and completed delivery.
* Delivery retries and authority changes remain fully historical.
* All locks expire safely, and only one whole package revision can be promoted atomically.
* The basic model can support stronger tamper evidence later without overstating initial guarantees.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Signing access belongs to the originating brokerage and full-authority agents** (2026-09-06); **Remote participants use emailed links with explicit identity confirmation** (2026-09-06); **Pre-signature amendments use an exclusive agent lock and retain participant links** (2026-09-05)
* No SQL migration; no schema change

---

## Finish Signing and finalization are idempotent, recoverable, and server-authoritative

**Date:** 2026-09-08

**Decision:**
A participant-facing field appears completed only after the server confirms the placement. During connectivity uncertainty it displays Saving or Not saved rather than false success. Finish Signing is unavailable while any placement remains unconfirmed. The server always validates authoritative required-field state regardless of browser state.

Every meaningful mutation—including placement, Finish Signing, reminder, link replacement, amendment promotion, finalization step, and delivery attempt—uses an idempotency identity appropriate to that operation. Repeated clicks, reconnect retries, browser retries, and infrastructure retries return or continue the original result rather than creating duplicate placements, events, dates, artifacts, jobs, or emails. A participant may have only one effective Finish Signing result.

After an unexpected disconnect, the browser reloads authoritative server progress before allowing completion. Pending placement requests may safely retry with their original identities. If a request was accepted but its response was lost, the accepted result reappears without duplication. If it never reached the server, the field remains incomplete. On later entry, the participant is explicitly told that the previous session ended before all activity was confirmed, that confirmed work remains preserved, and how many required signatures or initials remain; the experience resumes at the first incomplete field. If Finish Signing already succeeded, re-entry shows the read-only finished state.

When the last required participant finishes, participant work locks immediately, but the Signing becomes Complete only after all required individual completed PDFs and the Signing-wide certificate are rendered, stored, fingerprinted, verified, and connected to the frozen package revision. Finalization has internal Pending and Failed conditions without adding new user-facing lifecycle outcomes. Participants cannot resume signing or agents amend the frozen package while finalization is pending or failed.

Finalization is stepwise, deterministic, and resumable. Automatic retries handle recoverable failures. Verified successful artifacts and steps are reused rather than discarded or regenerated inconsistently. The primary agent, co-agents, and brokerage administrators see a delayed-finalization condition; authorized system administrators receive technical diagnostics. A brokerage administrator may request Retry Finalization, and a system administrator may resume from the failed step. Recovery cannot edit documents or signatures, skip required artifacts, manufacture events, or override the Signing directly to Complete.

Only verified artifact finalization changes the Signing to Complete. Email delivery follows completion, so delivery failure never reverses or blocks the completed outcome.

This decision settles failure semantics and integrity requirements, not queue technology, retry schedule, job names, idempotency-key format, administrative screens, monitoring provider, or finalization implementation.

**Reason:**
Networks and browsers fail at ambiguous moments. Server confirmation, idempotency, authoritative resynchronization, and resumable finalization prevent duplicate legal events, false completion, discarded Signings, and permanent failure after participants have irreversibly submitted their work.

**Consequences:**

* A local click never substitutes for server-accepted Signing state.
* Duplicate requests are safe, and reconnecting participants receive accurate remaining-work guidance.
* Participant completion is preserved even when artifact generation temporarily fails.
* Administrators can move the existing finalization process forward but cannot bypass evidentiary requirements.
* Delivery remains operationally separate from legal-artifact completion.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Finish Signing is the participant's irreversible completion boundary** (2026-09-06); **Each Signing document preserves prepared and completed immutable artifacts** (2026-09-06)
* No SQL migration; no schema change

---

## Signing current state is explicit and changes are preserved as immutable events

**Date:** 2026-09-06

**Decision:**
A Signing maintains explicit current-state records for what is true now and a separate append-only event history explaining how it reached that state. The event stream is not the sole source from which the application must reconstruct current state.

Signing-owned current state includes the lifecycle outcome, originating brokerage, primary agent and co-agents, participants and frozen identity snapshots, active immutable document versions, signer-field assignments and completion, participant Finish Signing status, current participant and completed-package links and revocation state, reminder settings, requested completion date and derived Overdue condition, copy recipients and current delivery state, and temporary amendment/session-presence state where needed for concurrency. Explicit current state supports reliable authorization, validation, status display, and efficient application loading.

Every meaningful change also creates an immutable historical event. Events include Signing creation and amendment, document-version replacement, participant and assignment changes, invitations and reminders, delivery results, document opening/review, identity affirmation, electronic-signature consent, signature and initials placement/removal/replacement, participant completion, decline, cancellation, reassignment, link revocation/replacement, completed-copy delivery, and relevant administrative access. Ordinary application use cannot edit or delete historical events. Technical security events may use the same chronological model while retaining the stricter system-administrator visibility already approved.

The Signing's own records are authoritative for its workflow state and frozen history. Existing Users, profiles, brokerage memberships and roles, Contacts, Packets, editable packet documents, reusable User signature/initials presets, and any license/sponsorship eligibility source may initialize values or establish present authority, but later changes to those external records do not rewrite frozen Signing identity, document, placement, or event history. Current external eligibility may still remove authority to manage an unfinished Signing under the separate ownership decision.

Audit certificates are generated from preserved Signing events and immutable artifacts, not browser logs or later reconstruction from mutable documents. Current-state values and event insertion must remain consistent at every accepted action; the exact transactional enforcement is technical design.

**Reason:**
Current-state records answer what is true now without replaying an entire history, while immutable events answer how and when it changed. Treating either alone as sufficient would make ordinary operation unnecessarily complex or leave evidentiary gaps.

**Consequences:**

* Signing records—not Contacts, editable documents, or the event stream alone—are authoritative for active Signing state.
* Meaningful actions update authorized current state and append permanent history together.
* External records may initialize or validate a Signing but cannot retroactively rewrite its frozen evidence.
* The audit certificate has durable source evidence rather than inferred activity.
* No table names, columns, enum values, triggers, RLS policies, or transaction primitives are selected by this decision.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Native e-signature uses one working packet form, many immutable versions, and a dedicated signing experience** (2026-08-19); **Completed Signings preserve separate documents and provide one Signing-wide audit certificate** (2026-09-06)
* No SQL migration; no schema change

---

## Each Signing document preserves prepared and completed immutable artifacts

**Date:** 2026-09-06

**Decision:**
Each document in a Signing preserves three distinct evidentiary components:

1. The **prepared document version** is the exact immutable PDF presented to participants, with agent-entered contractual content and elections already rendered.
2. **Signing activity** preserves the assigned signature/initial locations, accepted placements, corrections, automatic dates, participant actions, and related events associated with that prepared version.
3. The **completed document** is a separately stored immutable PDF with accepted signatures, initials, and automatic dates rendered into it.

The prepared PDF and completed PDF each receive a reliable cryptographic fingerprint. The completed artifact never overwrites the prepared artifact. Harbaugh Forms stores the exact bytes required for both and does not depend on later reconstruction from mutable packet data, current annotations, fonts, rendering code, or external records.

A permitted pre-signature amendment creates a new prepared immutable version and retains every superseded prepared version and its relevant history. The current prepared version becomes permanently fixed when the first signature or initial is accepted. Completion renders and stores the final document from that fixed version and its accepted Signing activity. Every document remains an individual completed PDF under the separate delivery decision.

This decision settles the artifact chain and preservation requirement, not table names, storage paths, object keys, hash algorithm, rendering pipeline, deduplication, encryption, retention machinery, or final database constraints.

**Reason:**
Harbaugh Forms must be able to demonstrate both the exact document presented for signature and the separate final document produced from accepted signing activity. Preserving exact immutable bytes avoids trying to reproduce historical evidence later with code, fonts, data, or document state that may have changed.

**Consequences:**

* Prepared and completed PDFs are separate immutable artifacts with separate fingerprints.
* Signing activity remains associated with the exact prepared version against which it occurred.
* Superseded pre-signature versions remain retained and auditable.
* Completion never destroys or replaces the participant-presented source artifact.
* Storage optimization may be considered later only if it preserves every Signing-specific identity and evidentiary relationship.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Draft Signing creation establishes mutable preparation state; package revisions freeze at activation** (2026-09-15); **Creating a Signing snapshots the working document without requiring Final** (2026-09-05, superseded for snapshot timing); **Completed Signings preserve separate documents and provide one Signing-wide audit certificate** (2026-09-06)
* No SQL migration; no schema change

---

## Signing access belongs to the originating brokerage and full-authority agents

**Date:** 2026-09-06

**Decision:**
Every Signing is permanently associated with the brokerage under which it was created. The primary agent is identified as the original sender. Brokerage administrators always have access to every Signing created under their brokerage because the agents act on behalf of that broker. Their access includes documents, participants, progress, complete business-level history, retained and completed artifacts, reminders and deliveries, copy recipients, link revocation/replacement, amendment, cancellation, and reassignment. Each administrative action identifies the administrator in append-only Signing history. Technical security metadata remains limited to authorized system administrators under the separate audit-certificate decision.

The primary agent or a brokerage administrator may explicitly add another active agent from the same brokerage as a co-agent. Co-agent access is intentionally all-or-nothing: an added co-agent has the same Signing authority as the primary agent, including preparing and amending documents, managing participants and signer fields, sending invitations and reminders, managing copy recipients, revoking or replacing links, cancelling the Signing, and viewing or distributing retained artifacts and business-level history. Harbaugh Forms will not create a granular co-agent permission matrix. A trainee or assistant who should not have full Signing authority is not added as a co-agent. Ordinary brokerage agents who are neither the primary agent nor an explicit co-agent do not receive Signing access merely from shared brokerage membership.

The original primary agent and co-agents retain permanent read access to Signings they handled, including documents, completed artifacts, and business-level history, even if they later leave the originating brokerage, change brokerages, lose sponsorship, or cease holding the required active license. The originating brokerage and its administrators also retain permanent access and control. A later brokerage never gains access to the earlier brokerage's Signings merely because an agent joins it. Historical records continue to identify the brokerage and agents involved when each action occurred, and reassignment never rewrites that history.

Historical access is distinct from authority to conduct an unfinished transaction. When a primary agent or co-agent leaves the originating brokerage, loses sponsorship, or no longer holds the required active license, that person immediately loses management authority over Draft and In Progress Signings from that brokerage. The person cannot prepare or amend documents, manage participants, send invitations or reminders, manage recipients, revoke links, cancel, or perform other Signing actions. The originating brokerage administrator may assign another eligible active agent to manage the unfinished Signing. The former agent retains read-only historical visibility, including later events after reassignment, but cannot act. Any exceptional transaction transfer between brokerages would require a separately designed, explicit, audited administrative process and must never occur automatically.

This decision establishes domain ownership and authority. It does not choose role-table names, membership snapshots, license-verification mechanics, reassignment columns, RLS policies, or cross-brokerage transfer implementation.

**Reason:**
The broker must be able to oversee transactions conducted by sponsored agents, and genuine co-agents ordinarily share full responsibility rather than operating under a complex custom permission scheme. At the same time, agents legitimately retain access to transaction records they handled and could already have downloaded. Preserving historical visibility while ending active management authority after sponsorship or license loss respects both realities and prevents continued transaction activity under a former brokerage.

**Consequences:**

* Brokerage administrators always have complete business-level access and management authority over their brokerage's Signings.
* Explicit co-agents have the same Signing authority as the primary agent; partial co-agent roles are not supported.
* Original agents and co-agents retain permanent read access to their Signing records.
* Departure or license/sponsorship loss removes authority over unfinished Signings but does not erase historical visibility.
* The originating brokerage retains the Signing; a new brokerage receives no inherited access.
* Brokerage administrators may reassign unfinished Signings to eligible active agents, with all changes audited.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Organization Data Isolation and Access**; **Signing participants may be linked or ad hoc, and all are eligible in parallel** (2026-09-05)
* No SQL migration; no schema change

---

## Decline and Cancel Signing are irreversible whole-workflow outcomes

**Date:** 2026-09-06

**Decision:**
A participant declines the entire Signing, not one document within it. Decline requires a clear confirmation because it immediately changes the Signing to the terminal **Declined** outcome and stops every participant from continuing. A decline reason is optional. The primary agent, co-agents, and brokerage administrators receive an immediate email that includes the participant's stated reason when one was supplied. The participant cannot reverse a decline, and the sender cannot reopen that Signing; continued transaction activity requires a new Signing. If a participant instead has a question or believes a document needs correction, the experience directs the participant to contact the sender rather than using Decline as a document-specific objection mechanism.

The primary agent, any co-agent, or a brokerage administrator may cancel a Draft or In Progress Signing. Cancellation requires explicit confirmation and a short audit-history reason. Cancelling immediately changes the Signing to the terminal **Cancelled** outcome, disables participant signing access, and stops reminders. Every invited participant receives a cancellation email, which may include a participant-safe explanation supplied by the cancelling agent. A Complete or Declined Signing cannot later be changed to Cancelled, cancellation cannot be undone, and continued activity requires a new Signing.

Decline and cancellation preserve immutable documents, prior signatures and initials, identity/consent records, deliveries, and append-only history, but those artifacts are not represented or automatically distributed as a completed package. The separate completed-artifact decision governs retained evidence and participant visibility. An unsent Draft on which no participant has relied may instead be discarded through the normal recoverable deletion process rather than creating a cancellation record.

This decision establishes whole-workflow semantics and authority, not status enum values, reason columns, email copy, deletion implementation, or event-table names.

**Reason:**
A Signing containing several documents is one coordinated request. Allowing a participant to decline only one document would create an ambiguous package whose completion meaning is unclear. Cancellation must also be explicit and auditable once participants may have relied on an invitation, while an entirely private unsent Draft does not need the same ceremony.

**Consequences:**

* One participant's confirmed decline ends the entire Signing for everyone.
* Decline reasons are optional; cancellation reasons are required for internal history.
* Only authorized primary agents, co-agents, or brokerage administrators may cancel.
* Complete, Declined, and Cancelled remain irreversible terminal outcomes.
* Sent Signings retain evidence; unsent Drafts may use recoverable discard instead.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Signing lifecycle distinguishes setup, active signing, completion, decline, and cancellation** (2026-09-05); **Completed Signings preserve separate documents and provide one Signing-wide audit certificate** (2026-09-06)
* No SQL migration; no schema change

---

## Signing participants use a focused, autosaving signature-and-initials ceremony

**Date:** 2026-09-06

**Decision:**
Participant links open a dedicated Signing experience rather than the ordinary Harbaugh Forms workspace. The experience may share the same application and services, but it does not expose Forms, Packets, Contacts, administration, or unrelated navigation. This remains true whether the participant continues without an account or optionally logs in.

The account-free path remains primary and requires the approved **I am [Participant Name]** affirmation. A participant who already has a Harbaugh Forms User account may optionally log in from the linked Signing page to use eligible account conveniences. Login is never required to sign. A reusable signature is offered only when the authenticated User is explicitly associated with that Signing participant; neither a matching email address nor a Contact association creates that link. If no explicit User association exists, the person may continue through the account-free path without exposing or silently associating an account signature.

A participant may interact with only assigned **Signature** and **Initials** fields, plus the approved system confirmations and actions such as identity affirmation, electronic-signature consent, decline, and Finish Signing. Date Signed is server-populated automatically through the approved signature/date pairing. Participants cannot complete or alter contractual text, checkboxes, radio choices, dropdowns, or manually entered dates. The agent prepares all contractual content and elections. Before participant access, agent-entered text, choices, dates, strikethroughs, and similar preparation content are rendered into the immutable document version; only assigned signature and initials locations remain interactive. A permitted pre-signature amendment produces a new immutable rendered version and participants review that replacement version from the beginning.

Every signature or initials field must be assigned to exactly one participant before sending. Unassigned signer fields block Send Signing. Signature and initials fields are required by default, although the agent may deliberately mark an individual field optional. Every signing participant must have at least one assigned signature or initials field; someone who only receives completed materials is a copy recipient instead. Before sending, the agent receives a participant-by-participant assignment summary for confirmation.

Signature and initials placements auto-save immediately when accepted by the server; there is no separate Save button. The interface clearly confirms success. A failed save remains visibly incomplete and offers retry rather than appearing saved locally. Only a successfully accepted server save counts as the first-placement freeze event. Saved placements and progress survive browser closure, disconnection, and session timeout. Returning participants resume at the first remaining incomplete assigned field, while retaining freedom to review every page and document.

The participant begins with a Signing and document overview. **Start Signing** goes to the first assigned field. After each successful save, navigation may advance to the next incomplete assigned field in document and page order, with visible completed/remaining progress. Harbaugh Forms does not force scrolling, impose artificial reading delays, or claim that such behavior proves every word was read. When all required fields are complete, the participant proceeds to the approved Finish Signing confirmation.

The emailed signing link remains valid for the active Signing unless revoked or the participant is removed. A browser signing session ends after 60 minutes without meaningful activity and warns the participant before timeout. Re-entry through the same link requires repeating the identity affirmation and preserves accepted work. Closing the page, losing connectivity, or timing out releases active participant presence promptly enough that an abandoned session cannot indefinitely block a permitted agent amendment. Exact heartbeat, lease, and session implementation remains technical design.

**Reason:**
The participant is agreeing to the final visible document, not editing its contractual terms. A focused ceremony, immutable prepared content, immediate authoritative saves, and clear assignment validation reduce accidental document changes and incomplete Signings while preserving a simple account-free experience.

**Consequences:**

* Participant document actions are limited to signatures and initials; Date Signed is automatic.
* Agent-prepared contractual content is flattened into each immutable version before participant access.
* Server-accepted placements survive interruption and resume without a separate save action.
* Signing links remain reusable during the active Signing; inactive browser sessions require renewed identity affirmation after 60 minutes.
* Every signer field has one participant, required-by-default behavior, and pre-send validation.
* The dedicated Signing experience never becomes ordinary application access merely because a participant logs in.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Remote participants use emailed links with explicit identity confirmation** (2026-09-06); **Finish Signing is the participant's irreversible completion boundary** (2026-09-06); **Pre-signature amendments use an exclusive agent lock and retain participant links** (2026-09-05)
* No SQL migration; no schema change

---

## Authenticated Users may keep one reusable signature and initials preset

**Date:** 2026-09-06

**Decision:**
An authenticated Harbaugh Forms User may optionally save one current signature and one current set of initials for future Signings. Each may be typed or drawn and may be replaced or deleted by that User. Multiple named signature styles and uploaded signature-image files are not part of the initial design.

A Contact is an address-book record, not an authenticated identity, and does not qualify for reusable-signature access. Account-free participants—including participants associated only with Contacts—adopt a typed or drawn signature and initials for the current Signing and may reuse them throughout that Signing only. Every adopted or placed mark remains preserved with that Signing's evidence, but an account-free adoption is not offered in another Signing.

Once a participant's first signature or initial is successfully accepted in a Signing, that participant's adopted signature and initials are locked for the remainder of that Signing. Before Finish Signing, the participant may remove or replace an individual placement as already approved, but the replacement uses the same adopted mark. The participant cannot switch typed/drawn style, change spelling or appearance, or select another preset midway through the Signing. Changing or deleting an account preset never changes an active or completed Signing. A materially incorrect locked adoption requires the sender to cancel and create a corrected Signing.

This decision establishes reusable-preset eligibility and consistency, not image encoding, encryption, storage location, rendering fonts, drawing format, or table names.

**Reason:**
Authenticated Users can safely receive the convenience of a reusable preset because Harbaugh Forms can verify the account entitled to retrieve it. Email addresses and Contact records are not unique authentication, so using either to expose a reusable signature could provide another person with an identity mark. Locking adoption after first use keeps one participant's appearance consistent across every document in the Signing.

**Consequences:**

* Saving a reusable preset is optional and limited to authenticated Users explicitly associated with the participant.
* Account-free and Contact-only participants adopt marks for one Signing only.
* One current signature and one current initials preset are supported initially; uploaded images and multiple preset styles are deferred.
* Preset replacement or deletion is prospective and never rewrites Signing evidence.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Signing participants may be linked or ad hoc, and all are eligible in parallel** (2026-09-05); **Remote participants use emailed links with explicit identity confirmation** (2026-09-06)
* No SQL migration; no schema change

---

## Signing progress uses email notifications, default daily reminders, and optional non-terminal due dates

**Date:** 2026-09-06

**Decision:**
The sender may see current Signing progress in Harbaugh Forms, including delivery, opened, signing started, participant finished, declined, failed delivery, and overall completion states. Sender email notifications are used for failed delivery, participant decline, each participant's completion, and overall Signing completion. The later 2026-09-14 monitoring decision adds an email notice to the active primary agent and co-agents when an automatic participant reminder is sent. Harbaugh Forms does not email the sender for every signature or initial. SMS is not part of the current Signing design because the product has no SMS infrastructure and the added provider cost and compliance work are not presently justified.

Automatic participant reminder emails are enabled by default. If a participant has not finished, the first reminder is sent 24 hours after the initial invitation and reminders continue every 24 hours while that participant remains incomplete. Reminders stop when the participant finishes, declines, is removed, or the Signing becomes Complete or Cancelled. The agent may change the schedule or turn automatic reminders off for a Signing.

The agent may send a manual reminder at any time. If a reminder was sent recently, Harbaugh Forms warns the agent but does not prevent the send. Every reminder includes that participant's current Signing link for immediate access. It reuses the existing link and does not create a replacement unless the prior link was revoked. Automatic and manual reminders and their delivery outcomes are append-only Signing history.

The agent may set an optional requested completion date. Without one, the Signing remains active until Complete, Declined, or Cancelled. Passing the requested date marks the Signing **Overdue** but does not cancel the Signing, invalidate links, or prevent continued signing. Reminder language may reference the requested date but must not call it a legal deadline or imply that Harbaugh Forms determines contractual timeliness.

This decision settles product behavior, not email templates, job scheduling, provider implementation, retry intervals, database representation, or notification-table names.

**Reason:**
Participants often overlook signing emails, so reminders should work without relying on the agent to enable them each time. Important outcomes deserve sender notification, while per-field email would create noise. An optional requested date helps agents communicate urgency without allowing software to terminate a transaction or claim legal authority.

**Consequences:**

* Signing notifications and reminders are email-only for now; SMS remains deferred.
* Daily reminders begin automatically after 24 hours and remain configurable per Signing.
* Agents retain an unrestricted manual reminder action after an informational recent-send warning.
* Every reminder carries the participant's current link and is auditable.
* Overdue is an informational condition, not a terminal status or automatic expiration.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Signing lifecycle distinguishes setup, active signing, completion, decline, and cancellation** (2026-09-05); **Remote participants use emailed links with explicit identity confirmation** (2026-09-06)
* No SQL migration; no schema change

---

## Void is rejected as a user-facing product status

**Date:** 2026-09-06

**Decision:**
Harbaugh Forms will not use **Void** as a user-facing Signing status or introduce it elsewhere as a general product status. Signing uses Draft, In Progress, Complete, Declined, and Cancelled; Overdue is informational rather than terminal. Superseded immutable versions remain historical versions rather than being called void.

Harbaugh Forms must not imply that it has legal authority to declare a contract or document invalid. If parties later terminate, replace, or amend an executed agreement, they do so through the appropriate transaction documents; Harbaugh Forms preserves the original Signing history. The existing unused `VOID` packet-form lifecycle value is a future dependency-audit and implementation-cleanup matter. Documentation approval alone does not authorize its schema removal or migration.

**Reason:**
Void is ambiguous to ordinary users and can carry a legal conclusion beyond the product's role. Cancelled, Declined, Complete, and superseded describe observable workflow facts more clearly without claiming legal validity or invalidity.

**Consequences:**

* No Signing action, label, or status uses Void.
* Existing approved Signing statuses remain sufficient.
* Any eventual removal of the unused underlying value requires a separate technical audit and forward migration.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Signing lifecycle distinguishes setup, active signing, completion, decline, and cancellation** (2026-09-05); **Packet Form Document Lifecycle** (2026-07-17)
* No SQL migration; no schema change

---

## Completed Signings preserve separate documents and provide one Signing-wide audit certificate

**Date:** 2026-09-06

**Decision:**
When a Signing becomes Complete, each included document is preserved and delivered as its own completed signed PDF. A combined package may also be offered for convenience, but it must never replace the separate completed documents. For example, a contract and its two addenda remain three separately downloadable signed PDFs.

Each completed Signing has one Signing-wide audit certificate, not a separate certificate for every document. The certificate identifies the Signing, sender, participants, and every included document, including a reliable fingerprint such as a cryptographic hash. It provides a durable, human-readable chronology of meaningful activity: delivery, document review, identity affirmation, electronic-signature consent, signature and initial placement with the affected document, participant completion, overall completion, and any relevant amendment, decline, cancellation, or later delivery activity. The durable certificate contains this history directly and does not depend solely on an online history link that may later be unavailable.

Recipient visibility is limited appropriately. The common Signing-level information may show the participant roster and high-level outcomes or milestones, while each recipient's delivered certificate may include a personalized **Your Activity** section with that recipient's detailed activity. A participant does not receive every other participant's detailed viewing or signing history. The sending agent may review the complete business-level Signing history. IP addresses, browser/device information, access tokens, internal identifiers, and similar technical security details do not appear in participant, copy-recipient, or ordinary agent certificate views; if collected, they remain protected system records available only to authorized system administrators.

Completed delivery uses email without requiring an account or login. The individual signed PDFs and audit certificate are attached directly when total message size permits. When reliable attachment delivery is not practical, the email provides an account-free download link to the same separate files. A combined PDF may be an additional convenience artifact only. Delivery failure does not undo Signing completion and may be retried.

Completed-package download links do not expire automatically. Each link is recipient-specific, strong and unguessable, access-logged, revocable, and replaceable. The completion email warns that possession of the link grants document access and that the recipient should protect it. An agent may revoke and replace a link believed to be exposed without changing the completed Signing or its immutable artifacts. Lawful deletion of the retained Signing records disables their links.

Completed documents and the Signing-wide certificate are retained indefinitely unless a later authorized legal or records-retention policy requires deletion. Email attachments remain recipients' independent copies. Agents may resend completed materials or add copy recipients later, and every later delivery is appended to history without reopening or modifying the Signing.

If a Signing is Declined or Cancelled before completion, Harbaugh Forms preserves its frozen documents and activity history but does not label or distribute them as completed documents. The agent receives the retained audit record. Participants receive notice that the Signing ended and may see their own activity history. Partially signed documents are not automatically distributed to all participants; an agent may deliberately export or share retained records when appropriate.

This decision establishes product behavior and evidence visibility. It does not choose storage paths, table or column names, token format, hash algorithm beyond the requirement for a reliable document fingerprint, email-provider implementation, attachment-size thresholds, or detailed retention/deletion machinery.

**Reason:**
Transaction documents must remain usable as individual records rather than being available only inside one merged PDF. A single Signing-wide certificate accurately describes one workflow spanning several documents, while personalized activity visibility gives each participant useful evidence without exposing other participants' detailed behavior. Durable recipient access reduces long-term retrieval friction; recipient-specific revocation provides an emergency off switch if a link is exposed.

**Consequences:**

* Separate completed signed PDFs are the primary artifacts; a combined PDF is optional and supplemental.
* One Signing-wide certificate covers all documents and includes a durable meaningful-event chronology.
* Participants see their own detailed activity, agents see complete business history, and technical security metadata remains system-administrator-only.
* Attachments are preferred when practical; otherwise recipients use account-free, non-expiring, revocable download links.
* Completed artifacts remain available for later resend and copy-recipient delivery, subject only to a later authorized retention policy.
* Declined or Cancelled Signings retain evidence but do not produce or automatically distribute a completed package.
* The existing rule remains unchanged that each Signing owns immutable versions of its documents; pre-signature amendments create replacement immutable versions while retaining superseded versions in history, and the first accepted signature or initial permanently freezes the current versions.
* No application code, schema, migration, storage, route, configuration, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Completed copies are emailed without login and copy recipients remain addable** (2026-09-06); **Remote participants use emailed links with explicit identity confirmation** (2026-09-06); **Pre-signature amendments use an exclusive agent lock and retain participant links** (2026-09-05)
* No SQL migration; no schema change

---

## Finish Signing is the participant's irreversible completion boundary

**Date:** 2026-09-06

**Decision:**
Before selecting **Finish Signing**, a participant may replace or undo that participant's own signatures or initials. Every placement, replacement, and removal remains represented in append-only signing history; a later action does not erase the earlier event.

A participant cannot finish until every required field assigned to that participant is complete. Optional fields may remain blank. **Finish Signing** requires a final affirmative confirmation that the participant intends to complete and submit their portion of the Signing. Once confirmed, that participant's work is locked. Returning through the participant's link shows a read-only completion experience and does not permit changes to completed signatures or other submitted actions.

A participant cannot independently withdraw or revise completed participation. If a correction is required after submission, the agent must cancel or otherwise terminate the Signing and create another one. Finishing one participant's portion does not prevent other participants from continuing. The overall Signing becomes Complete only when every required participant has finished. A participant may decline before finishing but cannot later convert completed participation into a decline.

This decision establishes participant-facing completion semantics, not event-table names, field-state columns, confirmation copy, or enforcement mechanisms.

**Reason:**
Participants need room to correct their own work before submission, while the system needs an unmistakable point after which their completed actions are evidentially stable. A separate Finish Signing confirmation provides that boundary without treating the first field placement as the participant's final approval of their entire portion.

**Consequences:**

* Pre-finish corrections are permitted only for the acting participant's own fields and remain auditable.
* Required-field validation gates Finish Signing; optional fields do not.
* Participant completion is irreversible within that Signing.
* The Signing completes only after all required participants finish.
* No application code, schema, migration, storage, route, or configuration change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Signing lifecycle distinguishes setup, active signing, completion, decline, and cancellation** (2026-09-05); **Pre-signature amendments use an exclusive agent lock and retain participant links** (2026-09-05)
* No SQL migration; no schema change

---

## Signature fields create optional paired dates; initials do not

**Date:** 2026-09-06

**Decision:**
During Signing preparation, placing a **Signature** field for a participant automatically creates a paired **Date Signed** field beside it. Before the Signing freezes, the agent may move, resize, or delete the paired date without affecting the signature field. Placing an **Initials** field creates only the initials field; it does not automatically create a date. The agent may separately add a Date Signed field where a form requires one near initials.

Participants may adopt typed or drawn signatures and initials. A retained paired date is populated automatically when the participant completes its associated signature field; the participant does not type or choose that date. Each signature, initial, and automatic date placement is associated with its signing activity and recorded individually. The first successfully accepted signature or initial remains the permanent Signing-freeze boundary established by the 2026-09-05 locking decision.

The authoritative event timestamp is recorded in UTC. The calendar date visibly rendered into the document uses the Signing sender's configured local timezone and is preserved as the rendered value associated with that event. It is the date of the corresponding signature action, not merely the later overall Signing-completion date.

This decision does not settle signature-image storage, font choices, drawing format, or event-table columns. Completed-document and Signing-wide audit-certificate behavior is settled separately by the later 2026-09-06 decision.

**Reason:**
Real-estate signature blocks ordinarily require a signing date, and automatically pairing the date with a signature reduces repetitive setup and participant mistakes. Initials commonly appear many times throughout a document and ordinarily should not produce a date beside every placement. Server-authoritative timestamps plus a preserved sender-local rendered date provide stable evidence across participant timezones.

**Consequences:**

* Signature placement defaults to a linked Signature plus Date Signed pair.
* Agents may remove the automatic date during preparation.
* Initials remain initials-only unless the agent deliberately adds a date.
* Automatic dates cannot be manually chosen by participants.
* Typed and drawn signature/initial adoption are in scope. A later 2026-09-06 decision permits one optional reusable signature and initials preset for authenticated Users; uploaded signature images remain deferred.
* No application code, schema, migration, storage, route, or configuration change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Pre-signature amendments use an exclusive agent lock and retain participant links** (2026-09-05); **Fill Form text layout, placement masks, and typed signature annotations** (2026-08-05)
* No SQL migration; no schema change

---

## Remote participants use emailed links with explicit identity confirmation

**Date:** 2026-09-06

**Decision:**
A remote signing participant accesses the signing experience through a strong, participant-specific emailed link. Harbaugh Forms does not require the participant to create an account, log in, enter an emailed or SMS one-time passcode, or complete multi-factor authentication. Possession of the participant-specific link is the access mechanism.

Before reviewing or signing documents, the participant must affirm **I am [Participant Name]** for the identity shown by that link. This is an explicit identity attestation and signing event; it is not represented as independent identity proof. The participant must separately consent to electronic records/signatures and adopt a signature or initials before placing them. A participant cannot switch identities through the signing UI. If the displayed identity is wrong, the participant must stop and contact the sender.

The same participant-specific link remains reusable while that participant retains access and the Signing remains In Progress. A timed-out browser session requires the participant to return through the link and repeat the identity confirmation, but does not require a new email. A retained participant may also reuse the same link after a permitted pre-signature amendment. Access is invalidated when the participant is removed or the Signing becomes Complete, Declined, or Cancelled. The sender may revoke and replace a link believed to be exposed.

An email address remains a delivery destination rather than a unique identity key. Participants sharing an inbox receive distinct participant-specific links, and authenticating or completing one link never authenticates or completes another participant.

This decision settles the baseline remote access experience and intentionally accepts the usability/security tradeoff of email-link-only access. A later 2026-09-06 decision keeps active-Signing links valid unless revoked and sets a 60-minute inactive browser-session timeout. Token format, entropy, storage, browser-session terminology, rate limits, heartbeat/lease mechanics, and revocation implementation remain technical design.

**Reason:**
Requiring accounts, OTP entry, SMS, or multi-factor authentication would create disproportionate friction for ordinary real-estate participants. Participant-specific links, explicit identity attestation, consent, signature adoption, immutable document versions, and detailed audit events provide a usable baseline while accurately avoiding a claim that email-link possession independently proves legal identity.

**Consequences:**

* Remote signing is account-free and does not use OTP or 2FA.
* Every remote signing entry requires an explicit I am confirmation before document access.
* Identity confirmation, electronic consent, and signature adoption are distinct affirmative actions.
* Links are participant-specific, reusable while valid, revocable, and replaceable.
* Exact temporary session and token design remains open under question D.
* In-person signing continues to use its supervised participant-handoff rules rather than remote email authentication.
* No application code, schema, migration, storage, route, or configuration change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Pre-signature amendments use an exclusive agent lock and retain participant links** (2026-09-05); **Signing participants may be linked or ad hoc, and all are eligible in parallel** (2026-09-05); **A Signing may be completed remotely or in person on a shared device** (2026-08-24)
* No SQL migration; no schema change

---

## Completed copies are emailed without login and copy recipients remain addable

**Date:** 2026-09-06

**Decision:**
When a Signing becomes Complete, every signing participant and every designated copy recipient receives the completed package by email. Recipients are not required to create an account or log in to retrieve the final copy. The later 2026-09-06 completed-artifact decision settles the delivery mechanism as direct attachments when practical and recipient-specific account-free download links otherwise.

A copy recipient is not a signing participant. A copy recipient has no signer fields or signing access and does not affect Signing eligibility, progress, or completion. Only the recipient's email address is mandatory. Name, descriptive role, User reference, and Contact reference are optional. Contact or User creation is never required, associations are never inferred from email, and shared email addresses do not merge recipients.

Copy recipients may be added without a time cutoff, including after the Signing is Complete. Adding a later recipient creates a new delivery instruction against the existing completed package; it does not modify the completed documents, reopen the Signing, or alter what anyone signed. Copy-recipient changes do not require the pre-signature amendment lock because they cannot alter the signing package. A prior delivery remains in immutable history even if its recipient entry is later corrected or removed.

Delivery attempts and results are append-only audit activity. A failed email does not prevent the Signing from becoming Complete and may be retried. Declined and Cancelled Signings do not automatically send a completed package; the agent may separately export or share retained records when appropriate.

This decision settles the copy-recipient domain behavior and delivery entitlement. The later 2026-09-06 completed-artifact decision also settles the product-level artifact, certificate, retention, and download-link behavior; table names, email-provider implementation, attachment thresholds, token implementation, and deletion machinery remain technical design.

**Reason:**
Signing participants are entitled to an accessible completed copy, and agents frequently need to distribute the same final package to attorneys, brokers, coordinators, or compliance recipients who should not be forced into the Contacts system or signing workflow. Later distribution must remain possible without mutating a terminal Signing or its immutable documents.

**Consequences:**

* Every signer and designated copy recipient receives the completed package by email without login.
* Email is the only required copy-recipient value; all other identity/context fields are optional.
* Copy recipients may be added and deliveries may be initiated indefinitely while the retained completed package remains available.
* Delivery status is separate from Signing completion and can be retried.
* Exact copy-recipient storage and delivery mechanics remain technical design, but open question E is resolved at the domain level.
* No application code, schema, migration, storage, route, or configuration change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Signing participants may be linked or ad hoc, and all are eligible in parallel** (2026-09-05); **Signing lifecycle distinguishes setup, active signing, completion, decline, and cancellation** (2026-09-05)
* No SQL migration; no schema change

---

## Pre-signature amendments use an exclusive agent lock and retain participant links

**Date:** 2026-09-05

**Decision:**
An In Progress **Signing** remains amendable until its first signature or initial is successfully accepted. Before opening a Signing for amendment, the server must atomically verify that the Signing is still active, no signature or initial event exists, no participant currently has the signing experience open, and no other amendment is active. If those checks pass, the agent receives an exclusive amendment lock.

While the agent holds that lock, participants cannot enter or act in the signing experience. A participant who follows an existing link is told that the sender is updating the Signing and should try again later. When the agent saves or cancels the update and the lock is released, retained participants may return through the same participant-specific links and see the current Signing. Adding or removing documents before the first signature does not by itself require replacement links because each link identifies a participant's access to the Signing rather than one fixed document revision.

Multiple participants may have the Signing open concurrently when no agent amendment lock exists. Any active participant signing experience blocks the agent from acquiring the amendment lock. “Open” means an active signing experience maintained by a renewable lease or heartbeat, not a link that was clicked sometime in the past or an abandoned browser tab. Locks must release on explicit exit and expire safely after inactivity or lost connection; exact timing and implementation remain technical design.

The first successfully accepted signature or initial permanently freezes the Signing's document set, participant roster, participant identity snapshots, and assigned signer fields. After that event, the agent cannot amend the Signing; a material correction requires ending it and creating another Signing. The server must validate Signing state, participant access, lock ownership, and the current package revision on every meaningful action, not only when a link first opens.

Concurrent agent and participant actions must be serialized without partial success. Whichever side first acquires the applicable server-side lock blocks the other. An accepted signature or initial is never discarded to allow a later amendment. If the agent acquires the amendment lock first, a participant action is rejected with the temporary-update message; if a participant is already active or the first signature/initial has been accepted, the agent cannot begin or save an amendment.

If a pre-signature amendment supersedes participant review, identity affirmation, consent, or other unsigned ceremony progress from an earlier package revision, that progress does not carry into the revised package. Relevant historical events may remain in the audit trail, but the participant resumes cleanly against the current package. Participants cannot enter dates, text, checkbox selections, or other contractual content in the Signing experience. Removing a participant revokes that participant's existing access; re-adding the person as a new participant requires new participant-specific access. Retained participants keep their existing links unless those links are revoked.

All participants may review every document in the Signing. Harbaugh Forms will not implement participant-specific document hiding.

This decision establishes locking and access semantics, not table names, lock durations, token formats, real-time transport, or concurrency primitives.

**Reason:**
An agent should be able to correct an already-sent Signing when nobody has started signing without rebuilding the workflow or redistributing links. Exclusive amendment access prevents a participant from reviewing or signing a package while it is changing, while reusable participant-specific links keep the recovery flow simple. Freezing at the first accepted signature or initial preserves the exact package against which legally meaningful signing activity began.

**Consequences:**

* Activation no longer freezes the Signing configuration by itself; the first accepted signature or initial is the permanent freeze boundary.
* Before that boundary, amendments require an exclusive agent lock and zero active participant signing experiences.
* Participant access uses renewable activity leases so abandoned tabs cannot block amendments indefinitely.
* Retained participants reuse their links after an amendment; removed participants lose access.
* Participants blocked by an active amendment may retry the same link after the lock is released.
* Superseded unsigned participant input does not carry into the revised package.
* Every participant may review every included document.
* No application code, schema, migration, storage, route, or configuration change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Signing participants may be linked or ad hoc, and all are eligible in parallel** (2026-09-05); **Signing lifecycle distinguishes setup, active signing, completion, decline, and cancellation** (2026-09-05); **A Signing may be completed remotely or in person on a shared device** (2026-08-24)
* No SQL migration; no schema change

---

## Signing participants may be linked or ad hoc, and all are eligible in parallel

**Date:** 2026-09-05

**Decision:**
A **signing participant** is a person participating in one particular Signing. The participant may reference a Harbaugh Forms User, a Contact, both, or neither. A User and Contact may represent the same person, and those references are not mutually exclusive. Creating a Contact is never required to add someone to a Signing.

An ad hoc participant requires only a name and email address. A participant may also have an optional descriptive transaction role such as Buyer, Seller, Tenant, Landlord, Agent, Broker, Attorney, or Other. A role provides context; it is not an identity category and does not by itself grant access or determine which fields the participant may complete.

While the Signing is Draft—or while it is In Progress but still eligible for an exclusive pre-signature amendment—the agent may edit participant names, email addresses, roles, explicit User/Contact associations, and assigned signer fields. The first accepted signature or initial freezes those values as the participant's historical identity snapshot for that Signing. Later edits to a linked User or Contact must not rewrite the Signing's participant history. The retained User and Contact references remain useful associations, but the frozen name, email, and role used for the Signing are the historical record.

An email address is a delivery destination, not a unique person identifier. Multiple participants, Users, or Contacts may share the same email address. The system must not merge participants or silently create User/Contact associations from an email match. It may suggest possible existing records, but the agent must explicitly select any association. Each remote participant receives participant-specific access even when multiple invitations go to the same inbox; completing or authenticating one participant must not complete or authenticate another participant who shares that email.

Harbaugh Forms will not initially support configurable signing order. When a Signing becomes In Progress, all required participants are eligible to sign in parallel. Remote participants may act in any order or concurrently. In-person participants naturally take turns while sharing a device, but that handoff sequence is not a configured business ordering. Completion occurs when every required participant has completed every required assigned action. Signing-order configuration may be added later only if real use demonstrates a need.

This decision settles participant identity relationships, minimum ad hoc information, snapshot timing, email non-uniqueness, and the absence of configurable signing order. It does not prescribe table names, columns, role enums, invitation-token mechanics, or exact authentication controls.

**Reason:**
Real participants do not fit mutually exclusive application-identity categories. The same person may be both a User and Contact, while another signer may have no prior Harbaugh Forms record. Preserving the values actually used in the Signing protects historical accuracy without forcing contact creation or treating a shared email address as proof that two records are the same person. Configurable signing order adds setup and enforcement complexity without a demonstrated business need.

**Consequences:**

* User and Contact references are optional, may coexist, and require explicit agent selection.
* Name and email are required for every participant; role is optional.
* Ad hoc participants are first-class and do not cause automatic User or Contact creation.
* Participant identity values and associations freeze when the first signature or initial is accepted.
* Shared email addresses are valid and never collapse distinct participants or their access.
* All participants become eligible together at activation; no sequence numbers or signing stages are required in the initial design.
* Exact participant schema and authentication mechanics remain part of later technical design.
* No application code, schema, migration, storage, route, or configuration change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Signing lifecycle distinguishes setup, active signing, completion, decline, and cancellation** (2026-09-05); **A Signing may be completed remotely or in person on a shared device** (2026-08-24); **Native e-signature uses one working packet form, many immutable versions, and a dedicated signing experience** (2026-08-19)
* No SQL migration; no schema change

---

## Signing lifecycle distinguishes setup, active signing, completion, decline, and cancellation

**Date:** 2026-09-05

**Decision:**
A durable **Signing** has five user-facing/domain lifecycle states:

* **Draft** — the Signing exists and the agent is preparing its selected document source states, participants, and signer-field assignments. No participant may sign. Draft document selections are stable Signing-owned **Draft source snapshots**, but permanent immutable prepared document versions and Package Revision 1 do not yet exist. Ordinary Draft preparation does not create `signing_document_versions` or package revisions; those freeze at activation under the 2026-09-15 Draft-source-snapshot / package-revision decisions.
* **In Progress** — the Signing has been activated through the common Send / Begin In-Person activation model (durable Package Revision 1 plus required participant access state). Remote invitations may then be attempted, or an in-person signing ceremony may start. All required participants are eligible to sign. Until the first signature or initial is accepted, the agent may amend the Signing only under the exclusive-lock rules in the later 2026-09-05 decision. The first accepted signature or initial freezes the document set, participant roster, participant identity snapshots, and assigned signer fields.
* **Complete** — every required participant has completed every required signing action.
* **Declined** — a participant affirmatively refused the whole Signing. The participant may provide an optional reason. No further signing is allowed within that Signing.
* **Cancelled** — an authorized primary agent, co-agent, or brokerage administrator ended the Signing before completion with a required audit-history reason.

The ordinary lifecycle is **Draft → In Progress → Complete**. An authorized agent may move a Draft or In Progress Signing to Cancelled. A participant decline moves an In Progress Signing to Declined. Complete, Declined, and Cancelled are irreversible terminal outcomes for that Signing. The later 2026-09-06 terminal-outcomes decision specifies whole-Signing decline, cancellation authority and reasons, notifications, and recoverable discard of an unsent Draft.

All events and evidence already collected remain preserved when a Signing is Declined or Cancelled, including partial signatures or initials, consent records, participant actions, timestamps, and immutable document versions. Before the first signature or initial, an agent may amend an In Progress Signing under the exclusive-lock rules recorded later on 2026-09-05. After the first signature or initial, a material correction requires a new Signing rather than changing the activated Signing.

**Ready**, **Sent**, **Partially Signed**, and **Expired** are not primary durable Signing states:

* **Ready** remains derived state, not a durable Signing lifecycle status. A Draft may be considered ready only if activation preflight succeeds. The future Signing dashboard may surface blockers such as missing required participant information, unassigned signer fields, invalid participant assignments, integrity problems, source documents changed since their Draft snapshots were selected, and other already approved activation blockers. A detected source change requires an explicit agent decision (**Keep Current** or **Update to Latest**) before activation; activation must not infer the choice, and that resolution is part of readiness. See **Draft document selections use Signing-owned source snapshots until activation** (2026-09-15).
* Sent is a remote-delivery event or presentation status and does not apply universally to in-person signing. Email delivery is outside the Draft → In Progress success boundary.
* Partially Signed is derived from participant/action progress while the Signing remains In Progress.
* Expired is not a Signing lifecycle state. Active-Signing and completed-package links do not automatically expire under the later 2026-09-06 decisions, although revoked links are disabled and may be replaced.

**Void** is rejected as a user-facing status throughout Harbaugh Forms by the later 2026-09-06 decision. The user-facing workflow action is **Cancel Signing**, producing a Cancelled Signing. The unused underlying `VOID` value requires a separate dependency audit before any technical removal.

This decision establishes domain and user-facing lifecycle semantics. It does not prescribe database enum names, tables, columns, transition implementation, invitation-expiration policy, or exact participant-status schema.

**Reason:**
The lifecycle must work consistently for remote and in-person Signings while clearly distinguishing who ended an unsuccessful workflow. Cancelled records an agent decision; Declined records a participant's affirmative refusal. Delivery and partial-progress details should not obscure the small set of durable workflow outcomes.

**Consequences:**

* Participants cannot sign while a Signing is Draft.
* Activating a Signing (common Send / Begin In-Person algorithm) makes all required participants eligible only after durable Package Revision 1 and required participant access state exist. Email delivery is outside that success boundary. The first accepted signature or initial freezes its documents and signing configuration; changes after that boundary require cancelling or otherwise terminating that Signing and creating another one.
* A Draft is Ready only when activation preflight succeeds, including explicit resolution of any Source Changed condition.
* A participant decline terminates further signing in that Signing and is distinguishable from agent cancellation.
* Terminal outcomes never erase partial signing evidence or append-only events.
* UI may display derived readiness, delivery, partial-progress, and access-expiration information without turning those into primary Signing lifecycle states.
* Exact schema names and enforcement mechanisms remain open until technical design.
* No application code, schema, migration, storage, route, or configuration change is made by this decision.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Draft Signing creation establishes mutable preparation state; package revisions freeze at activation** (2026-09-15); **Draft document selections use Signing-owned source snapshots until activation** (2026-09-15); **Send and Begin In-Person Signing share one activation model** (2026-09-15); **Creating a Signing snapshots the working document without requiring Final** (2026-09-05, superseded for snapshot timing); **A Signing may be completed remotely or in person on a shared device** (2026-08-24)
* No SQL migration; no schema change

---

## Creating a Signing snapshots the working document without requiring Final

**Date:** 2026-09-05

**Status:** Superseded / refined for snapshot **timing** and Draft document selection semantics. The durable rules that Create Signing does **not** require `FINAL`, and that Signing progress must **not** be stored as `packet_forms.document_state = SIGNED`, remain in force.

The historical claim that **“Creating a Signing is the immutable snapshot boundary”**—and any related implication that Create Signing immediately renders immutable `signing_document_version` rows / permanent prepared PDFs—is superseded by:

* **Draft Signing creation establishes mutable preparation state; package revisions freeze at activation** (2026-09-15);
* **Draft document selections use Signing-owned source snapshots until activation** (2026-09-15);
* **Promoted package revisions are complete, immutable, and atomically actionable** (2026-09-14).

Under the current architecture: Create Signing itself does **not** create a `signing_document_version`; adding a document to Draft creates a Signing-owned **Draft source snapshot**, not permanent immutable PDF evidence; Draft does **not** automatically follow live `packet_form` changes; activation renders the selected Draft source snapshot, not whatever the live working form happens to contain. Historical decision text is retained below for provenance.

**Decision (historical):**
Creating a **Signing** is the immutable snapshot boundary. The action captures the exact current state of each included working `packet_form` as an immutable rendered document version for that Signing. A `packet_form` does **not** need to be in `FINAL` document state before this action, and creating or completing a Signing does not change the working `packet_form` to `SIGNED`.

The working document remains independent from the captured version. It may remain open and editable after the Signing is created. Later edits do not change the Signing's immutable version. If the revised document is sent for signatures later, the system creates another immutable version and ordinarily another Signing. Existing signed, partially signed, cancelled, or abandoned versions remain unchanged.

If the editor contains unsaved changes when the user chooses **Create Signing**, that action must establish one clean persisted snapshot point before rendering. From the user's perspective, the current edits are secured and the immutable version is created as one action. Technical design must prevent the rendered version from mixing values from different saves or revisions. The exact concurrency mechanism is not defined here.

**(Current refinement of the “later edits” idea):** After a document is added to a Draft Signing, later live `packet_form` edits do not silently change the Draft-selected source snapshot. The agent must explicitly Keep Current or Update to Latest. Permanent immutable prepared PDF versions are created only at package promotion / activation, not merely because a Draft Signing exists or a document was added.

`packet_forms.document_state` describes the working document, not signing progress. `FINAL` remains an optional working-document lock that an agent may use to prevent ordinary editing; it is not a signing prerequisite. Signing progress and completion belong to the Signing domain and its participants and immutable document versions.

The existing `SIGNED` value is an unused, pre-existing `packet_forms.document_state` schema value; there is no current signing behavior or UI transition attached to it. It should not be preserved merely because it exists. During implementation design, dependency and data checks must confirm whether it is unused; if so, it should be removed through an appropriate forward migration together with corresponding lifecycle definitions. This documentation decision does not perform or authorize that migration. The separate meaning and future of `VOID` are not decided here.

**Reason (historical + still partly durable):**
Requiring an agent to mark a working document Final immediately before creating a Signing would add a state transition without improving the evidentiary boundary. Keeping working-document state separate from Signing lifecycle remains correct. Later architecture moved the first immutable package/PDF freeze from Create Signing to activation / package-revision promotion so Draft preparation can remain mutable.

**Consequences:**

* **Current rule:** Create Signing opens mutable Draft preparation. Adding documents selects Signing-owned Draft source snapshots. Package Revision 1 and immutable prepared document versions are created only at activation (common Send / Begin In-Person algorithm), not as a continual Draft side effect and not merely by adding a document. See the 2026-09-15 Draft-source-snapshot and activation-model decisions.
* `DRAFT` and `FINAL` remain working-document concepts. `FINAL` is optional relative to Native Signing.
* Signing status must not be inferred from or stored as `packet_forms.document_state = SIGNED` in the Native Signing architecture.
* Open question B from the 2026-08-19 native e-signature architecture decision remains resolved for packet-form lifecycle separation; its earlier “Create Signing = immutable snapshot” wording is refined by the 2026-09-15 decisions above.
* No application code, schema, migration, storage, route, or configuration change is made by this documentation reconciliation.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Draft Signing creation establishes mutable preparation state; package revisions freeze at activation** (2026-09-15); **Draft document selections use Signing-owned source snapshots until activation** (2026-09-15); **Send and Begin In-Person Signing share one activation model** (2026-09-15); **Native e-signature uses one working packet form, many immutable versions, and a dedicated signing experience** (2026-08-19); **Packet Form Document Lifecycle** (2026-07-17)
* No SQL migration; no schema change

---

## A Signing may be completed remotely or in person on a shared device

**Date:** 2026-08-24

**Decision:**
A durable **Signing** may be completed through either of two participant experiences:

* **Remote Signing** — participants receive invitations and authenticate remotely according to rules established in later technical design.
* **In-Person Signing** — participants sign sequentially on a shared device under the agent's supervision, without requiring email invitations, emailed links, or one-time passcodes merely to move the device from one participant to the next.

Both modes use the same Signing, signing-participant, signing-event, and immutable-document-version concepts. In-person signing is not a separate document type and does not bypass the signing ceremony. Each participant must have a distinct handoff and signature-adoption step, must act only in that participant's assigned fields, and must affirm completion before the device advances to another participant. A participant who is also the agent completes their own participant turn rather than using ordinary document-editing behavior as a substitute for the signing ceremony.

The signing record must preserve which participant completed each field, the participant's adopted signature, meaningful action timestamps and ordering, affirmative electronic-record/signature consent, the exact immutable document version reviewed and signed, and that the Signing used an agent-supervised in-person mode when applicable. Temporary shared-device/browser state remains runtime state and is not thereby established as a durable domain object named “Signing Session.”

This decision settles the availability and high-level boundaries of in-person signing. It does **not** define the exact handoff UX, identity-confirmation language, consent text, session controls, authentication rules, database schema/table names, or storage design.

**Reason:**
An agent may be physically present with a buyer, seller, tenant, landlord, or other participant who is ready to sign immediately. Requiring the parties to print and scan documents—or to exchange email invitations and one-time passcodes while sharing the same laptop—adds friction without improving that in-person experience. A controlled participant-by-participant ceremony preserves the convenience of shared-device signing while retaining clear attribution and an auditable record that the participant, rather than the logged-in agent, adopted and applied the signature.

**Consequences:**

* Future signing UX must support choosing an appropriate remote or in-person participant experience without creating a different durable object for in-person use.
* In-person signing must include an explicit participant handoff; the logged-in agent's application identity must not silently stand in for another participant.
* In-person mode does not require email delivery or remote OTP solely for shared-device access, but later technical design must still establish appropriate identity confirmation, consent, access isolation, and session-safety controls.
* All signing modes continue to consume immutable document versions, preserve append-only signing events, and keep the signing experience separate from normal packet editing.
* The later 2026-09-14 decisions select working credential, browser-session, and broader Signing table names. Exact implementation, constraints, storage, and access-policy details remain technical design.
* No implementation, schema, migration, route, storage, or configuration design is authorized by this decision.

**Related files or migrations:**

* This file: **The durable signing-workflow object is named Signing / Signings** (2026-08-21); **Native e-signature uses one working packet form, many immutable versions, and a dedicated signing experience** (2026-08-19); **Native e-signature is a planned in-app packet workflow** (2026-08-16)
* No SQL migration; no schema change

---

## The durable signing-workflow object is named Signing / Signings

**Date:** 2026-08-21

**Decision:**
The durable object representing a specific set of documents sent through an electronic signing workflow is named **Signing** (singular user-facing/domain noun) and **Signings** (plural / feature-section noun).

This terminology replaces the previously open naming question around terms such as envelope, signing request, signing session, signing package, dispatch, folio, signet, and other coined terms. **Envelope** is explicitly rejected.

Do **not** collapse all signing-related concepts into this one term. The following conceptual distinctions remain:

* **Signing** — the durable overall signing workflow/object involving one or more documents and one or more participants.
* **Signing participant** — a person participating in that Signing.
* **Signing event** — an immutable historical action/event within the Signing.
* **Signer browser/authentication session** — temporary runtime/authentication state and **not necessarily a durable domain object named “Signing Session.”**
* **Immutable document version** — the exact rendered document artifact associated with signing activity.

This terminology decision did not itself select database names. Later 2026-09-10 and 2026-09-14 decisions select the working Signing table names and relationships; they still do **not** authorize implementation, schema migrations, or storage-path design.

**Reason:**
The governing usability principle is: an agent who has never used Harbaugh Forms should be able to see the object name and quickly understand what it represents. “Signing” passes that test better than the alternatives and uses ordinary, generic real-estate/e-signature language.

Intended UI language includes Create Signing, Send Signing, Open Signing, Signing In Progress, Signing Complete, Cancel Signing, Signings, “The signing is almost complete,” and “I sent the signing to the sellers.”

The fact that other real-estate/e-signature products may also use the generic word “Signing” is not a reason to avoid it.

**Consequences:**

* Use **Signing** / **Signings** in future product, UI, and domain documentation for the durable overall signing-workflow object.
* Do not use envelope, signing request, signing package, dispatch, folio, signet, or other coined terms as the name of that object.
* Do not treat a signer browser/authentication session as a durable domain object named “Signing Session” merely because the overall object is named Signing.
* The durable product noun does not by itself dictate schema names. Working Signing table names and relationships were selected in the later 2026-09-10 and 2026-09-14 data-model decisions; implementation details remain open.
* Narrows open question D in the 2026-08-19 native e-signature architecture decision. This terminology decision did not itself resolve A, B, C, or E; later 2026-09-05 decisions resolve B and C at the domain level.

**Related files or migrations:**

* `project_status.md` (status note only)
* This file: **Native e-signature uses one working packet form, many immutable versions, and a dedicated signing experience** (2026-08-19); **Native e-signature is a planned in-app packet workflow** (2026-08-16)
* No SQL migration; no schema change

---

## Native e-signature uses one working packet form, many immutable versions, and a dedicated signing experience

**Date:** 2026-08-19

**Decision:**
This is a durable design checkpoint for native e-signature architecture. It records settled product/architecture principles before the signing subsystem is designed in further technical detail. It does **not** authorize implementation, schema, migrations, or storage-path design. Product terminology for the durable overall signing-workflow object is now settled as **Signing** / **Signings** (see the 2026-08-21 decision); remaining signing-related terms are listed under Open questions.

A 2026-08-18 read-only audit of packet forms, generated PDFs, document states, and storage confirmed that a `packet_form` is the logical document instance in a packet, not an immutable rendered PDF, and that filled PDFs are generated on demand rather than stored as historical artifacts. The principles below follow from that investigation and from subsequent product direction. They refine, and do not replace, the 2026-08-16 decision that native e-signature is a planned in-app packet workflow.

**Settled:**

1. **`packet_form` remains the logical working document.** A `packet_form` continues to represent the logical/current document instance within a packet. It is not itself an immutable rendered PDF version. The existing packet / form / field-instance architecture remains the working-document layer.

2. **One `packet_form` may have many immutable rendered versions.** Future signing functionality will introduce a one-to-many relationship conceptually like `packet_form` → many immutable rendered document versions. Each immutable version represents the exact PDF bytes that existed at a particular point in the document's history. The final table name and schema are **not** defined here.

3. **Signing versions preserve exact historical evidence.** An immutable rendered version must eventually preserve enough information to establish exactly what document existed at that moment, including at minimum the exact stored PDF bytes and a cryptographic hash such as SHA-256. Historical versions are never overwritten. The hash is for document identification, integrity, and provenance. It is not a claim that copies of the file outside Harbaugh Forms cannot be altered.

4. **Multiple signed versions are allowed.** A single logical `packet_form` may legitimately have multiple signed or partially signed immutable versions over time. Examples include correcting a contract and obtaining new signatures; changing one or more terms and obtaining new initials; abandoning an earlier signing attempt and fully executing a later version; and entering a legitimate post-signature value such as an effective date and creating a derivative version. Harbaugh Forms should preserve the history and provenance of these versions rather than trying to prevent them. Harbaugh Forms also should not attempt to determine which of several signed versions is legally controlling. Its responsibility is to preserve an accurate history of what occurred in the system.

5. **Legitimate later changes create derivative versions.** A signed historical version remains immutable. If the working `packet_form` later changes legitimately, a newly rendered version is created rather than overwriting the prior signed artifact. Future versioning design should support parent/derivative provenance where appropriate. The exact parent-version representation is **not** decided here.

6. **A signing participant is a Signing-scoped concept.** Do not equate a signer with either an application User or a Contact. A signing participant is a person participating in a particular Signing and may reference a Harbaugh Forms User, a Contact, both, or neither. Ad hoc participants require only a name and email address; Contact creation is never required. The model must remain flexible enough for a person to occupy different roles at different times. Example: Lee Harbaugh may simultaneously be a Harbaugh Forms User, a Contact, the listing agent on the transaction, and a signing participant who must sign the listing agreement. Do not force such a person into only one identity category. See the 2026-09-05 participant decision.

7. **Historical participant identity is snapshotted at the first signature or initial.** Signing records must not depend solely on live User or Contact values. The name, email address, optional role, and explicit User/Contact associations used for a Signing freeze when its first signature or initial is accepted. Before that boundary, an In Progress Signing may be amended only under the exclusive-lock rules in the later 2026-09-05 decision. If a linked User or Contact is edited afterward, the historical Signing record remains unchanged. Email is not a unique identity key; shared addresses do not merge participants or associations.

8. **Signing links always enter a dedicated signing experience.** The recipient signing experience will be a dedicated, reduced signing UI, likely under a route namespace such as `/sign/...`. A signing link should enter this signing experience even when the signing participant is also an authenticated Harbaugh Forms User. Existing app authentication may provide additional identity context, but it must not bypass the signing ceremony or redirect the person directly into the normal agent application. Signing context and normal application context are separate.

9. **Signing mode never edits its source document.** The signing UI consumes an immutable document version. It must not edit that immutable signing version or the underlying working `packet_form`. If a signing participant is also a Harbaugh Forms User and discovers a document problem while signing, they may exit signing and return to the regular packet/application workflow. Any correction occurs against the working document outside the signing ceremony and may result in a new immutable document version and/or a new Signing.

10. **Partial signing activity must be preserved.** Future signing architecture will use append-only signing events. Each meaningful signature or initial action should be preserved individually so that abandoned or interrupted signing sessions retain an accurate history of what the participant completed. A participant may resume later according to future authentication/session rules. The event-table schema is **not** defined here.

11. **Copy-only recipients should not universally require Contact records.** A person who must actually participate in a signing workflow should normally relate to an appropriate User or Contact when one exists. However, a person who merely receives a completed copy—for example an attorney, broker, compliance recipient, or other forwarding recipient—should not necessarily be forced into the Contacts system. The future UI may offer an option such as `Save as Contact`, but creating a Contact should not be a universal prerequisite for copy-only delivery. The final copy-recipient storage model is **not** decided here.

12. **One application, separate signing experience.** Harbaugh Forms will remain one product/codebase rather than creating a separate Authentisign-style application. The signing subsystem should nevertheless be treated as a bounded domain with a focused signer-facing UI distinct from the normal agent/admin application shell. The intended conceptual split is: regular Harbaugh Forms UI for agents/users; dedicated signer UI for signing participants; shared underlying database/document/version architecture.

**Resolved since this checkpoint:**

* **B. Resolved 2026-09-05; snapshot timing refined 2026-09-15 — `packet_forms.document_state`.** Creating a Signing does not require `FINAL`, and signing status does not belong on the working `packet_form`. The earlier 2026-09-05 wording that treated Create Signing itself as the immutable snapshot boundary is superseded: Create Signing opens mutable Draft preparation; document add selects a Signing-owned Draft source snapshot (not a permanent prepared PDF); Package Revision 1 / immutable prepared versions freeze only at activation via the common Send / Begin In-Person algorithm. Live `packet_form` changes do not silently rewrite Draft selections. The existing `SIGNED` value is unused rather than legacy behavior and should be removed during implementation if dependency and data checks confirm that it is unused. Exact migration mechanics remain technical design, and `VOID` is not resolved by this decision.

* **C. Resolved 2026-09-05 — participant identity and eligibility.** Participants may reference a User, Contact, both, or neither; ad hoc participants require name and email; roles are optional; email is non-unique and never silently links identities; historical values freeze at the first accepted signature or initial; and all participants are eligible in parallel without configurable signing order. Exact schema and authentication mechanics remain technical design.

* **E. Resolved 2026-09-06; storage narrowed 2026-09-14 — copy recipients and completed-copy delivery.** Every signer and designated copy recipient receives the completed package by email without login. Copy recipients are not participants, require only email, never affect completion, and may be added indefinitely, including after completion. `signing_copy_recipients` and separate completed-package credentials record entitlement; delivery failures and later deliveries are tracked separately from Signing lifecycle. Delivery-attempt storage and provider mechanics remain technical design.

**Remaining open questions:**

The following remain unresolved except where a later decision has narrowed them. They must not be treated as decided by this 2026-08-19 checkpoint.

* **A. Narrowed 2026-09-06; working model selected 2026-09-10 and 2026-09-14 — final immutable-version and event schema.** Product behavior is settled: explicit Signing current state is paired with append-only events, and each document preserves a SHA-256 fingerprinted prepared PDF, associated Signing activity, and a separately SHA-256 fingerprinted completed PDF; superseded prepared versions remain retained. The working core, credential, copy-recipient, browser-session, delivery, agent-association, presence-lease, and amendment-lock table names and relationships are now recorded above. UUID/sequence, controlled-vocabulary, and relational-metadata conventions; evidence-preservation; no-cascade; and protected-key event-chain rules are also settled. Storage-path scheme, particular foreign-key actions, canonical encoding, protected-key operations, transactional enforcement, RLS rules, exact column definitions, and migration details still require technical design.

* **D. Temporary authentication/session terminology and technical details.** The durable overall object is **Signing** / **Signings**, and envelope is rejected. The remote access baseline is settled as participant-specific emailed links, explicit I am confirmation, no required account/OTP/2FA, reusable active-Signing links unless revoked, a 60-minute inactive browser-session timeout with preserved progress, and revocation on participant removal or terminal Signing status. The working credential and runtime table names are now `signing_participant_credentials`, `signing_completed_package_credentials`, `signing_browser_sessions`, and `signing_participant_presence_leases`; runtime state remains distinct from the durable domain noun “Signing Session.” Server-authoritative scope validation, secret hygiene, clean-route exchange, and session invalidation are required. Exact token/session protocol, heartbeat timing, storage, rate limits, revocation constraints, and RLS remain technical design.

**Reason:**
Native e-signature cannot be implemented on today’s on-demand filled PDF, because that output is disposable and is not a historical artifact. Real Texas transactions also produce more than one signed or partially signed artifact for the same logical document (corrections, new initials, abandoned attempts, post-signature effective dates). Harbaugh Forms should keep an accurate provenance trail rather than collapsing that history into a single current file or choosing which version is legally controlling. Signer identity is a workflow role, not a User-or-Contact exclusive category, and the signing ceremony must stay distinct from ordinary agent application editing.

**Consequences:**

* Continue technical and domain design from this checkpoint before any signing implementation.
* Do not begin signing migrations, tables, RLS, storage-path schemes, or application routes on the strength of this decision.
* Do not treat `packet_form` as the immutable signed PDF. Do not model historical versions as additional ACTIVE `packet_forms` of the same form.
* The later 2026-09-10 and 2026-09-14 decisions select the working version/participant/event/copy-recipient and related table model. Do not extend or implement it beyond those approved decisions without further design.
* Product terminology for the durable overall object is **Signing** / **Signings** (2026-08-21). Envelope is rejected. The later data-model decisions select working table names; temporary runtime state remains distinct from the durable domain object and exact implementation details remain open (question D).
* Current packet-form lifecycle behavior remains unchanged during this documentation phase: the UI does not enter `SIGNED` / `VOID`. At the domain level, question B is resolved for packet-form lifecycle separation; Create Signing is not the immutable package/PDF freeze (refined 2026-09-15). See **Packet Form Document Lifecycle**.
* Vendor choice, protected-key operations/external anchoring, remote-signer session mechanics, and exact annotation-type names remain open, as in the 2026-08-16 native e-signature decision. The later 2026-09-14 integrity decision selects SHA-256 artifact fingerprints and a protected-key-authenticated event chain. The product-level completed-document and Signing-wide certificate behavior is resolved by the later 2026-09-06 decision.
* Authentisign remains prior research and the current inventory-exclusion policy, not a committed vendor and not a separate product to recreate.

**Related files or migrations:**

* `project_status.md` (status note only; Future Product Roadmap)
* This file: **The durable signing-workflow object is named Signing / Signings** (2026-08-21); **Native e-signature is a planned in-app packet workflow** (2026-08-16); **Packet Form Document Lifecycle** (2026-07-17); **Packet Field-Instance Snapshots**; **One-off packet PDFs and document annotations are not reusable form-catalog fields**
* `lib/types/packet-form-lifecycle.ts`
* `lib/packet-form-lifecycle.ts`
* `lib/packet-form-download.ts`
* `lib/fill-packet-form-pdf.ts`
* No SQL migration; no schema change

---

## Packet assigned property is independent of property-entry UI mode

**Date:** 2026-08-18

**Decision:**
The packet's assigned property is independent from the property-entry UI mode. Toggling between "Select existing property" and "Create new property" must not clear or replace the currently assigned property. Property assignment changes only when the user explicitly selects or commits a replacement property, or uses an explicit removal action.

The search/create UI mode is a temporary entry surface. An already-assigned `property_id` stays in state while the user inspects the create-new form or returns to search. Typing into the new-property form is draft-only until the existing commit point: **Save and select property**, selecting a different existing search result, or (for optional/custom New Packet only) saving a filled new-property draft with the parent create form. Required listing/contract packets still commit a new property only through **Save and select property**.

**Reason:**
Edit Packet treated entry-mode as assignment. Switching to **Create new property** immediately set `property_id` to null and cleared the selected-property display, so switching back looked like the packet no longer had a property. Users were exploring how to replace a property, not requesting that it be removed.

**Consequences:**

* New Packet and Edit Packet stay consistent because they share `PropertyPicker`.
* A packet with an assigned property still shows that property after Create new → Select existing with no commit.
* A new packet with no property yet still stays empty when toggling modes.
* Selecting another existing property, or successfully saving/selecting a new one, still replaces the assignment.
* There is no separate “remove property” control in this UI; assignment is cleared only by an explicit replacement/commit path, not by changing modes.

**Related files or migrations:**

* `components/properties/property-picker.tsx`
* `components/packets/create-custom-packet-form.tsx`
* `components/packets/create-packet-from-collection-form.tsx`
* `components/packets/packet-edit-form.tsx`
* `lib/ui/form-controls.test.ts`
* No SQL migration

---

## Packet property selection does not list all properties for a blank existing-property search

**Date:** 2026-08-18

**Decision:**
Packet property selection should not display the full list of available properties when the existing-property search field is blank. Search results should appear only in response to user-entered search text, while an already-selected property remains visible independently of the search query.

Whitespace-only input is treated as no search (trimmed empty string). The search textbox itself remains available. Create-new-property and other existing property-selection choices are unchanged. This is a UI/state condition on the shared picker, not a new search architecture.

**Reason:**
Showing every active property as soon as **Select existing property** is chosen made the New Packet and Edit Packet screens noisy and encouraged browsing instead of searching. The selected property already has its own display; listing unrelated properties under a blank search was unnecessary and risked looking like the current selection had been replaced.

**Consequences:**

* New Packet and Edit Packet stay consistent because they share `PropertyPicker`.
* Users must type a search term to see matches; they do not get an unfiltered catalog under the box.
* Edit Packet continues to show the already-linked property without requiring a new search.
* Clearing the search after a selection does not clear or replace that selection.
* Unfiltered property data is no longer fetched solely to populate that blank-search list.

**Related files or migrations:**

* `components/properties/property-picker.tsx`
* `components/packets/create-custom-packet-form.tsx`
* `components/packets/create-packet-from-collection-form.tsx`
* `components/packets/packet-edit-form.tsx`
* `lib/ui/form-controls.test.ts`
* No SQL migration

---

## TXR-1957 / T-47.1 Draft catalog uses existing sources only

**Date:** 2026-08-17

**Decision:**
T-47.1 (TXR-1957, production Global form **53**, ACTIVE + DRAFT) received catalog fields and PDF placements through the existing `fields` / `form_field_mappings` / `field_defaults` architecture. No new table, no schema migration, and no development form clone. The form already existed as a production Draft shell (`global/forms/53/T-47-not-affidavit.pdf`, 0 AcroForm fields). Declarant **Signed** lines were not mapped (Authentisign / packet-annotation exclusion).

Source mapping:

* Reuse `property_legal_description` and `property_county` for the property-description and county blanks (legal description is not the street address).
* Reuse `seller_name_1` / `seller_name_2` for page-2 “My name is” blanks.
* Map declarant DOB to existing `packet_contact` paths `seller_1.date_of_birth` / `seller_2.date_of_birth` (contacts already store DOB in UI/schema). Do not add a new DOB column.
* Leave page-1 combined **Declarant** `manual_only` — the removed `seller_names` resolver is not revived, and `seller_name_1` would underfill two-owner packets.
* Leave both declarant **address** blanks `manual_only` — live `seller_N.address` is street lines only, not a full mailing address with city/state/ZIP.
* Leave GF number, declaration date, survey date, execution county, and execution day/month/year `manual_only`. Do not resurrect `contract_details` for survey date. Do not invent a combined execution-date hidden field.

Lee Personal form-specific defaults only: exceptions `None`; both execution states `Texas`. No Organization or Global defaults.

**Reason:**
Automatic fill is used only where a live source’s meaning matches the blank. A manual field is preferable to reviving abandoned resolvers or mapping street-only contact address into a declaration address.

**Consequences:**

* Map Fields review remains required before Publish (`/forms/53/editor`).
* Development does not receive a parallel TXR-1957 shell unless Lee later authorizes a mirror.
* Future two-owner name aggregates should use a reusable resolver (as `buyer_names` / `tenant_names` do), not a form-specific hack.

**Related files or migrations:**

* `lib/txr-1957-inventory.ts`
* `lib/txr-1957-manifest.test.ts`
* `scripts/txr1957-apply-production.ts`
* `TXR_1957_FIELD_IMPLEMENTATION.md`
* No SQL migration

---

## Native e-signature is a planned in-app packet workflow

**Date:** 2026-08-16

**Decision:**
Harbaugh Forms will eventually provide a **native e-signature workflow** so users can prepare packet documents for signature inside the product. Signature preparation should assign signature and initial locations to specific parties/signers. The same workflow should apply to documents generated from Harbaugh Forms templates/collections **and** to one-off PDFs imported into a packet. Design must distinguish a **placed** signature/initial annotation (already completed on the document) from a **signer field** (a location where a named signer still needs to sign or initial). Signature locations belong on the packet/document (annotation) model, not on the reusable form-field catalog. Future implementation should treat auditability as a requirement: signer identity, document version, timestamps, completed-signature state, and a reliable record of what was signed.

This decision does **not** select an external e-signature vendor, cryptographic architecture, or database enum set. High-level signing-architecture principles (working `packet_form` versus immutable rendered versions, transaction-scoped participants, dedicated signing experience, append-only signing events) are recorded separately in the 2026-08-19 native e-signature architecture decision. Prior documentation treated **Authentisign** as the expected handler for signature/initial lines (catalog extraction skips those fields; deferred “Authentisign integration” was listed as the path that might set packet-form `document_state = SIGNED`). That research and the current inventory-exclusion policy remain valid as historical/operational context. They are **not** a committed vendor or architecture for this product capability.

**Reason:**
Agents need to collect signatures and initials on both generated forms and received third-party PDFs without routing every location through Map Fields / the Global field catalog. Typed Fill Form signatures already exist as packet-form annotations and are explicitly not Authentisign placeholders; a full signing workflow is still missing (`SIGNED` exists on packet forms but the UI does not enter it). Committing a vendor now would over-constrain a feature that is not being implemented in this pass.

**Consequences:**

* Treat native e-signature as a **major** future product area, related to but distinct from imported-document markup tools.
* Do not implement signature locations as reusable `fields` / `field_instances` solely so they can be signed.
* Preserve Authentisign-exclusion behavior for standard form inventory/extraction until a signing design replaces or supplements it.
* Packet-form lifecycle `SIGNED` / `VOID` remain unused by UI. The 2026-09-05 / 2026-09-15 decisions resolve that future signing status does not belong in `packet_forms.document_state` and that Create Signing is not the immutable package freeze; no schema or implementation change is authorized by those documentation decisions alone, and the separate future of `VOID` remains open.
* Vendor choice, protected-key operations/external anchoring, temporary remote-session mechanics, and exact annotation-type names remain open. The later 2026-09-14 integrity decision selects SHA-256 artifact fingerprints and a protected-key-authenticated event chain. Product-level completed-document and Signing-wide certificate behavior is resolved by the later 2026-09-06 decision. Dedicated signing-experience principles are recorded in the 2026-08-19 architecture decision.

**Related files or migrations:**

* `project_status.md` (Future Product Roadmap)
* `lib/types/authentisign-excluded-fields.ts`
* `lib/types/packet-form-lifecycle.ts`
* `lib/packet-form-annotations.ts`
* `supabase/migrations/20260805220000_fill_form_presentation_and_annotations.sql`

---

## One-off packet PDFs and document annotations are not reusable form-catalog fields

**Date:** 2026-08-16

**Decision:**
A packet should eventually contain both (1) reusable/template-based documents generated from Harbaugh Forms forms/collections and (2) one-off externally supplied PDFs imported **directly into that packet**. Importing a received PDF must not require creating a reusable Form record, adding it to the global/private form library, mapping fields, publishing it, or adding it to a Collection.

Fill Form should eventually offer fast, **packet-document-specific** annotation tools, with first-iteration intent including Add Text, Strikethrough, Initial field/box, and Signature field/box. Later tools (checkmark, X, underline, highlight) are optional and not first-iteration requirements.

These quick annotations are **not** reusable Harbaugh Forms fields. They must not be matched to catalog keys (for example `SELLER_NAME`), must not create catalog rows, and must not participate in form-field defaults, source mapping, or global/private field management. They are stored as document-specific annotations (page, position, size, content). A strikethrough is graphical only.

Preferred implementation direction: **extend the existing `packet_form_annotations` architecture** (positioning/sizing, PDF embedding, soft deletion, creator attribution) where it fits, rather than forcing markup into `fields` / `field_instances` or creating an unnecessary parallel concept.

Possible future annotation concepts include typed signature, typed initial, free text, strikethrough, signer initial field, and signer signature field. Those names are product concepts, **not** finalized database enum values. Production today remains allowlisted to `typed_signature` and `date_signed` only. A placed annotation (already-drawn initials/signature/text) is conceptually different from an uncompleted signer field assigned to a party.

**Reason:**
Real transactions include PDFs the agent did not generate (for example a buyer’s offer on the agent’s listing). The agent may need to import that PDF into the existing listing packet, strike an incorrect seller name, type the correction, and place initial boxes for each party—without promoting the offer into the reusable form library. Typed-signature work already proved packet-form annotations can persist independently of the field catalog.

**Consequences:**

* Custom-packet `origin = external_upload` remains the existing attach path; the product intent is broader: import into **any** packet, including collection-backed listing packets, without a Form/Collection prerequisite.
* Do not use Map Fields, scoped defaults, or source resolvers for one-off markup.
* Do not treat first-iteration markup tools as implemented; current Fill Form annotation tools remain Signature and Date Signed.
* E-signature signer fields should share this packet-document annotation direction where appropriate, but imported-document markup is a **distinct** feature area, not a subset of e-signature.
* Exact schema for imported-document origin, annotation type enums, and signer-assignment columns is **not** decided here.

**Related files or migrations:**

* `project_status.md` (Future Product Roadmap)
* `lib/packet-form-annotations.ts`
* `lib/types/packet-form-annotation.ts`
* `lib/packet-form-annotation-placement.ts`
* `components/packets/packet-form-annotation-overlay.tsx`
* `supabase/migrations/20260805220000_fill_form_presentation_and_annotations.sql`
* `supabase/migrations/20260725040000_packets_custom_nullable_collection.sql` (existing custom-packet / `external_upload` attach path)

---

## Fill Form text layout, placement masks, and typed signature annotations

**Date:** 2026-08-05 (Caveat/multiline/mask download corrections + Date Signed 2026-08-06; **production rollout 2026-08-06**)

**Decision:**
Fill Form preview and generated PDFs share one text-layout policy (`lib/pdf-text-layout.ts`). Multiline behavior is an explicit template placement flag (`form_field_mappings.is_multiline`), not inferred from the current value. Preprinted writing lines may be covered with an opaque white rectangle via placement flag `mask_background` (default false; admin-only in Map Fields; does not alter the source PDF file). Typed “Fill & Sign”–style signatures and **Date Signed** stamps are stored as packet-form annotations (`packet_form_annotations`), not as `fields` / `field_instances` and not as Authentisign placeholders. Annotation types today: `typed_signature` (Caveat) and `date_signed` (Helvetica). Preview font size scales with PDF zoom using `renderedHeight / originalHeight` applied to the configured (or height-derived) point size, with documented min/max clamps. Annotation `created_by_user_id` is assigned authoritatively by a BEFORE INSERT/UPDATE trigger from `auth.uid()` / OLD and is immutable after insert; authorization remains `owns_packet` / `is_app_admin` (not creator-only). Custom Caveat embedding in pdf-lib requires registering `@pdf-lib/fontkit`, saving with `useObjectStreams: false`, and embedding Caveat as `{ subset: true, customName: "HarbaughCaveat" }` so it does not corrupt when Helvetica is also embedded in the same document. Typed signatures and dates are each drawn as one intact `drawText` string.

**Production rollout (2026-08-06):**
* PR #31 squash-merged to `main` as `d93cc5936f511c561f7538a5d035126ed2976cc9`.
* Unique Vercel deployment `https://harbaugh-forms-8m60uqcrp-lee-harbaugh-s-projects.vercel.app` (`dpl_EcDG5xuCGTA9VrmKDVWF2irn1Qtb`) validated before domain promotion.
* Production migrations applied in order on `harbaugh-forms-prod` (`eetonalyyyssvkyfdoxh`): `20260805220000` → `20260805230000` → `20260806150000`.
* Production mapping `f7f8e678-43f3-4f9a-9cb2-f1c9bb6b9f05` (form 15 Non-Real Estate Items) set to `is_multiline=true` + `mask_background=true` only; coordinates unchanged.
* Custom domain kept on rollback `6ef2453` / `87xmn84pt` until unique-URL + schema validation passed, then manually aliased to the new deployment (~2026-08-06 23:50 UTC).
* **Manual production-domain promotion remains required** for future releases; automatic custom-domain assignment stays disabled. Unique `*.vercel.app` URLs may require Deployment Protection bypass for automated smoke. **2026-08-18 observation:** Production deploy `dpl_85mK8L8SEkLungQ84anWhSK8FoVx` (`c208ad3`) received `forms.harbaughrealestate.com` and `harbaugh-forms.vercel.app` automatically when it became Ready. Re-check the Vercel project domain auto-assign setting before the next production push.
* Integrity fingerprints for existing field instances unchanged; temporary smoke annotations soft-deleted; smoke storage objects removed.
* **2026-08-06 follow-up:** A read-only production audit produced a **164-row** manual review workbook (`audits/prod-multiline-mask-2026-08-06/multiline-mask-manual-review.xlsx`). Lee must enter `1` in the Lee approval columns to authorize later flag updates; blank means no change. Dimension-review approval does not authorize automatic geometry changes.
* **2026-08-07 apply:** Lee completed the workbook (authoritative). **80** rows had ≥1 approval (`1`): **60** original-audit + **20** Lee-added; all resolved to exact ACTIVE mappings; **0** unresolved; **0** conflicts. Production updated **79** unique mappings to `is_multiline=true` + `mask_background=true` only (geometry unchanged). **1** approved mapping (`f7f8e678-…`) was already correct. Dimension Review backlog: **80** rows — no geometry applied (no explicit Lee Notes dimensions). Dev mirror: **26** by ID; **53** exceptions. Applied trail: `multiline-mask-manual-review-APPLIED.xlsx`. No app deploy; no migrations.

**Date Signed specifics:**
* Toolbar tool beside Signature; dialog defaults to the user’s local calendar date and format `MM/DD/YYYY`; also supports `M/D/YYYY` and `Month D, YYYY`.
* `text_value` stores the formatted display string chosen at placement (stable calendar text, not a timezone timestamp). Once placed, the value does not auto-update to “today.”
* `font_id` = `helvetica`; PDF/preview use standard Helvetica (no custom font embed).
* Placement is independent of signatures (no auto-pairing). Shared overlay/PDF primitives leave room for future annotation kinds without duplicating drag/resize/zoom.
* **Authoritative supported annotation types:** `typed_signature` | `date_signed` only. Validator/placement factory use an explicit allowlist (`isPacketFormAnnotationType`); unknown types still return `Unsupported annotation type.`
* **Browser click path:** Fill Form PDF click → `buildAnnotationInputFromPlacementClick` (`lib/packet-form-annotation-placement.ts`) → `createPacketFormAnnotation`. Date defaults use Helvetica sizing; signature defaults use Caveat sizing. Regression coverage: `lib/packet-form-annotation-placement.test.ts` (not DB-only inserts).
* **2026-08-06 placement bug:** Dialog/banner recognized `date_signed`, but the click/create path hit `validatePacketFormAnnotationInput` in `lib/types/packet-form-annotation.ts`. Fixed by routing clicks through the shared factory, hardening the allowlist to explicit equality, and building create payloads without spread that can drop `annotation_type`.

**Authoritative browser Download PDF path:**
Packets Fill Form → `downloadFilledPacketFormPdf` → `getFilledPacketFormPdfBytes` → load template bytes + Caveat font bytes + ACTIVE annotations → `fillPacketFormPdfBytes` (Helvetica field overlays + Caveat signatures + Helvetica dates) → browser download.

**Reason:**
Single-line `drawText` / CSS `truncate` clipped narrative blanks. Fixed `10px` overlay text stayed tiny at high zoom while boxes scaled. Preprinted form lines need an optional non-destructive cover. Occasional agent signatures and signed dates must not require Global field catalog rows or Authentisign. Client-supplied creator UUIDs must not be trusted. Applied development migrations are immutable, so creator hardening and `date_signed` are forward-only follow-up migrations. Post–PR #30 QA: (1) narrative blanks still marked single-line overflow horizontally; (2) default-name Caveat embed beside Helvetica corrupted advances; (3) wrapped Non-Real Estate Items showed preprinted lines because `mask_background` remained false.

**Consequences:**

* Admins enable multiline and/or mask per placement; existing mappings default off. Narrative blanks over writing lines (e.g. Residential Lease Listing Non-Real Estate Items `f7f8e678-…`) must have **`is_multiline=true` and `mask_background=true`** in Map Fields.
* Overlay and download must stay aligned for wrap, mask order (mask then text; empty values still mask), and font sizing.
* Typed signatures and date signed: create/move/resize/soft-delete on DRAFT packet forms the user owns; included in generated PDFs; packet-form-specific; independently placed.
* Creator attribution: DB trigger overwrites INSERT `created_by_user_id` with `auth.uid()`; UPDATE always restores OLD.
* Preferred production order (executed 2026-08-06): migrate (`20260805220000` → `20260805230000` → **`20260806150000`**) → validate → deploy app / unique-URL smoke → apply Map Fields flags on form 15 Non-Real Estate Items as configuration data → **manually** promote custom domain.
* Static Caveat/OFL files under `public/fonts/` must bypass the auth proxy matcher; filled PDF saves use `useObjectStreams: false`; Caveat keep `customName: "HarbaughCaveat"`.
* **Deferred in this tranche (PR #31):** general free text, strikethrough, highlight, drawing, uploaded images, checkmarks, initials, reusable saved presets, automatic signature/date pairing. Those remain unimplemented. Product direction as of 2026-08-16: extend `packet_form_annotations` for document-specific markup and future signer fields (see decisions above); do not route those tools through the reusable field catalog. First-iteration markup intent is Add Text, Strikethrough, Initial field/box, and Signature field/box. Checkmark/X/underline/highlight, uploaded signature images, and reusable saved presets remain later/optional. A later 2026-09-06 decision places typed and drawn signature/initial adoption plus automatic removable signature/date pairing in scope for native Signing design; none was implemented by PR #31.

**Related files or migrations:**

* `supabase/migrations/20260805220000_fill_form_presentation_and_annotations.sql`
* `supabase/migrations/20260805230000_packet_form_annotations_created_by_immutable.sql`
* `supabase/migrations/20260806150000_packet_form_annotations_date_signed.sql`
* `lib/pdf-text-layout.ts`
* `lib/date-signed-annotation.ts`
* `lib/packet-form-annotation-placement.ts`
* `lib/fill-packet-form-pdf.ts`
* `lib/packet-form-download.ts`
* `lib/packet-form-annotations.ts`
* `components/packets/packet-form-field-overlay.tsx`
* `components/packets/packet-form-annotation-overlay.tsx`
* `public/fonts/Caveat-Regular.ttf` + `public/fonts/OFL.txt`
* `lib/signature-font.ts` / `lib/signature-font-server.ts`
* `proxy.ts`
* `scripts/validate-packet-form-annotation-auth-dev.ts`
* `scripts/smoke-fill-form-presentation-dev.ts`
* `scripts/test-fill-form-pdf-download-regressions.ts`
* `scripts/manual-qa-fill-form-53-download.ts`
* `scripts/manual-qa-date-signed-53.ts`
* `scripts/qa-date-signed-placement-path-53.ts`
* `scripts/qa-date-signed-browser-53.ts`

---

## Packet multi-contact name aggregates use reusable custom resolvers

**Date:** 2026-08-05

**Decision:**
When a PDF blank must show **all** packet contacts for a role family (for example Tenant Name(s)), use a reusable `custom_resolver` keyed like existing aggregates (`buyer_names`, and now `tenant_names`) rather than a form-specific source or a single numbered path such as `tenant_1.full_name`. Join display names with the same comma-separated convention as `buyer_names` (`formatJoinedContactNames`). Tenant selection uses the same role set as numbered `tenant_N.*` paths (TENANT, CO_CLIENT, SPOUSE, PRIMARY, OTHER), excludes inactive relationships/contacts, omits blank names, and dedupes by contact id. Resolved values remain editable at the packet field-instance level under existing override/refresh rules.

**Reason:**
Lease and notice forms need all tenant names in one blank. `tenant_1.full_name` underfills multi-tenant packets, and form-scoped duplicates would fragment the source registry.

**Consequences:**

* New multi-contact name blanks should prefer `buyer_names` / `tenant_names` (or a future role-parallel key) over inventing per-form resolvers.
* Natural “X and Y” Oxford-comma joining remains reserved for specialized composites such as `buyer_rep_agreement_between`, not ordinary name aggregates.

**Related files or migrations:**

* `lib/types/packet-contact.ts` (`getOrderedTenantContacts`)
* `lib/field-resolver.ts` (`tenant_names`)
* `lib/types/field-source.ts` (`CUSTOM_RESOLVER_KEYS`)
* `supabase/migrations/20260805210000_packet_tenant_names_resolver.sql`

---

## Test-user hard deletion (email reuse) with classified dependencies

**Date:** 2026-07-30

**Decision:**
Disposable accounts marked `profiles.is_test_user = true` may be permanently removed by Global Admins through a trusted service-role workflow that hard-deletes Auth with `deleteUser(userId, false)` (not Auth soft-delete) so the email can be reused. Before confirmation, the server builds a dependency summary and classifies rows as safe to delete, blocking (must reassign), historical retain, or skipped. Private owner-scoped business data and `users/{uid}/**` storage are deleted in FK-safe order. GLOBAL/ORGANIZATION library ownership blocks deletion. Audit events and form lifecycle history are retained; publisher/actor FKs are nulled and a `deleted_user_snapshots` row preserves identity. Self-deletion and deletion of the final active Global Admin are rejected. Streamlined deletion is refused for non-test users.

**Reason:**
Ordinary deactivate/ban leaves Auth identity and blocks email reuse for disposable test accounts. Cascading Auth delete alone would leave storage orphans, fail on RESTRICT profile FKs, or silently orphan shared library ownership.

**Consequences:**

* Only Global Admins can invoke preview/delete; UI hiding is insufficient.
* Partial failures return step-level results and mandatory audit (`test_user_deletion_failed` / `test_user_permanently_deleted`).
* Legitimate shared business records are never silently destroyed.

**Related files or migrations:**

* `supabase/migrations/20260730120000_admin_test_user_manual_create.sql`
* `lib/admin/delete-test-user.ts`
* `lib/admin/test-user-deletion-policy.ts`
* `app/admin/actions.ts`

---

## Test-user agent settings are private, retry-safe cleanup dependencies

**Date:** 2026-07-30

**Decision:**

`public.user_agent_settings` is user-owned configuration for deletion-policy purposes. Its physical primary/ownership key is `user_id` (there is no generic `id` column), and `user_id` references `auth.users(id) ON DELETE CASCADE`. Test-user dependency summaries and cleanup must map the domain key `agent_settings`, physical table/column, cleanup step, and human label explicitly. Cleanup deletes this row before profile/Auth deletion; zero rows is a successful idempotent retry.

Auth hard deletion must not be attempted until every application identity-cleanup operation succeeds. Deletion failures returned to the browser are structured and sanitized: dependency label, stage, safe explanation, optional database code, retry guidance, completed-step status, and a non-sensitive server-log reference. Empty or raw database messages must never become the user-facing error.

**Reason:**

The first production smoke test selected a nonexistent `id` column while counting `user_agent_settings`. Supabase returned an error with an empty message, producing the incomplete UI text `user_agent_settings: ` before cleanup began. Explicit schema mapping prevents this class of alias/primary-key error; retry-safe sequencing and structured failures prevent unsafe Auth deletion and unusable diagnostics.

**Consequences:**

* Agent settings are safe to hard-delete only as private configuration for a disposable test user; shared GLOBAL/ORGANIZATION business ownership remains blocking.
* Missing agent settings, memberships, preferences, or profile rows do not make a retry fail.
* Raw database details, stack traces, credentials, and record contents stay server-side.
* `deleteUser(userId, false)` remains last, after application cleanup.

**Related files:**

* `lib/admin/test-user-deletion-policy.ts`
* `lib/admin/test-user-identity-cleanup.ts`
* `lib/admin/test-user-deletion-failure.ts`
* `lib/admin/delete-test-user.ts`
* `components/admin/admin-manual-user-controls.tsx`

---

## Manually confirmed accounts without invitation email

**Date:** 2026-07-30

**Decision:**
Global Admins may create users without sending email via `auth.admin.createUser({ email, password, email_confirm: true, user_metadata })`, then provision profile, organization membership, and agent settings using the same conventions as invites. Invitation email flow remains the preferred default and is unchanged. Manual creation UI must warn that email ownership verification is bypassed. Partial failures compensate by deleting orphan Auth/application rows.

**Reason:**
Operators need confirmed test or bootstrap accounts when invitation delivery is unavailable, without opening public signup.

**Consequences:**

* Manual accounts start `onboarding_status = ACTIVE` (when account status is ACTIVE) with `must_change_password = true`.
* Duplicate email checks remain server-side.
* Compensation cleanup must not leave unexplained Auth orphans.

**Related files:**

* `lib/admin/create-manual-user.ts`
* `lib/admin/manual-create-validation.ts`
* `components/admin/admin-manual-user-controls.tsx`

---

## One-time temporary passwords; never persist or audit them

**Date:** 2026-07-30

**Decision:**
Temporary passwords for manually created users are generated or entered by the Global Admin, returned once in the successful server-action response for immediate display, and must never be written to audit metadata, database columns, URLs, browser persistence beyond the one-time UI display, logs, or error-reporting payloads. Audit sanitizer continues to redact password-named keys.

**Reason:**
Storing temporary credentials would expand blast radius and conflict with forced password change.

**Consequences:**

* UI shows an explicit “shown once / cannot be retrieved later” warning.
* Audit events record only flags such as `mustChangePassword: true`, never the secret.

**Related files:**

* `lib/admin/generate-temporary-password.ts`
* `lib/audit/sanitize.ts`
* `lib/admin/create-manual-user.ts`

---

## Forced password change after manual creation

**Date:** 2026-07-30

**Decision:**
`profiles.must_change_password` gates application access. Manually created users start with the flag true. After login (and via proxy for authenticated non-auth routes), users are redirected to `/auth/change-password` until they successfully update their password; the flag is then cleared. Users may clear only their own flag from true→false; only admins/service-role may set it true.

**Reason:**
Administrators who set temporary passwords must not remain able to use that credential indefinitely after handoff.

**Consequences:**

* `/auth/*` remains reachable while forced.
* Invite/recovery `/auth/update-password` continues to clear the flag after a successful Auth password update when present.

**Related files:**

* `lib/supabase/proxy.ts`
* `app/auth/change-password/page.tsx`
* `app/auth/actions.ts`

---

## Global Admin safeguards for test-user marking and deletion

**Date:** 2026-07-30

**Decision:**
The currently authenticated Global Admin cannot mark themselves as a test user for streamlined deletion, cannot self-hard-delete, and cannot mark or delete the final remaining active Global Admin through this flow. Existing last-admin protections for deactivate/demote remain in force.

**Reason:**
Prevent lockout and accidental destruction of the sole administrator identity.

**Consequences:**

* Server actions enforce these checks independently of UI.
* Marking additional admins as test users remains allowed only when another active admin exists.

**Related files:**

* `app/admin/actions.ts` (`setUserTestFlagAction`, `permanentlyDeleteTestUserAction`)
* `lib/admin/invite-validation.ts` (`wouldRemoveFinalActiveAdmin`)

---

## Production target enforcement respects the server/browser boundary

**Date:** 2026-07-29

**Decision:**
Production Supabase target enforcement uses the documented Vercel server/build runtime contract (`VERCEL_ENV=production`) only on server and build paths. Browser code must not require `VERCEL_ENV` or another server-only variable to use the public Supabase URL that was compiled into and served by an already validated deployment. Browser-runtime behavior and server/build-runtime behavior require separate regression coverage.

**Reason:**
The initial guard was imported by the browser Supabase client. `NEXT_PUBLIC_SUPABASE_URL` was available there, but `VERCEL_ENV` was not, so the real Production browser deterministically threw after successful login and prevented every authenticated page from loading.

**Consequences:**

* Local and Preview server/build processes still reject the production project unless explicitly authorized.
* Real Vercel Production server/build processes continue to require `VERCEL_ENV=production`.
* Browser client creation allows the deployment-provided public Supabase URL without reading server-only environment state.
* `test:supabase-guard` and `test:auth-bootstrap` cover both runtime contexts.

**Related files:**

* `lib/supabase/project-guard.ts`
* `lib/supabase/project-guard.test.ts`
* `lib/auth/authenticated-bootstrap.test.ts`
* `lib/supabase/env.ts`
* `lib/supabase/client.ts`

---

## Production ops credentials stay outside Next.js auto-load

**Date:** 2026-07-29

**Decision:**
Production operational credentials live in gitignored `.env.ops.production` and are loaded only by explicitly named production-ops npm scripts (`--env-file=.env.ops.production`). They must not use `.env.production.local`, because Next.js automatically loads that filename during `next build` / production-mode local runs. Application clients (`NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SECRET_KEY`) continue to come from `.env.local` (development) or Vercel environment scopes. A runtime/build guard rejects using production project `eetonalyyyssvkyfdoxh` for the application outside real Vercel Production (unless `HARBAUGH_ALLOW_PRODUCTION_APP=1`). Feature-branch validation uses `npm run build:validate`, which refuses a present `.env.production.local` and requires the development project ref.

**Reason:**
A prior feature validation `npm run build` reported Next loading `.env.production.local`. Even when current ops variables were TARGET_*/SOURCE_* (not app keys), auto-loading production ops files during ordinary builds is an unacceptable silent-mix risk.

**Consequences:**

* Local `npm run dev` and `npm run build:validate` use development only.
* Vercel Preview keeps Preview-scoped vars (development Supabase); Vercel Production keeps Production-scoped vars.
* Production migrations/import/export/sync scripts remain opt-in and require `.env.ops.production`.
* Recreating `.env.production.local` fails `build:validate` until removed/renamed.

**Related files:**

* `.gitignore` (`.env.ops.production`)
* `scripts/assert-safe-local-build-env.ts`
* `lib/supabase/project-guard.ts`
* `lib/supabase/env.ts`
* `lib/supabase/admin.ts`
* `package.json` (`build:validate`, production-ops scripts)

---

## Organizations remain the brokerage administration workflow

**Date:** 2026-07-29

**Decision:**
Existing `Admin → Organizations` remains the authoritative workflow for creating and maintaining multiple brokerages. A separate Brokerage/Offices administration feature was reviewed in Preview and intentionally abandoned. Brokerage offices are not modeled at this time. `organizations` continues to represent brokerage tenants (`organization_type = 'BROKERAGE'` when applicable). Legacy `brokerage_settings` remains the form-resolution singleton for compatibility and is not collapsed into organizations.

**Reason:**
Lee determined Organizations is sufficient for multi-brokerage administration. Office branching added complexity without enough product value for the initial release.

**Consequences:**

* `/admin/brokerages`, office CRUD, membership office assignment, and office-specific invite selectors were removed.
* Cleanup migration `20260730010000_remove_brokerage_offices_and_trec.sql` drops development-only office schema while retaining audit tables.
* Original combined migration `20260729210000_brokerage_offices_trec_audit.sql` remains immutable in history; both migrations together yield the audit-only final schema if ever applied elsewhere.

**Related files or migrations:**

* `supabase/migrations/20260729210000_brokerage_offices_trec_audit.sql`
* `supabase/migrations/20260730010000_remove_brokerage_offices_and_trec.sql`
* `lib/admin/manage-organizations.ts`
* `lib/types/brokerage-settings.ts`

---

## Manual license numbers; TREC automatic lookup abandoned

**Date:** 2026-07-29

**Decision:**
TREC automatic license lookup and autofill were reviewed in Preview and intentionally abandoned. Agent and broker license numbers continue to be entered manually through existing profile/invite/organization fields (`trec_license_number`, `broker_license_number`, etc.). No TREC Open Data integration, candidate UI, verification metadata columns, or TREC environment variables are part of the application.

**Reason:**
Automatic lookup is not necessary for the initial product and did not provide enough reliability or simplicity.

**Consequences:**

* `lib/trec/*`, `POST /api/admin/trec-lookup`, TREC invite UI, and TREC verification columns are removed.
* `TREC_SODA_APP_TOKEN` / `TEXAS_OPEN_DATA_APP_TOKEN` are not required and should not be documented as active configuration.
* Invitation returns to the prior simple manual license-number workflow (plus retained audit events).

**Related files:**

* `lib/admin/invite-validation.ts`
* `components/admin/admin-users-page.tsx`
* `supabase/migrations/20260730010000_remove_brokerage_offices_and_trec.sql`

---

## Configurable ordinary audit logging with mandatory security events

**Date:** 2026-07-29

**Decision:**
Basic audit logging is retained. Ordinary business audit logging is globally configurable by Global Admins (`audit_settings.ordinary_logging_enabled`). Audit-configuration enable/disable events are always recorded even when ordinary logging is disabled. Global Admin role grants/removals and related mandatory security actions remain recorded. Audit events are append-only. Metadata is minimized through a sanitizer (no passwords, tokens, secrets, full rows, or full request bodies). Browser clients cannot insert arbitrary audit rows; trusted server/service-role writers are required. The initial event set is intentionally modest and will expand later based on actual needs. Audit enable/disable remains Global Admin-only.

**Reason:**
Operators need on/off control for volume without losing the ability to prove that logging was disabled or that admin privileges changed. Lee retained audit after abandoning brokerage-office and TREC features.

**Consequences:**

* Disabling logging cannot suppress the disable event itself; prior events remain readable.
* Cross-organization audit visibility is Global Admin only.
* Office- and TREC-specific audit event types were removed with those features.
* Feature development and schema validation occur on `harbaugh-forms-dev` before any production rollout; production migrations remain deliberate and separate from feature coding.

**Related files or migrations:**

* `supabase/migrations/20260729210000_brokerage_offices_trec_audit.sql`
* `supabase/migrations/20260730010000_remove_brokerage_offices_and_trec.sql`
* `lib/audit/sanitize.ts`
* `lib/audit/record.ts`
* `lib/audit/constants.ts`
* `app/admin/audit/page.tsx`

---

## Form #1 Buyer Rep orphan TXR-2001 mappings soft-deleted

**Date:** 2026-07-28

**Decision:**
When production Form #1 (TXR-1501 Buyer Rep Agreement) was found visually corrupted, forensic comparison proved the PDF and the 55 genuine Buyer Rep placements were intact. The defect was **142 orphan ACTIVE `form_field_mappings`** for `txr_2001_*` (Residential Lease) keys wrongly attached to `form_id = 1` on 2026-07-23, while Form **18** retained the correct lease mappings. Repair was a narrowly scoped **soft-delete** (`status = 'DELETED'`) of those 142 mapping IDs only, via audited script `scripts/repair-form1-txr2001-orphans.ts`, after writing a full Form #1 mapping backup under `_audit_tmp/`. Genuine Buyer Rep coordinates were not rewritten. Packet instances and all non–Form-#1 ACTIVE mapping fingerprints were required to remain unchanged.

**Reason:**
Restoring from development was unnecessary for coordinates (already matching). Removing the orphan overlays restores Map Fields / Fill Form rendering without risking Form 18, packet snapshots, or other templates.

**Consequences:**

* Production Form #1 ACTIVE mapping count returns to 55 and matches the development fingerprint.
* Orphan DELETED duplicate `txr_2001_*` catalog fields may remain; they are not hard-deleted.
* Future bulk mapping imports must not attach foreign form-family keys to an unrelated `form_id`.
* Prevention (page-count / form-family guards) remains deferred product work.
* Lee completed production visual confirmation on 2026-07-28 after the soft-delete.
* Full row-level backup/result JSON remains local under gitignored `_audit_tmp/` (SHA-256 recorded in `project_status.md`); not committed.

**Related files:**

* `scripts/forensic-form-1-placements.ts`
* `scripts/repair-form1-txr2001-orphans.ts`
* `_audit_tmp/form1-placement-backup-2026-07-28T21-54-39-138Z.json`
* `_audit_tmp/form1-repair-result-2026-07-28T21-54-39-138Z.json`
* `MAPPING_INTEGRITY_AUDIT.md` (historical known-good Form #1 inventory)

---

## Invitation confirmation uses token-hash verifyOtp

**Date:** 2026-07-28

**Decision:**
Harbaugh Forms invitation emails must link directly to the application confirmation route with Supabase’s email OTP token hash:

```html
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/auth/update-password
```

Production Auth Site URL is `https://forms.harbaughrealestate.com`. `/auth/confirm` validates supported OTP types and calls `supabase.auth.verifyOtp({ token_hash, type })`, persisting the session through the existing Supabase SSR cookie clients. When only a PKCE `code` is present (no `token_hash`), the same route calls `exchangeCodeForSession` — these flows are not mixed. After invite verification, users set a password on the existing `/auth/update-password` page via `supabase.auth.updateUser`; the invited Auth UUID and admin-provisioned profile / organization membership rows are preserved (no second user, no admin recreate during accept).

**Reason:**
Invitees previously landed on `/auth/confirm?next=/auth/update-password` after Supabase’s ConfirmationURL verify step, so the app saw neither `token_hash` nor `type` and displayed `No token hash or type`. Token-hash verification matches the customized Resend invite template and keeps invitation acceptance under application control.

**Consequences:**

* Lee must keep the invite (and preferably recovery) email templates on the TokenHash form above; ConfirmationURL alone is insufficient for this architecture.
* Redirect allowlist must include the production domain (and Vercel fallback / localhost as needed).
* `inviteUserByEmail` `redirectTo` remains `/auth/confirm?next=/auth/update-password` for ConfirmationURL/PKCE compatibility, but the authoritative invite link is the TokenHash template.
* Previously failed invitees should receive Resend invitation or password recovery; do not create duplicate Auth users.
* Password recovery `redirectTo` also goes through `/auth/confirm` so PKCE codes are exchanged before update-password.

**Related files:**

* `app/auth/confirm/route.ts`
* `lib/auth/email-otp.ts`
* `lib/auth/password-policy.ts`
* `lib/auth/auth-confirm.test.ts`
* `app/auth/actions.ts`
* `app/auth/update-password/page.tsx`
* `components/update-password-form.tsx`
* `components/forgot-password-form.tsx`
* `lib/admin/invite-user.ts`
* `app/auth/error/page.tsx`

---

## Custom packets without a collection

**Date:** 2026-07-25

**Decision:**
Packets may use `packet_type = 'custom'` with `collection_id` null. Custom packets start with zero `packet_forms`. User documents continue to attach through existing `packet_forms` rows with `origin = external_upload` (and the existing `generated-documents` storage layout). No parallel packet-file storage was introduced. Forms remain `GLOBAL` or `PRIVATE` only; creating Global forms requires application `ADMIN` (not `ORG_ADMIN` alone). This attach path is the existing implementation for custom packets; it does **not** by itself satisfy the later product intent to import one-off received PDFs into collection-backed packets (for example an existing listing packet) without creating a reusable Form or Collection entry. See the 2026-08-16 imported-packet-document decision.

**Reason:**
Production feedback needed empty upload-only packets and explicit Private/Global form creation without inventing new storage or Organization-scoped forms.

**Consequences:**

* Forward-only migration `20260725040000_packets_custom_nullable_collection.sql` (applied on development; apply to production only with deliberate rollout).
* Collection-backed packet creation is unchanged.
* The global Fields catalog remains an internal detail; product navigation uses Form Templates / Map Fields.

**Related files:**

* `supabase/migrations/20260725040000_packets_custom_nullable_collection.sql`
* `lib/types/packet.ts` (`createCustomPacket`)
* `lib/library-permissions.ts` (`canCreateFormScope`)

---

## Production Environment Separation and Deployment

**Date:** 2026-07-24

**Decision:**
Harbaugh Forms uses separate Supabase projects for production and development. The Vercel project for this application is `harbaugh-forms` (Lee Harbaugh’s projects). The primary public URL is `https://forms.harbaughrealestate.com`. The Vercel URL `https://harbaugh-forms.vercel.app` remains a supported fallback. Production `NEXT_PUBLIC_SITE_URL` and Supabase Auth Site URL use the custom domain; the Vercel fallback remains on the Auth redirect allowlist. DNS for the custom subdomain is managed at HostPapa; DNS changes must remain limited to intended subdomain records and must not disturb unrelated HostPapa records (for example dashboard or apex records owned by other projects). Development (`harbaugh-forms-dev` / `ewxsxwzezhkeawnjvigx`) remains the source for local development and Vercel Preview. Production (`harbaugh-forms-prod` / `eetonalyyyssvkyfdoxh`) and development credentials must remain isolated. Historical migrations remain immutable; future schema changes use forward-only migrations.

**Reason:**
Isolating credentials and projects prevents Preview/local work from mutating live business data, and keeps a recoverable fallback URL if custom-domain DNS or SSL has issues.

**Consequences:**

* Do not point Preview or local `.env.local` at production credentials.
* Do not reuse or modify the separate Vercel project `harbaugh-dfw-market-dashboard` for this app.
* Invitation-only production access remains Lee-controlled until broader rollout is deliberately approved.

**Related files:**

* `project_status.md`
* `PRODUCTION_ROLLOUT_RUNBOOK.md`
* `PRODUCTION_READINESS_AUDIT.md`

---

## Selective production migration (UUID-preserving)

**Date:** 2026-07-22 (clarified 2026-07-24)

**Decision:** Migrate production data selectively from `harbaugh-forms-dev` while preserving Lee’s existing Auth UUID `e26c8f57-c0aa-4474-b43e-6e15f0260e99` and identity `b1c72b22-2835-44d9-afd4-294fc21d1ca5`. Adaptive new-UUID bootstrap is rejected. Migration used an explicit allowlist (manifest), not a full database clone.

**Approved rollout-baseline scope (historical migration evidence):**

At the completion of the July 2026 selective production migration, the validated rollout baseline contained:

* Forms **1–18** only. Forms **21, 22, and 23** were excluded. Lee may manually create any desired condo listing form after launch.
* Collections **1, 2, 3, and 5** only. Soft-deleted collections **4, 9, 12, and 14** were excluded, along with test collection **7**.
* Packets **2** and **5** only. Packet 2 retained DELETED packet forms **25** and **26** and their historical field instances.
* Contacts 2, 3, 4, 6; properties 1, 3.
* **101** ACTIVE approved defaults and **30** private storage objects (18 Global form PDFs; 12 generated documents for packets 2 and 5).
* Davey Goosmann Realty org + Lee ORG_ADMIN + brokerage/agent profile; Dee Davey as broker profile data only (not Auth).

**Rollout baseline vs live data:**

* Rollout-baseline counts are historical migration evidence, not continuously maintained production counts.
* After launch, current production data may evolve through legitimate Lee activity (and later invited users). Documentation must not treat baseline counts as present-day live inventory.

**Consequences:**

* Production must not receive Yahoo Auth, condo forms 21–23, or excluded collections via the selective migration tooling.
* Auth tooling must refuse replacement Lee UUIDs and refuse targeting `harbaugh-forms-dev` as a migration target.
* Manifest + runbook govern export/import/storage/validation scripts.

**Related files or migrations:**

* `PRODUCTION_DATA_SELECTION_MANIFEST.json`
* `SELECTIVE_PRODUCTION_DATA_MIGRATION_AUDIT.md`
* `PRODUCTION_ROLLOUT_RUNBOOK.md`
* `lib/selective-production/*`
* `scripts/migrate-approved-auth.ts`, `export-approved-production-data.ts`, `import-approved-production-data.ts`, `copy-approved-storage.ts`, `validate-production-migration.ts`
* Dev history repair for `20260722190000`, `20260722200000`, `20260722210000` (no SQL re-run)

---

## Visual PDF Field Editor

**Date:** 2026-06-10

**Decision:**  
Use a visual PDF field editor rather than AI-generated coordinate suggestions.

**Reason:**  
Coordinate mappings may become unreliable when TREC or TXR revises a form. A visual editor provides a more reviewable and maintainable workflow.

**Consequences:**

- Users place fields visually.
- Coordinates are stored behind the scenes.
- Existing form_field_mappings remains but is simplified.
- Business-field definitions are separated from PDF placement.

---

## Soft Deletes

**Date:** 2026-06-02

**Decision:**  
Use soft deletes throughout the application.

**Reason:**  
Real estate records, templates, and generated transactions should remain recoverable and auditable.

**Consequences:**

- Tables should have status or active fields.
- Normal deletion actions should mark records inactive.
- Queries should normally exclude inactive records.

---

## Form and Collection Scope

**Date:** 2026-07-15

**Decision:**
Forms may be either `GLOBAL` or `PRIVATE`. Collections may be either `ORGANIZATION` or `PRIVATE`. Collections must not be created as `GLOBAL`.

**Reason:**
Texas promulgated forms are shared statewide by agents and brokers, so individual form templates can appropriately be Global. Collections represent brokerage-specific packet workflows, preferences, and operating practices, so they should be shared only within an organization or kept private to an individual user.

**Consequences:**

* Global forms are available statewide to authenticated users.
* Organization collections are available only to active members of the assigned organization.
* Active organization members may view, use, and copy organization collections into their private collections.
* Normal organization members may not edit the organization source.
* `ORG_ADMIN` members may manage collections for their own organization.
* Application administrators may manage organization collections across organizations.
* New Global collection creation is blocked.
* Existing organization and private collections remain independently editable.
* Copying an organization collection creates a separate private collection and does not modify the organization source.

**Related files or migrations:**

* `supabase/migrations/20260715120000_organization_collections_and_property_uniqueness.sql`
* Collection permission helpers
* Collection list and detail UI
* Collection cloning functions
* Packet creation from collections

---

## Form Default Scope

**Date:** 2026-07-15 (refined 2026-07-20)

**Decision:**
Form default values may be scoped only as `PRIVATE` or `ORGANIZATION`. Default values must never be `GLOBAL`. Global forms contain structure, not preference literals.

**Reason:**
Default values represent an individual agent’s preferences or a brokerage’s operating practices. They may contain compensation preferences, protection periods, intermediary selections, preferred addenda, brokerage information, recurring checkbox selections, or office-specific wording. These values should not be published statewide merely because the underlying form is Global.

**Consequences:**

* Private defaults belong to one user.
* Organization defaults belong to one brokerage or organization.
* A user’s Private default overrides the Organization default for the same field.
* Organization defaults apply only to users with an active membership in the organization.
* Default resolution uses the packet owner or intended business user, not whichever administrator is viewing the record.
* Global forms may contain structural metadata such as:

  * PDF template
  * canonical fields
  * mappings
  * canonical placement
  * field keys, labels, widget types
  * source paths / source types
  * coordinates, AcroForm names, checkbox export values
  * formatting instructions

* Personal and Organization preference literals belong in `field_defaults`, not Global catalog default columns.
* There are currently **no approved Global preference literals**. Catalog `default_value`, `default_checked`, and `fallback_value` remain cleared of preference content.
* Explicit packet values and authoritative transaction data take precedence over defaults.
* A dedicated `field_defaults` table stores scoped preference values.

**Related files or migrations:**

* `supabase/migrations/20260715180000_field_defaults_scoped.sql`
* `supabase/migrations/20260717120000_clear_global_money_zero_defaults.sql`
* `supabase/migrations/20260717180000_clear_all_global_catalog_defaults.sql`
* `lib/types/field-default.ts`
* `lib/field-defaults.ts`
* Field-default resolution logic
* Packet field-resolution logic

---

## Unified Map Fields Workspace

**Date:** 2026-07-20

**Decision:**
Forms use one **Map Fields** workspace for Global field placement and automatic source configuration, Personal defaults, and Organization defaults. There is no separate Defaults or My Setup workflow. Structural and preference permissions remain distinct within the same workspace. Legacy `/forms/[id]/defaults` redirects into Map Fields.

**Reason:**
Users need PDF context for both structure and preferences. Separate Defaults / My setup entry points duplicated navigation and hid that preference editing and structural mapping share the same form surface. One workspace keeps terminology and permissions clear while preserving server-side authorization boundaries.

**Consequences:**

* Form Templates authorized actions: **Map Fields**, **Edit**, **Delete** (as authorized).
* Regular users and Org Admins edit preferences in Map Fields without mutating Global structure unless they are also application Admins.
* Application Admins may edit Global source, placement, and structure in the same workspace.
* Preference writes target form-scoped `field_defaults` only; catalog preference columns are never updated.
* Changing a default never refreshes or rewrites packet field instances.
* Signature / initials fields may be visible but are not editable as preference defaults.
* Cross-form defaults dashboard remains deferred.
* Legacy ACTIVE defaults with `form_id IS NULL` remain valid resolution fallbacks and are labeled / Clear-protected.

**Related files or migrations:**

* `lib/types/field-default-management.ts`
* `lib/field-defaults-management.ts`
* `components/forms/pdf-field-editor.tsx`
* `components/forms/pdf-my-setup-editor.tsx`
* `components/forms/forms-page.tsx`
* `app/forms/[id]/editor/page.tsx`
* `app/forms/[id]/defaults/page.tsx`
* Existing `field_defaults` RLS (no new migration for this UI)

---

## User-Facing Value Terminology

**Date:** 2026-07-20

**Decision:**
Use distinct value language for template configuration versus packet instances. Never expose raw resolver source values, raw database provenance enums, or the user-facing phrase **From fallback**.

### Template configuration (Map Fields)

* **Filled from** — automatic business-data source (or Not connected)
* **Default if blank** — Personal/Organization preference when automatic source is blank
* **Default source** — Personal / Organization / None (including legacy “applies to all forms”)

Do not show Current value, Value source, Manual override, or packet-instance concepts in template configuration.

### Packets → Fill Form

* **Current value** — stored/displayed packet field value
* **Value source** — readable provenance

Known sources may remain specific:

* Entered manually
* From property
* From client
* From agent profile
* From brokerage
* From packet
* From your default
* From organization default
* Blank

For ambiguous historical packet snapshots whose stored metadata only indicates a generic default/fallback (`field_default`, `field_default_checked`, or `fallback`), display:

* **Default**

Optional disclosure: **Why this value?** explains stored provenance without rewriting instances.

**Related files:**

* `lib/types/field-provenance-labels.ts`
* `components/forms/pdf-field-editor.tsx`
* `components/forms/pdf-my-setup-editor.tsx`
* `components/packets/packet-form-fields-sidebar.tsx`

---

## Form-Specific Personal Default Clear

**Date:** 2026-07-20

**Decision:**
Clearing a form-specific Personal default soft-deletes only that user’s form-scoped row for the current form. It reveals the next broader applicable default. It must not delete a legacy all-forms Personal default (`form_id IS NULL`), an Organization default, or another user’s default.

**Clear personal default** is distinct from **Remove from this form**, which is a Global structural action (application Admin only).

**Reason:**
Form-level Clear must undo a form-specific preference without destroying cross-form Personal preferences or brokerage Organization defaults.

**Consequences:**

* Server actions enforce owner + form-scope rules; UI hiding is not sufficient.
* Legacy all-forms Personal defaults remain labeled and Clear-protected.
* Soft-delete (`status = DELETED`) is used; rows are not hard-deleted.

**Related files:**

* `lib/field-defaults-management.ts`
* `components/forms/pdf-field-editor.tsx`
* `components/forms/pdf-my-setup-editor.tsx`

---

## Map Fields Role Model

**Date:** 2026-07-20

**Decision:**
Role permissions for Map Fields and scoped defaults are:

### Regular user

May:

* view Global placement and readable automatic source
* edit Personal defaults

May not:

* view technical field keys
* edit Organization defaults
* edit Global source, placement, or structure
* remove mappings or replace PDFs

### Organization Admin

May:

* edit Personal defaults
* edit Organization defaults for their own active organization

May not:

* modify Global structure unless also an application Admin

### Application Admin

May:

* edit Global source, placement, and structure
* edit Personal defaults
* edit Organization defaults with explicit organization selection
* remove fields from a form

Server-side authorization is authoritative; RLS and server actions enforce these rules.

**Related files:**

* `lib/field-defaults-management.ts`
* `components/forms/pdf-field-editor.tsx`
* `components/forms/pdf-my-setup-editor.tsx`
* Existing `field_defaults` RLS

---

## Environment and Preference Data Portability

**Date:** 2026-07-20 (superseded for environment existence 2026-07-24)

**Decision:**
Scoped preference values are database state, not application source. Git does not transfer `field_defaults` rows. Production preferences were included intentionally via the selective production migration allowlist (see Selective production migration). Development and production remain separate projects with isolated credentials.

**Supersession note:** As of 2026-07-24, production (`harbaugh-forms-prod`) exists and is live. Earlier wording that “only `harbaugh-forms-dev` exists” is historical. See “Production Environment Separation and Deployment.”

**Reason:**
Assuming Git or a deploy would recreate preferences would silently lose reviewed Personal/Organization defaults.

**Consequences:**

* Future environment clones or rebuilds must intentionally import or seed reviewed defaults.
* Do not assume Preview deployments share production preference rows.

---

## Historical Global-to-Scoped Default Transition

**Date:** 2026-07-20

**Decision:**
Future scope migrations that move preference values off Global catalog fields must reconcile every old value into one of:

* Personal
* Organization
* authoritative mapped data
* approved structural behavior
* intentional blank
* explicitly unresolved

**Reason:**
The Global-to-scoped migration initially left some values classified as structural. A later cleanup removed all Global literals. That created a transition omission for values that had not been reassigned. The omission audit restored **19** reviewed Lee Personal form-specific defaults on `harbaugh-forms-dev`. Detailed inventories belong in audit/status documentation, not this decisions file.

**Consequences:**

* Cleanup of Global preference literals must not assume every prior literal was structural.
* Unresolved items must be documented rather than silently dropped.
* See `DEFAULT_TRANSITION_AUDIT.md` and `project_status.md` for inventories and counts.

---

## Packet Field-Instance Snapshots

**Date:** 2026-07-17 (refined 2026-07-20)

**Decision:**
Persisted packet field instances are immutable during ordinary Packets → Fill Form open/view. Resolution initializes missing instances only; existing values change only through explicit user-authorized editing or refresh.

Ordinary open must not recalculate or rewrite existing field instances. It must not change:

* `value`
* `value_json`
* `source`
* `is_override`
* `update_date`

Explicit Refresh remains the only action that may recalculate eligible non-overridden values (while the packet form remains editable / `DRAFT`).

**Reason:**
Packet forms capture the agreement state that was filled for a specific client matter. Re-resolving stored non-override values on open (for example after Global catalog defaults change) silently rewrites historical packet data and can clear values that already appeared in generated or signed documents.

**Consequences:**

* Ordinary packet-form open, view, load, and download may insert field instances that are genuinely missing, using the packet owner’s resolution context.
* Ordinary open must not update, clear, or re-source any existing field instance, including null, blank, false, zero, non-override resolved values, and manual overrides.
* Explicit user actions (manual edits, per-field revert, and the editor “Refresh Values” control) remain the only paths that may rewrite existing non-override snapshots — and only while the packet form `document_state` is `DRAFT`.
* Coordinate/mapping structural maintenance must not rewrite saved packet values.
* Data repair for historically overwritten instances is a separate forward-only operation and must not restore preference literals onto Global catalog fields.

**Related files or migrations:**

* `lib/field-instance-sync.ts`
* `lib/field-resolver.ts`
* `lib/field-instances.ts`
* `lib/packet-form-editor.ts`
* Packet form editor load path

---

## Packet Form Document Lifecycle

**Date:** 2026-07-17

**Decision:**
Packet forms use the existing `document_state` values `DRAFT`, `FINAL`, `SIGNED`, and `VOID`. Field-value mutation (edit, revert, refresh, missing-instance insert/update/delete, and placement overrides) is allowed only for `ACTIVE` forms in `DRAFT`. Users may deliberately mark a Draft form Final and reopen Final to Draft. Signed and Void remain read-only; the UI does not set those states until a real signing integration exists. Soft-delete (`status`) remains separate from `document_state`.

**Reason:**
Refresh Values and open-time initialization can rewrite packet snapshots. Agents need an explicit Final lock so completed values cannot be refreshed or silently backfilled, while still allowing deliberate reopen when corrections are required. Database RLS and transition triggers enforce the lock so a stale browser tab cannot mutate after another session marks Final.

**Consequences:**

* `DRAFT`: editable; Refresh Values requires confirmation; Mark Final is available.
* `FINAL`: read-only values; Refresh blocked; ordinary open loads existing instances only (no inserts/updates); Reopen to Draft is available and does not recalculate.
* Mark Final may insert genuinely missing mapped instances using the packet owner’s resolution context, then sets `document_state = FINAL` without updating existing instances.
* `SIGNED` / `VOID`: currently read-only, with no UI transition into either state. Native in-app e-signature is the planned product capability (2026-08-16); Authentisign remains prior research, not a committed vendor. **Resolved for future signing architecture on 2026-09-05 / refined 2026-09-15:** Creating a Signing does not require `FINAL`; signing status belongs to the Signing domain, not the working `packet_form`; Create Signing opens mutable Draft preparation rather than immediately capturing immutable prepared PDFs / Package Revision 1. `SIGNED` is an unused pre-existing schema value, not legacy signing behavior. **Resolved for product terminology on 2026-09-06:** Void is rejected as a user-facing status throughout Harbaugh Forms because it is ambiguous and could imply legal authority. If implementation-time dependency and data checks confirm either underlying value is unused, removal requires a forward migration and updated lifecycle definitions. No schema change is authorized by these documentation decisions.
* Authenticated field-instance and field-instance-mapping INSERT/UPDATE require an ACTIVE DRAFT parent form.
* Privileged sessions (`auth.uid()` null) may still perform migration/admin SQL.
* Future enhancement: before/after field-diff preview prior to Refresh Values.

**Related files or migrations:**

* `supabase/migrations/20260717230000_packet_form_lifecycle_locking.sql`
* `lib/types/packet-form-lifecycle.ts`
* `lib/packet-form-lifecycle.ts`
* `lib/packet-form-editor.ts`
* `components/packets/packet-form-editor.tsx`

---

## Form Publication Lifecycle (Draft / Published / Retired)

**Date:** 2026-07-25

**Decision:**
Library form templates separate three orthogonal concepts:

1. **Record lifecycle status** (`forms.status`): `ACTIVE` (current version), `INACTIVE` (retired historical version), `DELETED` (soft-deleted). These are not a generic editable dropdown.
2. **Publication state** (`forms.publication_state`): `DRAFT` or `PUBLISHED`. Combined with status:
   - `ACTIVE` + `DRAFT` — current version under construction or temporary maintenance
   - `ACTIVE` + `PUBLISHED` — current version available for new collection additions and new packet instantiation
   - `INACTIVE` + `DRAFT` — retired historical version (read-only)
   - `INACTIVE` + `PUBLISHED` — invalid and blocked by constraint/trigger
3. **Packet-form availability** (`packet_forms.availability_state`): `AVAILABLE` or `PENDING_PUBLICATION`. Independent of packet-form `document_state` (`DRAFT` / `FINAL` / `SIGNED` / `VOID`).
4. **Form-family versioning** (`forms.form_family_key`): stable family identity (typically `form_code`, e.g. `TXR-1601`). Version-specific metadata (`version_label`, revision date, title) remains on the form row. A new revision is always a new form record; PDFs and mappings of prior versions are never replaced in place.

Explicit actions replace generic status editing: Publish Form, Unpublish Form, Retire Version, Restore Retired Version.

**Reason:**
Admins previously lacked a safe Draft/Publish model and could misuse `INACTIVE` as a temporary editing switch. Publication must gate new use without rewriting existing packet snapshots, and retirement must be a deliberate, audited, read-only historical state.

**Consequences:**

* New forms default to `ACTIVE` + `DRAFT` and show a Draft badge; they remain available in Form Templates / Map Fields for authorized users but are excluded from ordinary selectors until published.
* Only `ACTIVE` + `PUBLISHED` forms may be newly added to collections or immediately instantiated as usable packet forms.
* Published forms are protected from structural editing (PDF replace, mappings, form-field associations, automatic source configuration, shared field structural metadata). Map Fields field-catalog updates initiated on a Published form are rejected server-side until Unpublish. Preference defaults (Personal / Organization) remain editable on Published forms and never rewrite existing packet field instances. Retired (INACTIVE) forms are fully read-only, including form-specific default writes.
* Publish validates the authoritative stored PDF server-side (download + page count via pdf-lib). Publication is rejected when the PDF is missing, unreadable, or any ACTIVE mapping page is out of range.
* **Trusted publish pathway:** PDF validation runs only in the trusted application server. The `publish_form_template` RPC is not directly executable by `anon`, `authenticated`, or ordinary browser/admin Supabase clients. Final Publish always revalidates server-side (preview never authorizes a later publish). Actor identity is derived from the authenticated server session and passed as a verified actor ID; the RPC re-checks that the actor is an active application ADMIN or authorized Private-form owner and writes `published_by_user_id` / audit events from that ID (service-role calls do not trust `auth.uid()`). Database publication remains atomic. A structural fingerprint (form path + `update_date` + ACTIVE mapping inventory + mapped field source metadata) is captured at validation and rechecked inside the RPC under row locks; structural changes between validation and publication abort the publish.
* Unpublish returns `ACTIVE` + `DRAFT` and re-enables structural editing. Existing `AVAILABLE` packet forms stay available.
* Retire moves any `ACTIVE` form to `INACTIVE` + `DRAFT` (read-only). Restore is application-ADMIN only, requires a written reason, always restores to `ACTIVE` + `DRAFT` (never directly to Published), warns when a newer Published version exists in the same family, and writes an audit event. `ORG_ADMIN` alone cannot restore.
* Global publish uniqueness: at most one `ACTIVE` + `PUBLISHED` Global form per `form_family_key`. Private forms use owner-scoped uniqueness. Publishing a replacement may atomically retire the previous Published version or cancel.
* Packet creation from a collection: Published → `AVAILABLE` (normal init); Draft → `PENDING_PUBLICATION` placeholder (no field instances, no PDF, no Fill/Refresh/Final/Generate); Retired/Deleted → skip with warning; other eligible forms still instantiate.
* Pending activation runs only on Publish: eligible `PENDING_PUBLICATION` packet forms become `AVAILABLE`, initialize only missing instances in the packet owner’s context, leave existing instances unchanged, and are idempotent on repeated Publish.
* Lifecycle transitions write `form_state_events` (`FORM_CREATED`, `FORM_PUBLISHED`, `FORM_UNPUBLISHED`, `FORM_RETIRED`, `FORM_RESTORED`, `FORM_DELETED`). Admin History UI shows business labels without raw UUIDs.
* Database triggers/RPCs enforce the state machine so direct table updates cannot bypass it for authenticated sessions.
* Shared Global field metadata changes in Map Fields warn when the field is used on Published forms and require application-admin confirmation for unsafe shared structural changes.

**Related files or migrations:**

* `supabase/migrations/20260725120000_form_publication_lifecycle.sql`
* `supabase/migrations/20260725180000_secure_publish_form_template.sql`
* `lib/types/form-lifecycle.ts`
* `lib/forms/form-lifecycle-actions.ts`
* `lib/forms/publish-validation.ts`
* `lib/forms/publish-structure-fingerprint.ts`
* `lib/forms/activate-pending-packet-forms.ts`
* `lib/types/packet-form.ts`
* `components/forms/forms-page.tsx`
* `components/forms/pdf-field-editor.tsx`
* `components/collections/form-picker.tsx`

---

## Default-Value Resolution Precedence

**Date:** 2026-07-15 (refined 2026-07-20)

**Decision:**
Field values should be resolved using a deterministic precedence order that favors explicit transaction data over stored defaults. Product behavior (after current/manual packet value or explicit override):

1. Mapped transaction or packet-object value
2. Mapping-scoped Personal (Private) default
3. Form-scoped Personal default
4. Legacy field-only Personal default (`form_id IS NULL`)
5. Mapping-scoped Organization default
6. Form-scoped Organization default
7. Legacy field-only Organization default
8. Blank (or field-established blank/false/`NA` behavior)

The full product order including the current packet value is therefore:

1. Current/manual packet value or explicit override
2. Mapped transaction or packet-object value
3. Mapping-scoped Personal default
4. Form-scoped Personal default
5. Legacy field-only Personal default
6. Mapping-scoped Organization default
7. Form-scoped Organization default
8. Legacy field-only Organization default
9. Blank

The resolver may group Personal-before-Organization and mapping/form/field specificity internally; the product order above is authoritative.

**Reason:**
A stored preference should help prepopulate a form, but it should never override a value that was explicitly entered for the current transaction or resolved from the selected client, property, agent, brokerage, or packet.

**Consequences:**

* Private defaults override Organization defaults at each specificity tier.
* Deleted or inactive defaults are ignored.
* Organization defaults require an active organization and active membership.
* The user’s `primary_organization_id` determines which Organization defaults apply.
* The application must not choose an arbitrary organization when a user belongs to multiple organizations.
* An administrator viewing another user’s packet must not cause the administrator’s own defaults to be applied.
* Global catalog preference literals are not part of the preference resolution path (none approved).

**Related files or migrations:**

* `lib/types/field-default.ts` (`pickBestFieldDefault`, `resolveScopedPreferenceDefault`)
* `lib/field-defaults.ts`
* Packet field-resolution logic
* `public.field_defaults`
* User profile and primary-organization resolution

---

## Copy Private Form to Global Library

**Date:** 2026-07-15

**Decision:**
Copying a private form into the Global library creates a separate and independent Global form. The operation must not convert, reassign, or otherwise modify the source private form.

**Reason:**
A user may have invested substantial work in a private PDF template, field placements, mappings, and preferences. Making a form available statewide should not remove or alter the user’s original version.

**Consequences:**

* The source form remains `PRIVATE`.
* The source owner remains unchanged.
* The source PDF remains in its original Storage location.
* The source fields, mappings, and scoped defaults remain unchanged.
* The Global copy receives:

  * a new form ID
  * a new Global Storage path
  * copied structural mappings
  * new mapping IDs
  * appropriate Global field references
  * traceability metadata
* The Global copy does not receive:

  * Private defaults
  * Organization defaults
  * packet-specific values
  * agent-specific literals
  * brokerage-specific literals
  * collections
  * packets
  * generated PDFs
* Existing safe Global catalog fields may be reused.
* Safe structural Private fields may be converted into new Global field definitions.
* User-specific or brokerage-specific Private fields must be blocked or reviewed before publication.
* The source and Global copy do not synchronize after creation.
* Editing, deleting, replacing, or deactivating one version does not affect the other.
* The user-facing action is named `Copy to Global Library`, not Promote.
* Only active application administrators may perform the operation.
* `ORG_ADMIN` status alone does not grant this authority.

**Related files or migrations:**

* `supabase/migrations/20260715140000_form_copy_to_global_traceability.sql`
* `lib/admin/copy-form-to-global.ts`
* `lib/admin/global-form-identity.ts`
* `lib/form-owner-display.ts`
* Forms list and form-detail UI

---

## Private Form Ownership Presentation

**Date:** 2026-07-15

**Decision:**
When an application administrator views a private form owned by another user, the interface must display the owner’s identity rather than describing the form as the administrator’s form.

**Reason:**
Labels such as `Mine` or an unqualified `Private` label can incorrectly imply ownership and make administrative actions confusing or unsafe.

**Consequences:**

* A Global form is labeled `Global`.
* A user’s own private form is labeled `Private`.
* An administrator viewing another user’s private form sees:

  * `Owned by [User Name]`, or
  * `Private` together with `Owner: [User Name]`
* Owner resolution should prefer a readable profile name and fall back to an appropriate email.
* Raw user UUIDs must not be displayed.
* Standard users do not see other users’ private forms or ownership information.
* Copy to Global Library confirmation text must state that the original owner’s private form will remain unchanged.

**Related files or migrations:**

* `lib/form-owner-display.ts`
* `components/forms/forms-page.tsx`
* Form detail and editor metadata
* Library permission helpers

---

## Global Form Copy Traceability

**Date:** 2026-07-15

**Decision:**
A Global form copied from a private source should retain lightweight traceability identifying the source form, source owner, copying administrator, and copy date.

**Reason:**
Administrators need to understand where a Global form originated without creating lifecycle dependence between the source and the copy.

**Consequences:**

* The Global form records:

  * `copied_from_form_id`
  * `copied_from_owner_user_id`
  * `copied_by_user_id`
  * `copied_to_global_at`
* Traceability is informational only.
* The source form is not modified when a copy is created.
* Deleting or deactivating the source does not affect the Global copy.
* Deleting the Global copy does not affect the source.
* Foreign-key behavior must not cascade deletion between the records.
* This traceability does not replace a future full audit system.

**Related files or migrations:**

* `supabase/migrations/20260715140000_form_copy_to_global_traceability.sql`
* `forms` table
* Copy-to-Global server action

---

## Property Address Uniqueness

**Date:** 2026-07-15

**Decision:**
A user may have only one non-deleted property record for the same normalized physical address.

**Reason:**
Literal address comparisons allowed duplicate records when the same property was entered using variations such as `Court` and `Ct.`, different capitalization, spacing, state formats, or ZIP+4.

**Consequences:**

* Property uniqueness is scoped by `owner_user_id`.
* Different users may independently store the same property address.
* The uniqueness key includes normalized:

  * street address
  * unit or suite
  * city
  * state
  * ZIP5
* Normalization includes:

  * trimming
  * case normalization
  * repeated-space removal
  * supported punctuation handling
  * deterministic street-suffix normalization
  * `Texas` and `TX` equivalence
  * ZIP and ZIP+4 equivalence
  * blank and null unit equivalence
* `ACTIVE` and `INACTIVE` records block another non-deleted duplicate.
* `DELETED` records do not prevent creation of a replacement property.
* Restoring a deleted property is rejected when a conflicting non-deleted property exists.
* Editing an address to match another property owned by the same user is rejected.
* Application validation provides a clear message, but the database unique index remains authoritative.
* No property belonging to another user is exposed when reporting a duplicate.

**Related files or migrations:**

* `supabase/migrations/20260715120000_organization_collections_and_property_uniqueness.sql`
* Property normalization helpers
* Property create, edit, and restore actions
* `properties_owner_address_live_uidx`
* Property-address tests

---

## Organization Collection Permissions

**Date:** 2026-07-15

**Decision:**
Organization collection permissions are based on active organization membership and role.

**Reason:**
Brokerage packet workflows should be available to brokerage members while remaining protected from unrelated users and organizations.

**Consequences:**

### Active member

May:

* view organization collections
* view their ordered forms
* create packets directly from them
* copy them into private collections

May not:

* edit the organization source
* add, remove, or reorder forms
* delete, restore, or change status
* reassign the collection to another organization

### ORG_ADMIN

May:

* create organization collections for their own organization
* edit organization collections for their own organization
* add, remove, and reorder forms
* perform permitted lifecycle actions
* copy organization collections privately

May not:

* manage another organization’s collections

### Application ADMIN

May:

* manage organization collections across organizations
* assign an organization where permitted
* perform administrative lifecycle actions

### Outsider

May not:

* view
* copy
* use for packet creation
* mutate
* access collection forms through the collection

RLS remains authoritative for all collection permissions.

**Related files or migrations:**

* `supabase/migrations/20260715120000_organization_collections_and_property_uniqueness.sql`
* Collection RLS policies
* Collection permission helpers
* Collection copy functions
* Packet creation from collections

---

## Personal placement overrides (deferred)

**Date:** 2026-07-20

**Decision:**  
Personal placement overrides and Restore Global position remain deferred. Preference defaults are managed in the unified Map Fields workspace; moving or resizing fields remains a Global structural concern until a Personal placement product is designed.

**Reason:**  
Scoped preference editing shipped without Personal coordinate overrides. Mixing unfinished placement-override UX into Map Fields would blur structural vs preference permissions.

**Consequences:**

* No Personal placement override UI in the current Map Fields release.
* Restore Global position remains deferred with Personal placement overrides.

**Related files:**

* `components/forms/pdf-field-editor.tsx`
* `components/forms/pdf-my-setup-editor.tsx`

---

## PDF Placement Is Independent of Automatic Sourcing

**Date:** 2026-07-21

**Decision:**
PDF placement and automatic business-data sourcing are independent concerns. A field may be placed on a PDF even when it has no automatic data source, and a null `source_path` is a valid state for manual-only fields.

**Reason:**
The mapping-integrity and source-object architecture audits showed that treating "no automatic source" as a mapping defect produced false alarms (the disputed TXR-1101 mappings were visually valid; only their data-model sourcing was broken) and that many `source_type` values pointed at tables nothing maintains.

**Consequences:**

* Automatic sources are used only when a distinct upstream object or workflow owns the value independently from Fill Form (property, contact, agent profile, brokerage, organization, or an independently maintained agreement/packet object).
* Personal and Organization defaults initialize eligible packet field values but are **not** automatic source mappings.
* Map Fields shows manual-only fields as "Filled from: Not connected" while their placements and scoped defaults continue to work normally.

**Related files or migrations:**

* `MAPPING_INTEGRITY_AUDIT.md`
* `SOURCE_OBJECT_ARCHITECTURE_AUDIT.md`
* `lib/field-resolver.ts`

---

## contract_details Is Abandoned Architecture

**Date:** 2026-07-21

**Decision:**
`contract_details` is abandoned architecture. All 64 catalog fields formerly configured with `source_type = 'contract_details'` are now `manual_only` with null source paths. **Superseded for schema/code removal:** see “contract_details Architecture Removed” (2026-07-22) — the empty table and resolver/source registration were deleted via forward-only migration after this conversion.

**Reason:**
The table has zero rows, no application writer, and no user-facing UI, and no packet field instance has ever been sourced from it. Its mapped fields already functioned exclusively through scoped defaults and manual Fill Form values, so the conversion made real behavior explicit without changing it.

**Consequences:**

* TXR-1601 contract fields show "Filled from: Not connected" in Map Fields; PDF placements, Personal/Organization defaults (including `NA` and numeric `0`), and packet snapshots are unchanged.
* The migration targets explicit field IDs with strict source-type preconditions and is rerun-safe.
* `listing_agreement_details` packet-form sources were cleaned up separately on 2026-07-22 (see below).

**Related files or migrations:**

* `supabase/migrations/20260721190000_remove_abandoned_contract_details_sources.sql`
* `lib/contract-details-source-removal.test.ts`
* `SOURCE_OBJECT_ARCHITECTURE_AUDIT.md`

---

## Current Packets Do Not Use listing_agreement_details as an Automatic Source

**Date:** 2026-07-22

**Decision:**
Current collection-based packet forms do not use `listing_agreement_details` as an automatic upstream source. The Listing-details source conversion made that explicit without deleting the historical table or legacy route at the time. **Superseded for schema/route removal:** see “Legacy Listing Agreement Workflow Removed” (2026-07-22).

**Reason:**
No current listing packet links to a representation agreement / details row. Zero packet field instances (current or historical) were ever sourced from the table. Most TXR-1102 paths were never in the resolver allowlist. Lee approved converting all 129 ACTIVE `listing_agreement_details` catalog fields plus the three Listing compensation custom-resolvers that depended on dormant details columns.

**Consequences:**

* Migration `20260722010000_remove_obsolete_listing_details_sources.sql` converted **132** fields to `manual_only` (null path; custom resolvers also clear `resolver_key`).
* Lee Personal form-specific `NA` defaults were created via Map Fields for `KNOWN_DISTRICTS` and `OTHER_FEES_REIMBURSABLE_EXPENSES` on TXR-1101 (form 7).
* HOA Listing/Lease PDF fields remain `manual_only` for now (no `property_hoas` remapping in this cleanup).
* The historical details row, legacy `/listing-agreements` UI, and resolver code were removed in a later cleanup after Lee confirmed the row was disposable development data.
* TXR-1102 preference defaults were reviewed separately (see TXR-1102 decision below).

**Related files or migrations:**

* `supabase/migrations/20260722010000_remove_obsolete_listing_details_sources.sql`
* `lib/listing-details-source-removal.test.ts`
* `LISTING_AGREEMENT_DETAILS_REVIEW.md`
* `SOURCE_OBJECT_ARCHITECTURE_AUDIT.md`

---

## Legacy Listing Agreement Workflow Removed

**Date:** 2026-07-22

**Decision:**
The legacy Listing Agreement details row and parent agreement were disposable development data and were removed with Lee’s approval. Current Listing packets are collection-based and do not depend on a standalone Listing Agreement details record. The legacy `/listing-agreements` workflow and agreement-linked Listing packet creation were removed before production. Buyer Rep agreement architecture remains intact and was outside the cleanup scope. Historical migrations remain preserved; cleanup used a forward-only migration.

**Reason:**
Fresh checks confirmed details id=`1` / LISTING agreement id=`2` / client links `3`–`4` had zero packet references and zero instance provenance. ACTIVE catalog sources were already `manual_only`. Lee declined export/archive.

**Consequences:**

* Migration `20260722190000_remove_listing_legacy_workflow.sql` hard-deleted the details row, soft-deleted LISTING agreement `#2` and its seller links, dropped `listing_agreement_details`, normalized eight DELETED fields to `manual_only`, and removed the source type from `fields_source_type_check`.
* Application route, UI, types, resolver load/dispatch, and Listing legacy wizard branch were removed.
* `generatePacketFromAgreement` now accepts Buyer Rep agreements only; Listing packets are created only via Collections.
* Packet and field-instance fingerprints unchanged.

**Related files or migrations:**

* `supabase/migrations/20260722190000_remove_listing_legacy_workflow.sql`
* `lib/listing-legacy-workflow-removal.test.ts`
* `LISTING_LEGACY_WORKFLOW_CLEANUP_AUDIT.md`

---

## TXR-1102 Reviewed Personal Form-Specific Defaults

**Date:** 2026-07-22

**Decision:**
After the TXR-1102 scoped-default review and N1–N6 text-field context review, Lee approved **20** Personal form-specific defaults on Global TXR-1102 (form **#15**). Conditional, “Other,” and mutually exclusive branch blanks remain without defaults. The existing Organization all-forms **Broker Bay** default on `LEASE_SCHEDULING_COMPANY` is preserved without a Personal duplicate.

**Durable blank-vs-NA rule:**
A blank field should default to `NA` when it is a standalone narrative provision, exception, or list whose omission would leave the paragraph ambiguous. A blank field should remain blank when it belongs to an unselected checkbox, “Other” election, mutually exclusive alternative, amount, percentage, date, or other transaction-specific factual value. Defaults must not partially complete an unselected contractual branch or make two mutually exclusive alternatives appear completed.

**Approved defaults (Private, Lee, form_id = 15, mapping_id null):**

* **12 × `NA`:** `lease_non_real_estate_items`, `lease_listing_exclusions`, `lease_reimbursable_expenses`, `lease_known_financial_obligations_exception`, `lease_known_liens_exception`, `lease_optional_common_area_fees_exception`, `lease_health_safety_condition_exception`, `lease_special_provisions`, `lease_tenant_utilities_except`, `lease_items_not_repaired`, `lease_requirements_special_provisions`, `lease_requirements_other`
* **3 × preference text/number:** `lease_protection_period_days` = `30`; `lease_payment_county` = `Dallas/Tarrant`; `lease_late_charges_incurred_day` = `2`
* **5 × checked:** `lease_mls_file_immediately`, `lease_keybox_authorized_yes`, `lease_intermediary_yes`, `lease_add_iabs`, `lease_rent_due_first_day`

**Intentionally left blank / unchecked:**

* **10 conditional/Other/exclusive text fields:** `lease_broker_fee_other`, `lease_no_coop_other`, `lease_renewal_other`, `lease_sale_comp_other`, `lease_mls_delayed_purpose`, `lease_make_ready_direct_service_fee`, `lease_make_ready_reimbursement_service_fee`, `lease_add_other_document_description`, `lease_rent_due_other`, `lease_animal_restrictions`
* `lease_mls_file_listing` remains unchecked (no Personal checked default)
* Rent, deposits, compensation amounts/percentages, listing/lease dates, phones/addresses, and signatures remain without defaults

**Reason:**
Former `listing_agreement_details` schema defaults were inert surrogates, not approved preferences. Lee reviewed form wording so only true standalone N6/N1 narratives receive `NA`, while N2–N4 election branches stay blank until selected.

**Consequences:**

* New eligible TXR-1102 instances for Lee initialize the 20 approved values; Yahoo and other users do not inherit Lee’s Private rows.
* Organization `Broker Bay` continues to apply to active Davey Goosmann members.
* Historical packet field instances are unchanged by default creation and by ordinary Fill Form open (`ensure_missing`).
* No migration was required; preferences live in `field_defaults` database state (not Git).
* These 20 reviewed defaults were part of the approved selective-migration defaults baseline into production. After launch, live production defaults may evolve; do not treat historical inventories as continuously maintained live counts.

**Related files or migrations:**

* `TXR_1102_SCOPED_DEFAULT_REVIEW.md`
* `lib/txr-1102-scoped-defaults.test.ts`

---

## contract_details Architecture Removed

**Date:** 2026-07-22

**Decision:**
`contract_details` was abandoned architecture with zero rows, no writers, no UI, and no packet provenance. Its former catalog fields were converted to `manual_only` before the table and resolver infrastructure were removed. Contract form values now come from genuine business sources, scoped defaults, packet field instances, and manual Fill Form entry. Historical migrations remain intact; removal was performed through a forward-only migration.

**Reason:**
After the 2026-07-21 source-conversion phase, the empty table and dead source/resolver code remained only for temporary compatibility. Lee approved completing deletion before any production rollout. Fresh checks confirmed zero rows, zero fields with `source_type = 'contract_details'`, zero packet instances with that provenance, and a select-only application reader.

**Consequences:**

* Migration `20260722180000_remove_contract_details_architecture.sql` drops the table (no CASCADE), removes `'contract_details'` from `fields_source_type_check`, and converts six table-dependent custom-resolver fields (survey option / effective day-month-year) to `manual_only`.
* Application registries, resolver loading/dispatch, and UI source selectors no longer offer Contract Details.
* The 64 previously converted Contract fields remain `manual_only` with null paths; mappings, defaults, and packet snapshots are unchanged.
* `listing_agreement_details` and its legacy route are untouched.

**Related files or migrations:**

* `supabase/migrations/20260722180000_remove_contract_details_architecture.sql`
* `lib/contract-details-architecture-removal.test.ts`
* `SOURCE_OBJECT_ARCHITECTURE_AUDIT.md`

---

## Property HOA Storage Consolidation

**Date:** 2026-07-22

**Decision:**
`property_hoas` is the authoritative HOA data model. The Property screen intentionally exposes one HOA record (name, phone, management company), while the schema preserves multiple-HOA capability for future use. The first ACTIVE HOA row (`ORDER BY create_date, id`) is the temporary single-record UI convention — not a permanent business rule and not an `is_primary` column. Direct HOA columns on `properties` (`hoa_name`, `hoa_phone`, `hoa_management_company`) were retired as redundant. Existing development values in those columns were approved as disposable test data and were not backfilled. Clearing HOA Name soft-deletes the displayed HOA row (`status = 'DELETED'`); hard deletes are not used. Multi-HOA UI is not implemented.

**Reason:**
The Property UI already presented a single HOA form, but persisted those three fields onto `properties` while resolvers for TREC 36-10 / related catalogs already read `property_hoas`. Keeping both stores duplicated data and left `property_hoas` without writers.

**Consequences:**

* Property create/edit reads and writes one ACTIVE `property_hoas` row via `lib/property-hoa-storage.ts`.
* Catalog fields `HOA_ASSOCIATION_NAME` and `txr_2001_hoa_name` redirect to `custom_resolver` / `property_hoa_name`.
* Retained on `properties`: `has_hoa`, `hoa_contact_name`, `hoa_email`, `hoa_website`, `hoa_dues_*`.
* Packet instances, mappings, and scoped defaults are unchanged by the migration.
* Multi-HOA UI remains deferred; the single-record UI convention is temporary.

**Related files or migrations:**

* `supabase/migrations/20260722120000_consolidate_property_hoa_storage.sql`
* `lib/property-hoa-storage.ts`
* `lib/property-hoa-storage.test.ts`
* `PROPERTY_HOA_CONSOLIDATION.md`

---

## TypeScript Custom Resolvers Remain Accepted

**Date:** 2026-07-24

**Decision:**
TypeScript custom resolvers remain an accepted mechanism for concatenation, formatting, selecting rows from multi-row results, composite business values, and Buyer Rep / related logic. Unifying every resolver into a single catalog representation is optional future maintenance, not a production blocker.

**Reason:**
Several live business values are not simple single-column source paths. Removing custom resolvers would regress Buyer Rep and composite formatting without a replacement product design.

**Consequences:**

* New resolvers should remain narrowly scoped and tested.
* Dead or unreachable resolver keys may still be cleaned up when proven unused.

---

## Initial Production Access Is Invitation-Only

**Date:** 2026-07-24 (confirmation architecture clarified 2026-07-28)

**Decision:**
Initial production access is invitation-only and Lee-controlled. Public signup is not the production onboarding path. Custom SMTP and the token-hash invitation confirmation workflow should be verified with a fresh invitation smoke test before adding users beyond the launch operator. See “Invitation confirmation uses token-hash verifyOtp.”

**Reason:**
Controlled Lee-only launch reduces blast radius while real transactions are exercised in production.

**Consequences:**

* Do not broaden production Auth without explicit operational readiness (SMTP, invite template, error tracking, backup posture as needed).

---

## Source Registries Versus Historical Provenance

**Date:** 2026-07-22

**Decision:**
Source registries contain only supported current automatic-source mechanisms. Historical packet provenance may retain display-only compatibility even after a source is no longer selectable for new fields. Unused source types and custom resolvers were removed only after proving no field, packet, UI, or active workflow dependency remained. Selectable types removed include `packet`, `static_default`, `contract_details`, and `listing_agreement_details`.

**Reason:**
`packet` and `static_default` were selectable but had zero catalog fields. Fifty-three Listing/Lease `custom_resolver` keys had no runtime implementation after `listing_agreement_details` removal, while scoped defaults and Fill Form already supplied values. Buyer Rep and genuine Property/Contact/Settings/HOA sources remain first-class.

**Consequences:**

* Migration `20260722210000_remove_unused_source_registry_metadata.sql` normalized unreachable metadata and shrunk `fields_source_type_check`.
* Instance `source='packet'` still displays as “From packet”.
* Packet field instances were not rewritten.

**Related files or migrations:**

* `supabase/migrations/20260722210000_remove_unused_source_registry_metadata.sql`
* `lib/source-registry-cleanup.test.ts`
* `SOURCE_REGISTRY_AND_RESOLVER_CLEANUP_AUDIT.md`

---

## Brokerage Profile Versus Form Defaults

**Date:** 2026-07-22

**Decision:**
Brokerage profile data and form defaults are separate concerns. Genuine brokerage identity and contact fields remain in `brokerage_settings`. Form-completion preferences belong in scoped Personal or Organization `field_defaults`, not legacy `brokerage_settings.default_*` columns. Obsolete default columns were removed only after proving no live resolver, field, packet, or UI dependency remained.

**Reason:**
Seven `default_*` columns from the initial schema predated scoped defaults, were never referenced by TypeScript, and were never exposed in the Settings UI. Preferences such as market area, protection period, intermediary, payment county, and Broker Bay already live in `field_defaults`.

**Consequences:**

* Migration `20260722200000_remove_brokerage_legacy_default_columns.sql` dropped the seven columns and the `brokerage_settings_protection_period_non_negative` check.
* Profile fields and Settings save behavior are unchanged.
* No catalog field conversion was required (zero fields used those paths).

**Related files or migrations:**

* `supabase/migrations/20260722200000_remove_brokerage_legacy_default_columns.sql`
* `lib/brokerage-legacy-defaults-removal.test.ts`
* `BROKERAGE_SETTINGS_LEGACY_DEFAULTS_AUDIT.md`

---

## Buyer Rep Broker-Signature Checkbox Reactivation

**Date:** 2026-07-21

**Decision:**
`BUYER_REP_BROKER_SGN_CHECKBOX` (`2a32353f-0923-40ed-98f0-e60815ad4e96`) was reactivated as an ACTIVE, `manual_only`, unchecked-by-default catalog field. Its TXR-1501 page 6 mapping and three historical packet instances were left untouched.

**Reason:**
The field was the only ACTIVE mapping pointing at an INACTIVE catalog field in the entire database. Investigation proved its inactivation was accidental: the field matches every text criterion of the `20260701200000` AcroForm-pollution sweep heuristic (all-caps key ≥ 18 characters, effectively manual, no source path or resolver key) even though it is a real hand-drawn checkbox, and its ACTIVE mapping and instances were never inactivated with it — the signature of an incomplete cleanup, not a deduplication. No active replacement field exists: nearby candidates (`ASSOCIATE_SIGNATURE_BOX`, `listing_broker_signature_checkbox`, `lease_broker_signature_checkbox`, `BROKER_AGENT_SIGNATURE`) are semantically different controls.

**Consequences:**

* The checkbox remains on the Buyer Rep PDF at its original placement, manual-only, starting unchecked.
* The key ("SGN") is not Authentisign-excluded, so signing behavior is unchanged.
* Reactivation cannot create duplicates: no other ACTIVE GLOBAL field shares the key, and the migration guards the `fields_global_field_key_active_uidx` condition explicitly.
* Caution for future sweeps: heuristic-based catalog deactivations must verify that a field's ACTIVE hand-drawn mappings and instances are handled consistently.

**Related files or migrations:**

* `supabase/migrations/20260721190000_remove_abandoned_contract_details_sources.sql`
* `supabase/migrations/20260701200000_deactivate_acroform_polluted_catalog_fields.sql`
* `lib/contract-details-source-removal.test.ts`


---

## Selective TXR-1605 Production Form Sync

**Date:** 2026-07-25

**Decision:**
After Lee finalized TXR-1605 (TREC 30-18 Residential Condominium Contract Resale) in development, including Map Fields placement and form-scoped Organization defaults, the completed catalog configuration was selectively synchronized onto the **existing** production Global form resolved by stable identity (`form_code=TXR-1605`, `version_label=TXR-1605-05-04-2026`), not by numeric form ID. Development form id 24 and production form id 20 remain distinct. Packet field instances were never rewritten. Shared Global fields were reused without metadata changes when already compatible. New `contract_condo_*` Global fields missing in production were inserted with new production UUIDs.

**Reason:**
Production already contained an empty ACTIVE Global TXR-1605 shell (form 20) with the identical approved PDF. Creating a second production Condo form would duplicate stable identity. Broad database clone or unrestricted storage copy would violate environment isolation and packet-snapshot safety.

**Consequences:**

* Future form promotions must resolve production targets by stable identity and refuse form creation when an ACTIVE match exists.
* Guarded tooling (`scripts/sync-condo-txr-1605-to-production.ts`) defaults to dry-run and requires `--confirm EXISTING_PROD_TXR_1605` for apply.
* Rollback is soft-delete oriented and must not touch `field_instances`.

**Related files:**

* `CONDO_TXR_1605_PRODUCTION_SYNC_AUDIT.md`
* `CONDO_TXR_1605_PRODUCTION_SYNC_MANIFEST.json`
* `scripts/sync-condo-txr-1605-to-production.ts`
* `scripts/rollback-condo-txr-1605-production.ts`
* `lib/condo-txr-1605-production-sync.ts`

---

## Defense in depth for Global Admin readers

**Date:** 2026-09-11

**Decision:** Authorization belongs both at the administrator page request boundary and inside every exported service-role data reader. An administrator layout guard alone is not sufficient.

**Reason:** React Suspense can begin page content concurrently with a parent layout. A page-level privileged query can therefore run before a layout-only authorization decision is rendered. The data reader must enforce its own authorization before constructing a service-role client.

**Consequences:** Administrator pages call `requireAppAdminPage()` before any privileged load. The readers for users, organizations, memberships, membership-picker directory data, audit settings, and audit events call `requireAppAdmin()` before `createAdminClient()`. The ordinary audit-writing path reads settings through a private helper, preserving normal event logging without exposing the administrator settings reader.

**Related files:**

* `app/admin/users/page.tsx`
* `app/admin/users/[id]/page.tsx`
* `app/admin/organizations/page.tsx`
* `app/admin/organizations/[id]/page.tsx`
* `app/admin/audit/page.tsx`
* `lib/admin/list-users.ts`
* `lib/admin/manage-organizations.ts`
* `lib/admin/manage-memberships.ts`
* `lib/admin/manage-user-detail.ts`
* `lib/audit/record.ts`

---

## Workstream boundary — security remediation and Native Signing

**Date:** 2026-09-12

**Decision:** Security remediation and Native Signing remain separate workstreams. F6 changes only authorization around existing administrator data access; they do not change the approved Signing architecture or authorize Signing implementation.

**Consequences:** Resume Native Signing from the dedicated Signing decisions near the beginning of this document. Record future vulnerability fixes in clearly labeled Security sections and do not use security work to implicitly revise Signing workflow, participant, artifact, or identity decisions.

---

## Security remediation — lock framework updates to a tested version

**Date:** 2026-09-12

**Decision:** Pin the `next` dependency to `^16.3.5` and commit its regenerated lockfile. Keep React and React DOM on their existing tested 19.2.7 release for this focused security repair.

**Reason:** The previous `latest` declaration did not describe the actual locked framework version, which remained Next.js 16.2.10 and carried critical and high security advisories. A tested, explicit semver range keeps future installations on the patched release line while the lockfile makes deployment reproducible.

**Consequences:** Framework and dependency updates require the same build and targeted regression checks before deployment. On 2026-09-14, a compatible lockfile refresh moved `brace-expansion` to 1.1.18 and 5.0.9, `browserslist` to 4.28.9, `js-yaml` to 4.3.2, and `baseline-browser-mapping` to 2.11.23. The lockfile-only audit then reported zero vulnerabilities. Do not use a forced audit fix; review compatible parent ranges and validate the regenerated lockfile instead.

**Production rollout:** Deployment `2CMdac6EViudwyp6TgoQbHf8htiM` for commit `348d309` passed its isolated login-page check and was manually promoted to both production domains on 2026-09-14. The live primary domain loaded the expected login page after promotion.

---

## Security remediation — trusted form publication and lifecycle evidence

**Date:** 2026-09-12

**Decision:** Form publication is a trusted server/database operation, never a browser table update. `form_state_events` are generated only by the database lifecycle trigger and cannot be written, edited, or deleted by browser clients. The trusted publication operation supplies the verified actor in transaction-local state; the lifecycle transition rejects a direct `DRAFT` to `PUBLISHED` update when that verified actor is absent.

**Reason:** Restricting the `publish_form_template` RPC alone did not prevent an authenticated client from updating `forms.publication_state` directly, and the prior table/RPC writer surface allowed forged lifecycle evidence. A published form must represent the validated publication workflow, and its history must reflect actual state changes.

**Consequences:** The existing server action remains the publication entry point and continues to validate the PDF and structural fingerprint before calling the service-role RPC. Legitimate lifecycle events retain their automatic actor attribution. Future maintenance scripts requiring direct database repair remain privileged operations and should not be exposed as browser-accessible RPCs. This security change does not alter Native Signing design or implementation.

**Related files:**

* `supabase/migrations/20260912150000_secure_form_lifecycle_writes.sql`
* `lib/forms/form-lifecycle-actions.ts`
* `lib/forms/secure-publish.test.ts`
* `scripts/validate-secure-publish-dev.ts`

---

## Security remediation — finalized document and published template immutability

**Date:** 2026-09-13

**Decision:** Packet-form annotations and generated PDFs are mutable only while the associated packet form is ACTIVE and DRAFT. The current owner may intentionally reopen a FINAL packet form through the established lifecycle, which returns it to the DRAFT editing state. A form-template source object is mutable only while its associated form is ACTIVE and DRAFT. These restrictions apply to every authenticated browser session, including Global Admin; service-role maintenance remains privileged and is not browser-accessible.

**Reason:** Browser UI guards did not prevent a caller from writing directly to Supabase. A packet owner could alter annotations or overwrite the generated PDF after finalization, and a browser administrator could overwrite a published template object. Both outcomes undermine the historical record represented by FINAL documents and published templates.

**Consequences:** Storage mutations require an exact active DRAFT record. The packet-upload policy has a narrow provisional path allowance for the existing insert-upload-finalize flow, requiring the precise owner, packet, and packet-form identifiers. FINAL, SIGNED, and VOID packet documents remain immutable until an authorized FINAL-to-DRAFT reopen. This security repair does not revise Native Signing architecture or authorize its implementation.

**Related files:**

* `supabase/migrations/20260913120000_enforce_final_document_immutability.sql`
* `scripts/validate-final-document-immutability-dev.ts`

**Production rollout:** The migration was applied after a clean preflight on 2026-09-13. Vercel deployment `CwPBQ82NsD8bgafXpQfZAcz7Evxv` for commit `4ee764f` was verified at its isolated URL and manually promoted to the production domains.

---

## Security remediation — packet reference ownership

**Date:** 2026-09-13

**Decision:** Packet references must be valid for the packet owner at write time. An active property or representation agreement must be owned by that user. An active collection may be Global, that user’s Private collection, or an Organization collection for which the packet owner has active membership in an active organization. The field resolver independently rejects mismatched property and agreement rows, including legacy data accessed through privileged administration paths.

**Reason:** A user could attach another user’s property to their packet even though direct RLS prevented reading it. When an administrator opened the packet, privileged resolution could copy the hidden address into the attacker’s packet field instance, creating a cross-user disclosure.

**Consequences:** Browser clients receive a database rejection when they submit a foreign reference. Service-role maintenance remains explicit and privileged, while the resolver protects against legacy mismatches it encounters. This security repair does not revise Native Signing architecture or authorize its implementation.

**Related files:**

* `supabase/migrations/20260913130000_enforce_packet_reference_ownership.sql`
* `lib/field-resolver.ts`
* `scripts/validate-packet-reference-ownership-dev.ts`

**Production rollout:** After a clean preflight, migration `20260913130000_enforce_packet_reference_ownership.sql` was applied to `harbaugh-forms-prod` (`eetonalyyyssvkyfdoxh`). Vercel deployment `AVBgf1WhfGBWj7mQiS1nn637GAa1` for commit `d34ab99` passed an isolated login-page smoke test, was manually promoted to both production domains on 2026-09-13, and the live login page loaded successfully.

---

## Security remediation — mandatory audit evidence

**Date:** 2026-09-13

**Decision:** The ordinary audit-logging setting is server-only. Its change and the corresponding mandatory audit event occur in one service-role-only database operation and one transaction. Authenticated browser sessions have no table access. The trusted operation verifies the active Global Admin actor and records the old and new setting values as sanitized audit metadata.

**Reason:** A Global Admin could previously update `audit_settings.ordinary_logging_enabled` directly through the browser database client. That bypassed the separate application audit write, allowing ordinary logging to be disabled without the required evidence.

**Consequences:** A failed mandatory audit insert prevents the setting change. The administrator console remains functional through its existing server action and service-role client; direct browser reads and writes are intentionally denied. This security repair does not revise Native Signing architecture or authorize its implementation.

**Related files:**

* `supabase/migrations/20260913140000_make_audit_logging_changes_atomic.sql`
* `supabase/migrations/20260913180000_capability_guard_audit_setting_writes.sql`
* `supabase/migrations/20260913190000_block_browser_audit_setting_access.sql`
* `lib/audit/record.ts`
* `scripts/validate-audit-logging-atomic-dev.ts`

---

## Security remediation — brokerage profiles belong to organizations

**Date:** 2026-09-13

**Decision:** Brokerage settings are organization-scoped. The existing active profile belongs to **Davey Goosmann Realty**. An authenticated user may read a profile only through active membership in that profile’s organization; Global Admins retain administrative access. An active organization has at most one active brokerage profile. Packet field resolution uses the packet owner’s active primary organization, never the viewer’s organization.

**Reason:** The legacy singleton profile was visible to every authenticated user. In a multi-organization application, that exposed brokerage contact and license details across organization boundaries and could populate a packet with the viewer’s or an unrelated organization’s brokerage information.

**Consequences:** A user whose active primary organization has no brokerage profile sees blank brokerage-sourced fields until its authorized administrator creates one. The Settings page saves only the signed-in user’s primary organization profile. This security repair does not revise Native Signing architecture or authorize its implementation.

**Production rollout:** Migration `20260913200000_scope_brokerage_settings_to_organization.sql` was preflighted and applied to `harbaugh-forms-prod` on 2026-09-13. Deployment `Buf16cJ567deHtzvuiEZ1kan4NqJ` for commit `eb98228` passed its isolated login-page check and was manually promoted to both production domains.

**Related files:**

* `supabase/migrations/20260913200000_scope_brokerage_settings_to_organization.sql`
* `components/settings/settings-page.tsx`
* `lib/field-resolver.ts`
* `lib/types/brokerage-settings.ts`
* `scripts/validate-brokerage-settings-organization-dev.ts`

---

## Security remediation — authentication confirmation stays on the application origin

**Date:** 2026-09-14

**Decision:** Authentication confirmation accepts a `next` destination only when it is a control-character-free internal path. The value is decoded for validation, parsed against a fixed internal origin, required to retain that origin, and normalized to pathname, query, and fragment before it reaches the framework redirect.

**Reason:** A value beginning with a slash and a tab passed the prior string checks. URL normalization then treated the following host as an external destination after successful magic-link, invite, or recovery confirmation.

**Consequences:** Malformed, absolute, protocol-relative, backslash-based, and control-character destinations now fall back to the application home page. Normal internal destinations, including the password-update route used by invitations and recovery emails, continue to work. This security repair does not revise Native Signing architecture or authorize its implementation.

**Production rollout:** Deployment `13qMk1swTYk1zipwj4x1ujsH79EL` for commit `4e7fb74` passed its isolated login-page check and was manually promoted to both production domains on 2026-09-14.

**Related files:**

* `lib/auth/email-otp.ts`
* `lib/auth/auth-confirm.test.ts`

---

## Native Signing Stage 6 finalization implementation choices

**Date:** 2026-09-18

**Decision:**
Stage 6 finalization is implemented with these durable technical choices (product behavior was already settled):

* Work-item claim uses expiring `claimed_by` / `claimed_until` leases; the work item is never authority.
* Finalization source of truth is `frozen_package_revision_id` + prepared versions + ACCEPTED placements + locked adopted marks + preserved `rendered_sender_local_date`.
* Completed PDFs use a Signing-specific `pdf-lib` renderer (not Fill Form). Artifact reuse is authoritative when byte-identical re-render is not guaranteed.
* Drawn marks are fail-closed at finalization (`DRAWN` → FAILED): Stage 5 stores only finite `{x,y}[]` without stroke width/pressure/multi-stroke, so completed PDFs must not claim faithful drawn reproduction until a richer evidence schema exists.
* Representative signing remains deferred (no capacity/represented-party columns).
* Exactly one verified `AUDIT_CERTIFICATE` per Signing + frozen revision; chronology boundary excludes `SIGNING_COMPLETED`. Certificate wording states participants finished and finalization evidence prepared as-of the boundary; overall lifecycle Complete is asserted by surrounding artifact/lifecycle semantics after commit.
* Protected event chain uses purpose-separated `SIGNING_EVENT_CHAIN_KEY_ID` / `SIGNING_EVENT_CHAIN_KEY` (HMAC-SHA-256), genesis/checkpoint for pre-chain events, and central `appendSigningEvent`.
* Canonical event encoding v1 covers MAC-authenticated `eventOccurredAt` (server-set at append) plus sequence; wall-clock `create_date` is not a separate MAC field (DB default may diverge from append-time ISO).
* Completion commit sets `completed_at` + `VERIFIED` + lifecycle `COMPLETE` first, then appends `SIGNING_COMPLETED` with idempotent repair if Complete already landed without the event (Cancel-race-safe; crash after Complete repairs the event without regenerating artifacts).
* `completed_at` is immutable once set (DB trigger); worker never overwrites.
* `canReadCompletedSigningArtifacts` is COMPLETE-only (Cancelled/Declined do not expose completed-package reads).
* Combined package is optional post-Complete work; failure never blocks or rolls back `COMPLETE`.
* Development migrations: `20260918160000_native_signing_stage6_finalization.sql`, `20260919120000_native_signing_stage6_completed_at_immutability.sql`.

**Reason:**
Implements the settled Complete boundary with recoverable finalization, verifiable artifacts, and a protected event chain without reopening product decisions or enabling production. Review hardened drawn fail-closed, completion-event repair, COMPLETE-only artifact reads, and MAC-covered event time.

**Consequences:**

* Lifecycle `COMPLETE` requires verified completed PDFs, one certificate, and chain verification through the certificate boundary.
* Drawn-mark Signings cannot Complete until drawn evidence schema is upgraded.
* Delivery remains a later stage.
* Production Native Signing remains off and unconfigured.

**Related files or migrations:**

* `supabase/migrations/20260918160000_native_signing_stage6_finalization.sql`
* `supabase/migrations/20260919120000_native_signing_stage6_completed_at_immutability.sql`
* `lib/signing/finalization-worker.ts`, `event-chain*.ts`, `completed-pdf.ts`, `audit-certificate.ts`, `artifacts.ts`, `work-items.ts`, `finalization-retry.ts`
* `scripts/validate-native-signing-stage6-dev.ts`
* `project_status.md` (status note)
* `security.md` (local R12 Stage 6 residual notes)

---

## Post–Stage-6 next-stage sequencing: completion delivery before drawn evidence

**Date:** 2026-09-19

**Decision:**
After Stage 6 merge, the next **implementation** stage is **completion delivery + copy recipients**, not drawn-mark evidence redesign.

Drawn remains deferred while the shipping ceremony UI is typed-only: the server may accept `DRAWN` for a later surface, but Stage 5 UI exposes only typed adoption, and Stage 6 finalization fail-closes on drawn marks. That combination is acceptable for controlled production **if drawn UI stays disabled**.

Completion delivery is the stronger pre-production product gap: settled decisions already require automatic completed-copy email without login, participant entitlement, addable copy recipients, separate completed-package credentials, and delivery independence from `COMPLETE`. Stage 4 already provides invitation delivery outbox/instructions/attempts and a Resend adapter that delivery can extend; Stage 6 already produces the artifacts delivery must send.

The completion-delivery stage boundary should also include:

* durable production worker scheduling/dispatch for `FINALIZE_SIGNING`, `GENERATE_COMBINED_PACKAGE`, and completed-package delivery work;
* a minimal recovery-safe work-suspension gate so restores cannot silently resume finalization/email.

This decision records sequencing only. It does not authorize schema, code, migrations, production enablement, or new product behavior beyond the already-settled delivery decisions.

**Reason:**
Drawn evidence redesign is not required to ship typed Signing end-to-end. Automatic completed-copy delivery is already promised by product/consent decisions and is what turns Complete into a usable transaction outcome for participants and agents. Worker scheduling and recovery-safe suspension are shared prerequisites for safe automated email and production finalization.

**Consequences:**

* Next Cursor implementation/design prompt targets completion delivery + copy recipients (+ worker dispatch + recovery-safe gate).
* Drawn-mark v2 and drawn UI remain deferred; keep typed-only shipping and finalizer fail-closed until an explicit drawn stage.
* Production legal disclosure, production migrations/keys, DAST, representative signing, and polished TC UX remain separately gated.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision.

**Related files or migrations:**

* `project_status.md` (sequencing status)
* This file: **Completed copies are emailed without login and copy recipients remain addable** (2026-09-06); **Completed Signings preserve separate documents and provide one Signing-wide audit certificate** (2026-09-06); **Signing recovery preserves evidence and begins in a non-delivering safe mode** (2026-09-14); **Native Signing Stage 6 finalization implementation choices** (2026-09-18)
* No SQL migration; no schema change

---

## Native Signing completion delivery implementation choices

**Date:** 2026-09-19

**Decision:**
Completion delivery is implemented on development with these durable choices:

* **Link-first v1:** emails contain account-free package links only; `delivery_channel` reserves future attachment modes.
* **Credentials:** `signing_completed_package_credentials` are distinct from ceremony credentials; 32-byte base64url bearer; SHA-256 hash auth; purpose-separated wrap keys (`SIGNING_COMPLETED_PACKAGE_WRAP_*`, AAD purpose `completed-package-v1`) for same-link resend; Replace Link revokes and issues a new credential. Ordinary Resend reuses the current link only when the wrapped bearer is recoverable; otherwise fail closed with an actionable Replace Link error (never invent a new bearer under Resend).
* **Session:** Bearer exchanges at `/sign/completed/{token}` into HttpOnly cookie `hf_signing_completed_package` (Path `/sign/package`, Secure, SameSite=lax, **60 minutes**), then clean `/sign/package` UI; bearer remains non-expiring until revoked.
* **Copy recipients:** `signing_copy_recipients` soft-remove; email required; post-Complete manage via `canManageCompletedSigningOperations` (PRIMARY/CO_AGENT/active TC/ORG_ADMIN); revoked TC read-only. **Soft-remove revokes the current completed-package credential and derived sessions, parks pending delivery work, and denies further package access** while retaining delivery/history rows.
* **Participant email:** frozen revision email snapshot for delivery; missing/invalid → FAILED attempt without inventing addresses; identity snapshot not rewritten — use copy recipient or future intentional resend for corrected destinations.
* **Instructions vs attempts:** one instruction = intentional send; retries append attempts; intentional resend = new instruction + `COMPLETED_PACKAGE_RESEND_REQUESTED` event; provider acceptance is recorded as `ACCEPTED` (not guaranteed inbox delivery).
* **Worker dispatch:** authenticated POST `/api/internal/signing-worker` with `x-signing-worker-secret` / `SIGNING_WORKER_SECRET`; bounded batch; processes FINALIZE_SIGNING, GENERATE_COMBINED_PACKAGE, DELIVER_COMPLETED_PACKAGE, PARTICIPANT_INVITATION_EMAIL. Production cron schedule is deferred configuration.
* **Email sandbox:** `SIGNING_EMAIL_SANDBOX=true` accepts sends without Resend (dev/tests only). Rejected when `VERCEL_ENV=production`. Production must use real Resend credentials and must not enable sandbox.
* **Recovery-safe suspension:** `signing_system_controls.work_suspended` **OR** env `SIGNING_WORK_SUSPENDED=true` blocks finalization, combined package, completed-package delivery, and invitation sends (including activation-time invitation processing). Either source fails safe as suspended. Handlers recheck before external email. Queued work is preserved. Schema default remains `work_suspended=false` for normal development; **restore procedures and production enablement must deliberately set suspension / enable dispatch** — credential/session authentication after restore remains a separate residual gate beyond this worker suspension.
* Development migration: `20260919180000_native_signing_completion_delivery.sql`.

**Reason:**
Implements settled completed-copy entitlement with recoverable email, isolated credentials/sessions, and safe worker controls without enabling production or reopening drawn/representative scope.

**Consequences:**

* Complete fan-out enqueues delivery work; email failure never undoes Complete or regenerates artifacts/certificate.
* Drawn UI remains typed-only; finalizer still fail-closes DRAWN.
* Production must later configure worker secret, completed-package wrap keys, Resend, and intentional cron — not done here.

**Related files or migrations:**

* `supabase/migrations/20260919180000_native_signing_completion_delivery.sql`
* `lib/signing/completed-package-*.ts`, `copy-recipients.ts`, `signing-worker-dispatch.ts`, `work-suspension.ts`
* `app/sign/completed/[token]/route.ts`, `app/sign/package/**`, `app/api/internal/signing-worker/route.ts`
* `scripts/validate-native-signing-completion-delivery-dev.ts`
* `project_status.md`; `security.md` (local)

---

## Native Signing pre-production blocker audit sequencing (2026-09-20)

**Date:** 2026-09-20

**Decision:**
After completion-delivery merge (`f68d8bb` / bookkeeping `5a841ff`), the remaining path to controlled production Native Signing is sequenced as follows. This audit records repository evidence; it does not authorize production enablement, migrations, secrets, Cron, disclosure publication, drawn UI, or representative signing.

**Next implementation stage (exactly one):** implement the **recovery credential/session access gate** so restored environments become non-authorizing for participant and completed-package bearers and browser sessions until deliberate recovery review — fulfilling the already-approved recovery decision that today is only partially met by worker suspension.

**Recommended architecture (design target for the next implementation prompt, not implemented by this audit):**

* Keep existing **work suspension** (`signing_system_controls.work_suspended` / `SIGNING_WORK_SUSPENDED`) for finalization/delivery/invitation workers.
* Add **access suspension** and/or an environment **access epoch** bound into credential/session rows at issuance and checked on every validation. Rotating wrap keys alone does **not** invalidate bearers (auth is hash-based). Event-chain key rotation is independent and must not rewrite history.
* Restore/clone procedure: suspend work + invalidate external access (epoch bump and/or access suspension) before any email or ceremony resumes; re-issue links after review rather than silently reviving pre-restore bearers.

**Full sequence to production (ordered):**

1. Recovery credential/session access gate (implementation).
2. Production readiness scaffolding: Vercel Cron GET adapter for worker batch, secrets inventory/runbook, disclosure publication path, ops checklist; keep feature off and work suspended.
3. Focused pre-production security pass (manual adversarial + regressions); DAST breadth may follow controlled rollout.
4. Controlled Lee-only production enablement (migrations → keys → Cron suspended → unique URL smoke → promote domain → feature on → deliberate unsuspend) with typed-only personal Signings.
5. Representative signing later as needed for capacity cases.
6. Drawn evidence v2 later.

**Classifications settled by this audit (non-Lee technical):**

* Drawn UI: optional later while typed-only + finalizer fail-closed remains.
* Attachments / delivery-contact override / package Close UX / external timestamping: optional later for controlled v1.
* Provider webhooks: not a hard blocker for ACCEPTED semantics; strong follow-up (sending-domain auth remains required for production email).
* Polished TC Settings UI: not required for Lee-only rollout.
* Minimal post-Complete delivery ops path (copy/resend/replace/revoke visibility): strong practical requirement — server APIs exist; Signing dashboard currently lacks COMPLETE delivery management UI.

**Reason:**
The approved recovery decision requires restored systems to be non-delivering **and non-authorizing**. Worker suspension alone leaves invitation, ceremony, and completed-package hashes usable after DB restore. Closing that gap before production secrets and external participant email is the highest-leverage next stage.

**Consequences:**

* Next Cursor implementation prompt targets recovery access gate only.
* Production migrations/keys/Cron/Resend/disclosure/feature enablement remain separately gated.
* No application code, schema, migration, storage, route, configuration, test, or package change is made by this decision beyond documentation.

**Related files or migrations:**

* `project_status.md` (audit section)
* This file: **Signing recovery preserves evidence and begins in a non-delivering safe mode** (2026-09-14); **Native Signing completion delivery implementation choices** (2026-09-19)
* No SQL migration; no schema change

---

## Native Signing recovery credential/session access gate (2026-09-20)

**Date:** 2026-09-20

**Decision:**
Implement the recovery **external access gate** so restored or cloned databases cannot silently reactivate historical participant links, ceremony sessions, completed-package links, in-person handoffs, or device handoff locks.

**Chosen mechanics:**

* Keep existing **work suspension** (`signing_system_controls.work_suspended` / `SIGNING_WORK_SUSPENDED`) for finalization, combined package, invitation, and completed-package workers.
* Add **access suspension** (`signing_system_controls.access_suspended` **OR** env `SIGNING_ACCESS_SUSPENDED=true`) plus a global **access_epoch** stamped onto credential/session/handoff rows at issuance and checked on every validation.
* Epoch bump is atomic with access suspension (`access_suspended=true` in the same update). Resume is a separate deliberate step and never auto-reissues credentials.
* Changing `signing_system_controls.access_epoch` requires `access_suspended=true` in the same update; prior epochs are appended to `signing_access_epoch_history` and cannot be restored as current (anti-rollback / no silent bearer revival).
* Controls row deletion is rejected; missing row still fails closed in app code.
* Missing `signing_system_controls` row = fail-closed (deny). Either env or DB suspension = deny. Validation failures remain generic (null / unavailable message); epochs are never leaked.
* Issuance refuses while suspended. Validation order: suspension → structure → epoch → hash/revoke → lifecycle → scope.
* Pre-migration rows are backfilled to sentinel epoch `pre-recovery-access-v0` (distinct from the seeded current epoch) so old bearers fail closed rather than being blessed.
* `access_epoch` on credential/session/handoff tables is immutable via BEFORE UPDATE triggers.
* Participant recovery reissue uses trusted-server `replaceParticipantCredentialsWithActor`; completed-package reuses existing Replace Link.
* Invitation and completed-package email workers park/retry when access is suspended (same pattern as work suspension). **Finalization and combined-package workers do not block on access suspension alone** — evidence generation is independent of link authorization.
* Development migration seed: generate epoch E and set `access_suspended=false` on the existing default row so Stage validators that create **new** credentials keep working. Column default remains `access_suspended=true` for uninitialized rows. **Production enablement and restore procedures must deliberately set `access_suspended=true` and bump the epoch** before any email or ceremony resumes, then re-issue links after review.

**Reason:**
Worker suspension alone left invitation, ceremony, and completed-package hashes usable after DB restore. The approved recovery decision requires restored systems to be non-delivering **and non-authorizing**. Rotating wrap keys does not invalidate hash-based authentication.

**Consequences:**

* Migration `20260920180000_native_signing_recovery_access.sql` and follow-up `20260920190000_native_signing_recovery_access_controls_guard.sql` (dev apply only in this stage).
* Module `lib/signing/external-access.ts`; issuance/validation wired across participant, entry, ceremony, completed-package, handoff, and device-lock paths.
* Validators: `validate:native-signing-recovery-access-dev`; tests: `test:native-signing-recovery-access`.
* Production migrations, Cron, feature enablement, drawn UI, and representative signing remain separately gated. **When production eventually applies `20260920180000`, treat the existing-row seed (`access_suspended=false`) as development-oriented: immediately set `access_suspended=true` (and bump epoch as needed) before any worker/email/ceremony enablement.**

**Related files or migrations:**

* `supabase/migrations/20260920180000_native_signing_recovery_access.sql`
* `supabase/migrations/20260920190000_native_signing_recovery_access_controls_guard.sql`
* `lib/signing/external-access.ts`
* Credential/session modules under `lib/signing/`
* `project_status.md`; `security.md` (local R12)
* This file: **Signing recovery preserves evidence and begins in a non-delivering safe mode** (2026-09-14); **Native Signing pre-production blocker audit sequencing** (2026-09-20)
