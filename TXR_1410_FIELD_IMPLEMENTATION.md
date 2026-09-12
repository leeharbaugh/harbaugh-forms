# TXR-1410 — Production Field Implementation

**Date:** 2026-07-27  
**Environment:** `harbaugh-forms-prod` / `eetonalyyyssvkyfdoxh` only  

## Resolved form

| Item | Value |
|------|-------|
| Production form ID | **50** |
| Stable identity | `TXR-1410` / `TXR-1410-04-14-2006` / family `TXR-1410` |
| Title | TERMINATION OF LISTING |
| Revision | 4-14-06 |
| Status | **ACTIVE + DRAFT** |

## PDF

`global/forms/50/TerminationOfListing.pdf` · **1 page** · 114319 bytes · MD5 `3c2f73292ff223a93fceb63fe66a7faf` · SHA-256 `1c6a5ce2e91c3fd45e0bab0aabe86bf660b75222e3731848ad3fbf2aadfa2e04` · AcroForm 0 · unchanged  

Followed the **2006** stored PDF (not a newer termination form).

## Counts

| Metric | Count |
|--------|------:|
| Visual substantive targets | **15** |
| ACTIVE mappings | **15** |
| Reused | **3** (`PROPERTY_FULL_ADDRESS`, `BROKERAGE_NAME`, `brokerage_license_number`) |
| New fields | **12** |
| Checkboxes | **5** |
| Widgets | text 5 · date 2 · number 2 · checkbox 5 (+ address/broker reuse text) |
| Sources | property + brokerage reuse; 12 manual_only |
| Unexplained | **0** |
| Checkbox overlay failures remaining | **0** |

## New keys

`txr_1410_termination_date`, `txr_1410_termination_fee`, `txr_1410_protection_on_or_before`, `txr_1410_fee_sales_pct_selected`, `txr_1410_fee_sales_pct`, `txr_1410_fee_rent_pct_selected`, `txr_1410_fee_rent_pct`, `txr_1410_fee_other_selected`, `txr_1410_fee_other_text`, `txr_1410_protect_anyone`, `txr_1410_protect_listed_parties`, `txr_1410_protected_parties`

## Checkbox placement

Glyph-centered from printed ``. Overlay validation remaining failures **0**.

## Multiline

- D(2)(c) other: two substantial lines → one multiline  
- D(3)(b) protected parties: three substantial lines → one multiline  

## Excluded

Broker associate signature/date; two Seller/Landlord signature/date lines; brokerage footer; E Release; A/B definitions. Did **not** revive `listing_agreement_details`.

## Confirmations

Remains ACTIVE + DRAFT; PDF unchanged; unexplained=0; isolation OK. Map Fields: `/forms/50/editor`
