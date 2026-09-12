# TXR-1505 — Production Field Implementation

**Date:** 2026-07-27  
**Environment:** `harbaugh-forms-prod` / `eetonalyyyssvkyfdoxh` only  
**Development:** not modified · CLI left on development

## Resolved form

| Item | Value |
|------|-------|
| Production form ID | **33** |
| Stable identity | `TXR-1505` / `TXR-1505-08-23-2024` / family `TXR-1505` |
| Title | AMENDMENT TO BUYER/TENANT REPRESENTATION AGREEMENT |
| Revision | 08-23-2024 |
| Status | **ACTIVE + DRAFT** (unpublished) |

## PDF

`global/forms/33/AmendmentToBuyerRepAgreement.pdf` · 1 page · 136349 bytes · MD5 `98618bb51a4a601ec9ff709e13a896d6` · SHA-256 `436abc35caa759fef8204dacbad64068eb4a3e89db6111633de9e040773c62aa` · AcroForm 0 · unchanged

## Counts

| Metric | Count |
|--------|------:|
| ACTIVE mappings | **36** |
| Reused Global fields | **4** |
| New Global fields | **32** |
| Widgets | date 5 · checkbox 13 · text 15 · number 3 |
| Sources | automatic 4 · manual_only 32 |

**Reuse:** `BROKERAGE_NAME`, `brokerage_license_number`, `AGENT_NAME`, `AGENT_LICENSE_NUMBER`

**New keys:** `txr_1505_agreement_date`, `txr_1505_amendment_effective_date`, `txr_1505_market_area_changed`, `txr_1505_market_area`, `txr_1505_end_date_changed`, `txr_1505_new_end_date`, `txr_1505_broker_obligations_changed`, `txr_1505_full_services`, `txr_1505_showing_services`, `txr_1505_intermediary_does`, `txr_1505_intermediary_does_not`, `txr_1505_fees_changed`, `txr_1505_purchase_fee_percent`, `txr_1505_purchase_flat_fee`, `txr_1505_purchase_property`, `txr_1505_lease_one_month_percent`, `txr_1505_lease_all_rents_percent`, `txr_1505_lease_flat_fee`, `txr_1505_lease_property`, `txr_1505_bonus_changed`, `txr_1505_bonus_amount`, `txr_1505_bonus_property`, `txr_1505_cease_services`, `txr_1505_cease_services_date`, `txr_1505_resume_on_instructions`, `txr_1505_resume_on_date_selected`, `txr_1505_resume_services_date`, `txr_1505_paragraphs_changed`, `txr_1505_paragraph_numbers`, `txr_1505_paragraph_changes_text`, `txr_1505_client_name_1`, `txr_1505_client_name_2`

## Excluded / notes

- Broker/Client signature + Date lines excluded.
- Amended values are form-specific (`txr_1505_*`); original `buyer_rep_*` fields not reused for amended market area/fees/end date.
- Map Fields: `/forms/33/editor`
