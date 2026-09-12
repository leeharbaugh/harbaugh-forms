# Batch Forms 33–37 — Production Field Implementation Summary

**Date:** 2026-07-27  
**Environment:** `harbaugh-forms-prod` / `eetonalyyyssvkyfdoxh` only  
**Development:** not modified  
**Supabase CLI link:** left on development (`ewxsxwzezhkeawnjvigx`)  
**Branch:** `main` @ `96e3e301bbdacf78b763667167907c92f55fce91` (matched `origin/main`; tracked tree clean)

Per-form audits: `TXR_1505_FIELD_IMPLEMENTATION.md`, `TXR_1422_FIELD_IMPLEMENTATION.md`, `TXR_2004_FIELD_IMPLEMENTATION.md`, `TXR_2012_FIELD_IMPLEMENTATION.md`, `TXR_1701_FIELD_IMPLEMENTATION.md`.

---

## Forms processed

| ID | Code | Version | Title | Pages | Maps | New | Reuse keys |
|---:|------|---------|-------|------:|-----:|----:|-----------:|
| 33 | TXR-1505 | TXR-1505-08-23-2024 | Amendment to Buyer/Tenant Representation Agreement | 1 | 36 | 32 | 4 |
| 34 | TXR-1422 | TXR-1422-06-15-2026 | Amendment to Farm and Ranch Listing | 1 | 31 | 26 | 5 |
| 35 | TXR-2004 | TXR-2004-01-05-2026 | Animal Agreement | 3 | 70 | 67 | 1 |
| 36 | TXR-2012 | TXR-2012-07-08-2022 | Early Termination of Residential Lease | 2 | 9 | 6 | 2 |
| 37 | TXR-1701 | TXR-1701-05-04-2026 | Farm and Ranch Contract | 12 | 219† | 57† | 151 |

† Initial batch counts. Corrective addendum (p11 broker fee-agreement) later added **+12** mappings / **+12** new fields — see `TXR_1701_FIELD_IMPLEMENTATION.md`. Form 37 ACTIVE maps after correction: **235**.

**Skipped / conflicted:** none.

---

## PDF checksums

| ID | Path | Bytes | MD5 |
|---:|------|------:|-----|
| 33 | `global/forms/33/AmendmentToBuyerRepAgreement.pdf` | 136349 | `98618bb51a4a601ec9ff709e13a896d6` |
| 34 | `global/forms/34/AmendmentToFarmAndRanchListing.pdf` | 135315 | `852d39d3f817b364eb53e98519a2b98e` |
| 35 | `global/forms/35/AnimalAgreement.pdf` | 192724 | `e0b91b38213e7472d5ff32a5089a9a80` |
| 36 | `global/forms/36/EarlyTerminationOfResidentialLease.pdf` | 143676 | `109e74d7fd54b509d425d43f5788bc8a` |
| 37 | `global/forms/37/FarmAndRanchContract.pdf` | 210369 | `f412e50d395a0e6ef0a0bc0e06fdcaa8` |

All PDFs unchanged. No Storage rewrites.

---

## Batch totals

| Metric | Count |
|--------|------:|
| Forms processed | **5** |
| Forms skipped | **0** |
| Total ACTIVE mappings | **365** (+12 corrective → **377** for this form set’s authored maps) |
| Unique reused Global fields | **156** |
| Total new Global fields | **188** (+12 corrective → **200**) |
| Aggregate sources (mappings) | auto ~42 · custom_resolver ~3 · manual_only ~320 (+12 manual_only corrective) |
| Published in batch | **0** |

---

## Design notes

- **Amendments (1505/1422):** amended values are form-specific namespaces; original buyer-rep / residential listing-amendment fields not reused for amended amounts/dates.
- **Animal Agreement:** four separate animal slots; lease-catalog animal fees not reused.
- **Farm and Ranch Contract:** large reuse of shared `contract_*` catalog where meaning is identical; 57 `txr_1701_*` fields for farm-only elections (accessories, survey adjustment, natural/surface leases, Ag district, H disclosures, etc.).
- No Personal/Organization defaults; no shared Global metadata mutation; no schema/resolver changes.

---

## Safety fingerprints

| Metric | Before | After |
|--------|-------:|------:|
| packets | 5 | 5 |
| packet_forms | 16 | 16 |
| field_instances | 173 | 173 |
| field_instance fingerprint | `6aed0c43…71c5d3` | unchanged |
| collections | 4 | 4 |
| ACTIVE defaults | 106 | 106 |
| published ACTIVE forms | 28 | 28 |
| unrelated ACTIVE mappings | 1317 | 1317 |
| ACTIVE fields | 951 | 1139 (+188) |
| ACTIVE mappings | 1317 | 1682 (+365) |

---

## Confirmations

- All five remain **GLOBAL + ACTIVE + DRAFT**; **none published**.
- Packets, snapshots, collections, defaults, unrelated mappings, and PDFs untouched.
- Lee can refine placements in Map Fields: `/forms/33/editor` … `/forms/37/editor`.
