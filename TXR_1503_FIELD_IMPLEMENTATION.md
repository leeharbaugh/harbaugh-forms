# TXR-1503 — Production Field Implementation

**Date:** 2026-07-27  
**Environment:** `harbaugh-forms-prod` / `eetonalyyyssvkyfdoxh` only  

## Resolved form

| Item | Value |
|------|-------|
| Production form ID | **49** |
| Stable identity | `TXR-1503` / `TXR-1503-01-05-2026` / family `TXR-1503` |
| Title | TERMINATION OF BUYER/TENANT REPRESENTATION AGREEMENT |
| Revision | 01-05-26 |
| Status | **ACTIVE + DRAFT** |

## PDF

`global/forms/49/TerminationOfBuyerRep.pdf` · **1 page** · 157443 bytes · MD5 `840041a0ef2042bec3cccbc5255f4928` · SHA-256 `94afb387f1117aa860e0bea14b4f88b655412584979cf97b6df1d50a9ce43c5b` · AcroForm 0 · unchanged

## Counts

| Metric | Count |
|--------|------:|
| Visual substantive targets | **14** |
| ACTIVE mappings | **14** |
| Reused | **2** (`buyer_rep_effective_date`, `BROKERAGE_NAME`) |
| New fields | **12** |
| Checkboxes | **5** |
| Widgets | date 3 · text 4 · number 2 · checkbox 5 |
| Sources | representation_agreement + brokerage reuse; 12 manual_only |
| Unexplained | **0** |
| Checkbox overlay failures remaining | **0** |

## New keys

`txr_1503_termination_date`, `txr_1503_termination_fee`, `txr_1503_protection_on_or_before`, `txr_1503_fee_sales_pct_selected`, `txr_1503_fee_sales_pct`, `txr_1503_fee_rent_pct_selected`, `txr_1503_fee_rent_pct`, `txr_1503_fee_other_selected`, `txr_1503_fee_other_text`, `txr_1503_protect_market_area`, `txr_1503_protect_listed_properties`, `txr_1503_protected_properties`

## Checkbox placement

Glyph-centered from printed `❑` (checkboxFromGlyph). Overlay validation center distance OK; remaining failures **0**.

## Multiline

- D(1)(c) other: two substantial lines → one multiline  
- D(2)(b) properties: omit short first after “properties:”; cover five full lines  

## Excluded

Broker By:/Date; two Client signature/Date lines; brokerage footer; section-heading false underlines; E Release (no blanks). Did not reuse original buyer-rep compensation/protection-day fields for termination-specific values.

## Confirmations

Remains ACTIVE + DRAFT; PDF unchanged; unexplained=0; isolation OK. Map Fields: `/forms/49/editor`
