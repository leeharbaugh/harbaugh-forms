# TXR-1953 — Production Field Implementation

**Date:** 2026-07-26  
**Environment:** `harbaugh-forms-prod` / `eetonalyyyssvkyfdoxh` only  
**Development:** not modified  
**Supabase CLI link:** left on development (`ewxsxwzezhkeawnjvigx`)

---

## Resolved form

| Item | Value |
|------|-------|
| Production form ID | **32** |
| Stable identity | `form_code=TXR-1953`, `version_label=TXR-1953-11-07-2022`, `form_family_key=TXR-1953` |
| Title | ADDENDUM REGARDING RESIDENTIAL LEASES |
| Revision | 11-07-2022 (TREC No. 51-1) |
| Status / publication | **ACTIVE** + **DRAFT** |
| Scope | GLOBAL |

---

## PDF

| Item | Value |
|------|-------|
| Storage path | `global/forms/32/AddendumRegardingResidentialLeases.pdf` |
| Bytes | 99950 |
| MD5 | `efe9ad9847c8ad221e973f47c8229eeb` |
| SHA-256 | `eae493f1be9e511c7fb6c6044d8a4a8d1a4405f1ca9f7d4b8a41dec5bf03133b` |
| Pages | 1 |
| AcroForm fields | 0 |

---

## Counts

| Metric | Count |
|--------|------:|
| ACTIVE mappings | **9** |
| Reused Global fields | **1** (`PROPERTY_FULL_ADDRESS`) |
| New Global fields | **8** |
| Text widgets | **3** |
| Checkbox widgets | **5** |
| Number widgets | **1** |
| Automatic sources | **1** |
| manual_only | **8** |

---

## New field keys

1. `txr_1953_terminate_leases` (¶A; exclusive with B via `txr_1953_status`)
2. `txr_1953_assign_leases` (¶B)
3. `txr_1953_leases_received` (¶B(1)(a); exclusive delivery group)
4. `txr_1953_leases_not_received` (¶B(1)(b))
5. `txr_1953_terminate_within_days` (¶B(1)(b) days blank)
6. `txr_1953_oral_leases_notice` (¶B(1)(c))
7. `txr_1953_oral_leases_description`
8. `txr_1953_representations_exceptions_explain` (¶B(3))

---

## Excluded

Buyer/Seller signature lines.

---

## Intentionally unmapped

- ¶B(1)(b) “within 3 days after the Effective Date” is printed fixed text (not a blank).
- ¶B(2) security-deposit transfer language has no fill blank.
- ¶B(3)(a)–(g) are printed representations; only the “Explain if…” narrative is mapped.

---

## Notes

- Form remains ACTIVE + DRAFT. Map Fields: `/forms/32/editor`
- Automated “signing” substring check falsely matched `assign` (contains `sign_`); no signature fields were created.
