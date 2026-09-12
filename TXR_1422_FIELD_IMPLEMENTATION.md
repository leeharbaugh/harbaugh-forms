# TXR-1422 — Production Field Implementation

**Date:** 2026-07-27  
**Environment:** `harbaugh-forms-prod` / `eetonalyyyssvkyfdoxh` only  
**Development:** not modified · CLI left on development

## Resolved form

| Item | Value |
|------|-------|
| Production form ID | **34** |
| Stable identity | `TXR-1422` / `TXR-1422-06-15-2026` / family `TXR-1422` |
| Title | AMENDMENT TO FARM AND RANCH LISTING - EXCLUSIVE RIGHT TO SELL |
| Revision | 06-15-2026 |
| Status | **ACTIVE + DRAFT** |

## PDF

`global/forms/34/AmendmentToFarmAndRanchListing.pdf` · 1 page · 135315 bytes · MD5 `852d39d3f817b364eb53e98519a2b98e` · SHA-256 `c7fbcd045d01c42631ecc51e6dae3e14fa5d268a821eaeddd55b3dac20706987` · AcroForm 0 · unchanged

## Counts

| Metric | Count |
|--------|------:|
| ACTIVE mappings | **31** |
| Reused | **5** |
| New | **26** |
| Widgets | text 13 · date 4 · checkbox 12 · number 2 |
| Sources | automatic 5 · manual_only 26 |

**Reuse:** `PROPERTY_FULL_ADDRESS`, `BROKERAGE_NAME`, `brokerage_license_number`, `AGENT_NAME`, `AGENT_LICENSE_NUMBER`

**New keys:** `txr_1422_amendment_effective_date`, `txr_1422_listing_price_changed`, `txr_1422_new_listing_price`, `txr_1422_end_date_changed`, `txr_1422_new_end_date`, `txr_1422_broker_fee_changed`, `txr_1422_fee_paragraph_5a1`, `txr_1422_fee_paragraph_5b`, `txr_1422_fee_percent_or_flat`, `txr_1422_fee_percent`, `txr_1422_fee_flat`, `txr_1422_fee_other`, `txr_1422_fee_other_text`, `txr_1422_other_broker_comp_changed`, `txr_1422_other_broker_percent`, `txr_1422_other_broker_flat`, `txr_1422_cease_marketing`, `txr_1422_cease_marketing_date`, `txr_1422_resume_on_instructions`, `txr_1422_resume_on_date_selected`, `txr_1422_resume_marketing_date`, `txr_1422_paragraphs_changed`, `txr_1422_paragraph_numbers`, `txr_1422_paragraph_changes_text`, `txr_1422_owner_name_1`, `txr_1422_owner_name_2`

## Excluded / notes

- Owner/Broker signatures excluded.
- Farm/ranch amendment values are `txr_1422_*` (not residential `listing_amendment_*`) to avoid conflating listing families.
- Map Fields: `/forms/34/editor`
