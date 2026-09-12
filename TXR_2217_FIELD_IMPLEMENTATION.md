# TXR-2217 — Production Field Implementation

**Date:** 2026-07-27  
**Environment:** `harbaugh-forms-prod` / `eetonalyyyssvkyfdoxh` only  

## Resolved form

| Item | Value |
|------|-------|
| Production form ID | **42** |
| Stable identity | `TXR-2217` / `TXR-2217-04-13-2007` / family `TXR-2217` |
| Title | NOTICE OF LANDLORD'S INTENT NOT TO RENEW |
| Revision | 4-13-07 |
| Status | **ACTIVE + DRAFT** |

## PDF

`global/forms/42/NoticeOfLandlordsIntentNotRenew.pdf` · **1 page** · 111710 bytes · MD5 `bfbc479700b05ba34ebdfa896fdbd050` · SHA-256 `15da1b5509dc2ae0811ded3f41ebd93c750414412755d9d1c69d4fceced38382` · unchanged

## Counts

| Metric | Count |
|--------|------:|
| Visual substantive targets | **14** |
| ACTIVE mappings | **14** |
| Reused | **4** (`landlord_name_1`, `PROPERTY_FULL_ADDRESS`, `AGENT_NAME`, `BROKERAGE_NAME`) |
| New fields | **10** |
| Unexplained | **0** |
| Widgets | text 8 · checkbox 3 · date 3 |
| Sources | automatic 4 · manual_only 10 |

## New keys

`txr_2217_tenant_names`, `txr_2217_lease_end_date`, `txr_2217_delivery_certified_mail`, `txr_2217_delivery_certified_mail_no`, `txr_2217_delivery_hand`, `txr_2217_delivery_hand_to`, `txr_2217_delivery_hand_on`, `txr_2217_delivery_hand_by`, `txr_2217_delivery_other_selected`, `txr_2217_delivery_other_text`

## Multiline

Property address after “at” — short first line + continuation → `PROPERTY_FULL_ADDRESS`.

## Excluded

Landlord signature/Date; By: signature/Date. Means of Delivery service-log blanks **are** mapped (not treated as signing-only acknowledgements). Printed Name / Firm Name mapped as agent/brokerage identity (non-signature).

## Confirmations

Remains ACTIVE + DRAFT; PDF unchanged. Map Fields: `/forms/42/editor`
