# TXR-1910 — Production Field Implementation

**Date:** 2026-07-27  
**Environment:** `harbaugh-forms-prod` / `eetonalyyyssvkyfdoxh` only  

## Resolved form

| Item | Value |
|------|-------|
| Production form ID | **48** |
| Stable identity | `TXR-1910` / `TXR-1910-11-03-2025` / family `TXR-1910` |
| Title | SELLER'S TEMPORARY RESIDENTIAL LEASE |
| Revision | 11-03-2025 (TREC NO. 15-7) |
| Status | **ACTIVE + DRAFT** |

## PDF

`global/forms/48/SellersTemporaryResidentialLease.pdf` · **2 pages** · 805779 bytes · MD5 `bb54a3ec13d075e10047c29007836167` · SHA-256 `67a8bfc2e7701b2ee8b435c3c3dde677e8b0178c90fe5a89eca6f92b729fe679` · AcroForm 0 · **no usable text layer** · unchanged

## Method

Rendered pages at scale 2.5; **pixel underline scan** (PDF text extraction returns empty). Coordinates from detected underline bands; decorative borders, §14 emphasis underlines, smoke-alarm printed underline, and signatures/initials excluded.

## Counts

| Metric | Count |
|--------|------:|
| Visual substantive targets | **20** |
| ACTIVE mappings | **20** |
| Reused | **3** (`contract_buyer_names`, `CONTRACT_SELLER_NAMES`, `PROPERTY_FULL_ADDRESS`) |
| New fields | **15** |
| Checkboxes | **0** |
| Widgets | text 20 |
| Sources | reuse (buyer resolver / seller manual / property auto) + 15 manual_only |
| Unexplained | **0** |
| Signing excluded | 6 (p1 initials ×2; p2 landlord/tenant signatures ×4) |

## New keys

`txr_1910_term_ends`, `txr_1910_daily_rent`, `txr_1910_deposit`, `txr_1910_utilities_except`, `txr_1910_pets_except`, `txr_1910_special_provisions`, `txr_1910_holding_over_daily`, `txr_1910_landlord_notice`, `txr_1910_tenant_notice`, `txr_1910_landlord_phone`, `txr_1910_tenant_phone`, `txr_1910_landlord_fax`, `txr_1910_tenant_fax`, `txr_1910_landlord_email`, `txr_1910_tenant_email`

## Multiline decisions

- Property address: two substantial lines → two mappings of `PROPERTY_FULL_ADDRESS` (p1) + header mapping (p2).
- Special provisions: omit short first fragment after heading; cover subsequent full-width lines.
- Notices: one 3-line multiline per party (begin after column label).

## Party reuse rationale

Printed Contract roles: Landlord as Buyer, Tenant as Seller → reused `contract_buyer_names` / `CONTRACT_SELLER_NAMES`. Did not reuse ordinary residential-lease `landlord_*` packet contacts.

## Confirmations

Remains ACTIVE + DRAFT; PDF unchanged; unexplained=0; isolation OK. Map Fields: `/forms/48/editor`
