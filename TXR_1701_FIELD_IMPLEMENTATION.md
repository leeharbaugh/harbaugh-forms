# TXR-1701 — Production Field Implementation

**Date:** 2026-07-27  
**Environment:** `harbaugh-forms-prod` / `eetonalyyyssvkyfdoxh` only  
**Development:** not modified · CLI left on development

## Resolved form

| Item | Value |
|------|-------|
| Production form ID | **37** |
| Stable identity | `TXR-1701` / `TXR-1701-05-04-2026` / family `TXR-1701` |
| Title | FARM AND RANCH CONTRACT |
| Revision | 05-04-2026 (TREC 25-17) |
| Status | **ACTIVE + DRAFT** |

## PDF

`global/forms/37/FarmAndRanchContract.pdf` · **12 pages** · 210369 bytes · MD5 `f412e50d395a0e6ef0a0bc0e06fdcaa8` · SHA-256 `a3be71058bcab103407fcac1e67dbf6dd839cecaf9f188dc5b474c924bffd9e1` · AcroForm 0 · unchanged

## Counts

| Metric | Count |
|--------|------:|
| ACTIVE mappings | **219** |
| Unique reused Global fields | **151** |
| New Global fields | **57** |
| Widgets (by mapping) | text 114 · checkbox 100 · number 5 |
| Sources | automatic 27 · custom_resolver 3 · manual_only 189 |

## Reuse strategy

Shared `contract_*` / property / notice / addenda / survey / disclosure fields reused where legal meaning matches the 1-4 Family Residential Contract (sales price, earnest/option, title/escrow, closing, possession, addenda checklist, buyer/seller names, broker notice contacts, etc.).

`PROPERTY_FULL_ADDRESS` mapped on all 12 page headers. Also reused `property_county`, `property_legal_description`.

## New `txr_1701_*` (57) — farm/ranch-specific

Accessories (portable buildings, hunting blinds, game feeders, livestock feeders/troughs, irrigation, fuel tanks, pumps, pressure tanks, corrals, gates, chutes, other + other text); exclusions; survey price-adjustment elections (will/will not, base acres, $/acre, terminate days, apply to 3A/3B/proportionately); ¶4 subject-to residential/fixture/natural-resource/surface leases; natural-resource and surface-lease delivery options + days + oral descriptions; survey option “no survey”; permitted surface leases; Texas Ag Development District is/is not; seller disclosure H(1)–H(8) aware/not (+ wholly/partly floodplain) + explanation; government programs.

## Excluded

- Initials for identification  
- Buyer/Seller signatures (p10)  
- Broker fee-agreement signatures (p11)  
- Option/earnest/contract/additional-earnest receipts (p12)

## Notes

- No new schema/resolver work required; `contract_details` not revived.
- Placements approximate across 12 pages — Lee should refine in Map Fields (`/forms/37/editor`) before Publish.
- Form remains ACTIVE + DRAFT; not published.

---

## Corrective addendum — page 11 broker fee-agreement (2026-07-27)

**Reason:** The broker-compensation / fee-agreement paragraph at the bottom of page 11 was omitted from the initial TXR-1701 mapping pass. This addendum maps only that paragraph.

**Paragraph location:** Page 11, bottom — printed text beginning “Upon closing of the sale…” covering **(a)** payment of Seller’s broker and **(b)** payment of Buyer’s broker (Seller/Buyer payer elections; cash fee $ blank or % of total Sales Price).

**Fields reused:** none (¶12B contribution fields intentionally not reused — different legal meaning).

**New fields created (12), all `manual_only`:**

| Key | Widget |
|-----|--------|
| `txr_1701_broker_comp_a_seller_pays` | checkbox |
| `txr_1701_broker_comp_a_buyer_pays` | checkbox |
| `txr_1701_broker_comp_a_cash_fee_selected` | checkbox |
| `txr_1701_broker_comp_a_cash_fee_amount` | text (money blank) |
| `txr_1701_broker_comp_a_percent_selected` | checkbox |
| `txr_1701_broker_comp_a_percent` | number |
| `txr_1701_broker_comp_b_seller_pays` | checkbox |
| `txr_1701_broker_comp_b_buyer_pays` | checkbox |
| `txr_1701_broker_comp_b_cash_fee_selected` | checkbox |
| `txr_1701_broker_comp_b_cash_fee_amount` | text (money blank) |
| `txr_1701_broker_comp_b_percent_selected` | checkbox |
| `txr_1701_broker_comp_b_percent` | number |

**Mappings added:** **12** (page 11 only; approximate placements).

**Widget counts (this correction):** checkbox 8 · text 2 · number 2.

**Ambiguity / intentionally unmapped:**
- No broker-name blanks in this paragraph (payer is Seller/Buyer checkbox only).
- No “other” explanation blank in this paragraph.
- Broker fee-agreement **signatures** remain excluded (unchanged policy).
- ¶12B seller/buyer broker-contribution fields elsewhere on the form were not reused or modified.

**Isolation confirmation:**
- No existing form-37 mapping deleted or moved (pre-correction fingerprint unchanged).
- No mapping outside this paragraph changed.
- PDF path/checksum/page count unchanged.
- Form remains **GLOBAL + ACTIVE + DRAFT**, unpublished.
- Packets, packet forms, field instances, defaults, collections, and Storage unchanged.
- Post-correction form-37 ACTIVE mapping count: **235** (223 preexisting + 12 new).
