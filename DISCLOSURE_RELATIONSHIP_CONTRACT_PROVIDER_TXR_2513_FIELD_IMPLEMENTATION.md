# Disclosure of Relationship with Contract Provider (TXR-2513) — Production Field Implementation

**Date:** 2026-07-26  
**Environment:** `harbaugh-forms-prod` / `eetonalyyyssvkyfdoxh` only  
**Development:** not modified  
**Supabase CLI link:** left on development (`ewxsxwzezhkeawnjvigx`)

---

## Resolved form

| Item | Value |
|------|-------|
| Production form ID | **26** |
| Stable identity | `form_code=TXR-2513`, `version_label=TXR-2513-05-16-2023`, `form_family_key=TXR-2513` |
| Title (catalog) | Disclosure of Relationship with Contract Provider |
| Title (PDF) | DISCLOSURE OF RELATIONSHIP WITH CONTRACT PROVIDER OR ADMINISTRATOR |
| Form number / revision | TXR-2513 / RSC-4 / 05-16-2023 |
| Status / publication | **ACTIVE** + **DRAFT** (`published_at` null) |
| Scope | GLOBAL |
| Created | 2026-07-26T20:01:30Z |

Exactly one ACTIVE + DRAFT match. Not Published, Retired, or Deleted.

---

## PDF (authoritative Storage object)

| Item | Value |
|------|-------|
| Storage path | `global/forms/26/DisclosureOfRelationshipWithContractProvider.pdf` |
| Filename | `DisclosureOfRelationshipWithContractProvider.pdf` |
| Bytes | 105649 |
| MD5 | `32c855e5ee9745b41af3d4d77fef9dbc` |
| SHA-256 | `d35c42ddf468e41f51eed28a1bb4d2ceb97c3bde5e96dcb54c64953365eb66da` |
| Pages | 1 (612×792) |
| AcroForm fields | 0 |
| Displayed title | DISCLOSURE OF RELATIONSHIP WITH CONTRACT PROVIDER OR ADMINISTRATOR |

PDF loaded from private `form-templates`. Not replaced. Path/size/checksum unchanged after writes. Publish-readiness PDF page-count inspect succeeded (1 page); form was **not** published.

---

## Counts

| Metric | Count |
|--------|------:|
| ACTIVE mappings created | **12** |
| Existing Global fields reused | **0** |
| New Global fields created | **12** |
| Text widgets | **8** |
| Checkbox widgets | **4** |
| Date widgets | **0** |
| Automatic sources | **0** |
| Custom resolvers | **0** |
| manual_only mappings | **12** |

---

## Reused Global fields

None. Listing vs Other Broker identity depends on the transaction side, so `BROKERAGE_NAME` / agent license fields were not reused for the dual-column broker name and license blanks. No existing RSC/relationship-disclosure Global fields matched these legal questions.

---

## New Global field keys (12)

All `manual_only`, null path/resolver, null Global defaults:

**Other Broker/Sales Agent column**  
1. `txr_2513_other_broker_no_compensation`  
2. `txr_2513_other_broker_receives_compensation`  
3. `txr_2513_other_broker_provider_name`  
4. `txr_2513_other_broker_services`

**Listing Broker/Sales Agent column**  
5. `txr_2513_listing_broker_no_compensation`  
6. `txr_2513_listing_broker_receives_compensation`  
7. `txr_2513_listing_broker_provider_name`  
8. `txr_2513_listing_broker_services`

**Printed broker identity**  
9. `txr_2513_other_broker_name`  
10. `txr_2513_other_broker_license_number`  
11. `txr_2513_listing_broker_name`  
12. `txr_2513_listing_broker_license_number`

Mutually exclusive checkbox pairs are separate booleans (exclusivity noted in mapping notes; no radio-group system).

---

## Excluded signing / acknowledgement fields

Not mapped (intentionally):

- Other Broker **By:** signature line  
- Listing Broker **By:** signature line  
- Buyer acknowledgement signature lines (two)  
- Seller acknowledgement signature lines (two)

---

## Unresolved / intentionally unmapped

- Broker name/license left `manual_only` rather than auto-sourcing Lee’s brokerage/agent profile, because Listing vs Other side is transaction-dependent.  
- Initial placements are approximate; Lee should refine in Map Fields (`/forms/26/editor`) before Publish.  
- No Personal or Organization defaults assigned.  
- No property address appears on this form.

---

## Isolation confirmations

| Check | Result |
|-------|--------|
| Form remains ACTIVE + DRAFT | Yes |
| Form not published | Yes |
| PDF path + checksum unchanged | Yes |
| Packets / packet_forms / field_instances unchanged | Yes (5 / 16 / 173) |
| field_defaults unchanged | Yes (106 ACTIVE) |
| Unrelated ACTIVE form mappings unchanged | Yes (1247) |
| Shared Global field metadata | Unchanged (no reused fields mutated) |
| Publish-readiness PDF inspect | OK (1 page); **not published** |
| Map Fields data prerequisites | Form + 12 ACTIVE mappings + PDF download verified via service role |

---

## Notes

- Same production Draft-form workflow as TXR-1401 / TXR-1921.  
- No application-code or schema change.  
- `decisions.md` / `project_status.md` not updated (routine Draft field configuration).
