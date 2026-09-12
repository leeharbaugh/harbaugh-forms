# TXR-2012 — Production Field Implementation

**Date:** 2026-07-27  
**Environment:** `harbaugh-forms-prod` / `eetonalyyyssvkyfdoxh` only  
**Development:** not modified · CLI left on development

## Resolved form

| Item | Value |
|------|-------|
| Production form ID | **36** |
| Stable identity | `TXR-2012` / `TXR-2012-07-08-2022` / family `TXR-2012` |
| Title | EARLY TERMINATION OF RESIDENTIAL LEASE |
| Revision | 07-08-2022 |
| Status | **ACTIVE + DRAFT** |

## PDF

`global/forms/36/EarlyTerminationOfResidentialLease.pdf` · 2 pages · 143676 bytes · MD5 `109e74d7fd54b509d425d43f5788bc8a` · SHA-256 `4c6da8c18ea078fd7af6ca03b58028a5dbbcf1393ed6f66156a917b266659c20` · AcroForm 0 · unchanged

## Counts

| Metric | Count |
|--------|------:|
| ACTIVE mappings | **9** |
| Reused | **2** |
| New | **6** |
| Widgets | text 6 · date 3 |
| Sources | automatic 3 · manual_only 6 |

**Reuse:** `PROPERTY_FULL_ADDRESS` (p1 + p2 header), `txr_2001_tenant_names`

**New:** `txr_2012_landlord_names`, `txr_2012_prior_lease_date`, `txr_2012_termination_date`, `txr_2012_termination_fee`, `txr_2012_termination_fee_due_date`, `txr_2012_special_provisions`

## Excluded / notes

- Signature blocks excluded.
- No forwarding-address blank on the stored PDF (obligation text only) — intentionally unmapped.
- Prorated rent / security-deposit treatment are contractual language without fill blanks.
- Map Fields: `/forms/36/editor`
