# Notice of Termination of Residential Leasing and Property Management Agreement (TXR-2222) — Production Field Implementation

**Date:** 2026-07-26  
**Environment:** `harbaugh-forms-prod` / `eetonalyyyssvkyfdoxh` only  
**Development:** not modified  
**Supabase CLI link:** left on development (`ewxsxwzezhkeawnjvigx`)

---

## Resolved form

| Item | Value |
|------|-------|
| Production form ID | **27** |
| Stable identity | `form_code=TXR-2222`, `version_label=TXR-2222-02-03-2025`, `form_family_key=TXR-2222` |
| Title (catalog / PDF) | NOTICE OF TERMINATION OF RESIDENTIAL LEASING AND PROPERTY MANAGEMENT AGREEMENT |
| Form number / revision | TXR-2222 / 02-03-2025 |
| Status / publication | **ACTIVE** + **DRAFT** (`published_at` null) |
| Scope | GLOBAL |

Exactly one ACTIVE + DRAFT match. Not Published, Retired, or Deleted.

---

## PDF (authoritative Storage object)

| Item | Value |
|------|-------|
| Storage path | `global/forms/27/NoticeOfTerminationOfLeaseAndPropertyMgmtAgmt.pdf` |
| Filename | `NoticeOfTerminationOfLeaseAndPropertyMgmtAgmt.pdf` |
| Bytes | 131208 |
| MD5 | `eded7924b6cf16df75a5ebcd5d319c72` |
| SHA-256 | `afcc046f368f369fbea1236544b4186afcf68755a5af2b916b92c48af21ac275` |
| Pages | 1 (612×792) |
| AcroForm fields | 0 |
| Displayed title | NOTICE OF TERMINATION OF RESIDENTIAL LEASING AND PROPERTY MANAGEMENT AGREEMENT |

PDF loaded from private `form-templates`. Not replaced. Path/size/checksum unchanged after writes. Publish-readiness PDF page-count inspect succeeded (1 page); form was **not** published.

---

## Counts

| Metric | Count |
|--------|------:|
| ACTIVE mappings created | **10** |
| Existing Global fields reused | **1** |
| New Global fields created | **9** |
| Text widgets | **3** |
| Checkbox widgets | **6** |
| Date widgets | **1** |
| Automatic sources | **1** |
| Custom resolvers | **0** |
| manual_only mappings | **9** |

---

## Reused Global fields (1)

| Field key | Source | Path |
|-----------|--------|------|
| `PROPERTY_FULL_ADDRESS` | `packet_property` | `full_address` |

Shared Global metadata was not modified. Reuse is appropriate for the property “at:” line.

---

## New Global field keys (9)

All `manual_only`, null path/resolver, null Global defaults:

1. `txr_2222_to_name`
2. `txr_2222_to_owner`
3. `txr_2222_to_broker`
4. `txr_2222_from_name`
5. `txr_2222_from_owner`
6. `txr_2222_from_broker`
7. `txr_2222_term_broker_cannot_continue`
8. `txr_2222_term_no_monthly_extension`
9. `txr_2222_termination_date`

Mutually exclusive checkbox pairs (TO Owner/Broker; FROM Owner/Broker) are separate booleans with exclusivity noted in mapping notes; no radio-group system.

---

## Excluded signing / acknowledgement fields

Not mapped (intentionally):

- Signature underline
- Signing party Owner checkbox
- Signing party Broker checkbox
- Signature Date

---

## Unresolved / intentionally unmapped

- §B compensation/fees/reimbursement language has no fillable blanks on the stored PDF.
- TO/FROM party names left `manual_only` (role depends on who is giving/receiving notice).
- Initial placements are approximate; Lee should refine in Map Fields (`/forms/27/editor`) before Publish.
- No Personal or Organization defaults assigned.
- No agreement-date blank appears as a separate fill on this PDF beyond the ¶A termination date.

---

## Isolation confirmations

| Check | Result |
|-------|--------|
| Form remains ACTIVE + DRAFT | Yes |
| Form not published | Yes |
| PDF path + checksum unchanged | Yes |
| Packets / packet_forms / field_instances unchanged | Yes (5 / 16 / 173) |
| field_instance fingerprint unchanged | Yes |
| field_defaults unchanged | Yes (106 ACTIVE) |
| Unrelated ACTIVE mappings unchanged | Yes (1259) |
| Shared Global field metadata unchanged | Yes (reuse only; no updates) |
| Collections / packets / packet snapshots | Untouched |
| Storage objects outside target path | Untouched |

---

## Next step for Lee

Open Map Fields for form **27**, refine placements/sources/defaults as needed, then Publish when ready. Do not treat this initial mapping as pixel-perfect.
