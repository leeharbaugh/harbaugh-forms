# TXR-1201 — Production Field Implementation

**Date:** 2026-07-27  
**Environment:** `harbaugh-forms-prod` / `eetonalyyyssvkyfdoxh` only  
**Development:** not modified · CLI left on development

## Resolved form

| Item | Value |
|------|-------|
| Production form ID | **38** |
| Stable identity | `TXR-1201` / `TXR-1201-01-05-2026` / family `TXR-1201` |
| Title | FARM AND RANCH REAL ESTATE LISTING AGREEMENT - EXCLUSIVE RIGHT TO SELL |
| Revision | 01-05-2026 |
| Status | **ACTIVE + DRAFT** (`published_at` null) |
| Scope | GLOBAL |

## PDF

`global/forms/38/FarmAndRanchListing.pdf` · **12 pages** · 309067 bytes · MD5 `946a778b48dfdec6d1b027a69bb2f13f` · SHA-256 `579f1c84a92460923e5dbbe0b83b46d38b6b6e8872d60823e25ce9de079ef8c7` · AcroForm 0 · unchanged

## Rendered-page review

All 12 pages rendered at 2× (`_audit_tmp/batch_38_42/form-38-pages/`). Visual inventories: `form-38-visual-inventory-p1.md`, `form-38-visual-inventory-p2-12.md`. Coordinates derived from PDF underline path ops + checkbox glyph positions + rendered PNGs. Calibrated against TXR-1948 / TXR-1954 (checkbox 12×12; text h≈14; money ~90–100).

## Counts

| Metric | Count |
|--------|------:|
| Visually detected substantive targets | **151** |
| ACTIVE mappings created | **151** |
| Unique reused Global fields | **83** |
| New Global fields | **56** |
| Unexplained targets | **0** |
| Widgets (by mapping) | text 83 · checkbox 63 · date 2 · number 3 |
| Sources (by mapping) | automatic 20 · custom_resolver 1 · manual_only 130 |

## Multiline sizing decisions

- Accessories “other”, government programs, MLS delay purpose, PID/MUD list, condition exceptions, other fees: **short first line** (or corrected to full-width where visual showed full rules for government programs).
- Exclusions, reservation grid cells, lease-comp narratives, special provisions: **substantial first line**.
- Legal description (p1): substantial 3-line multiline.
- Address “also known as”: short first + continuation → one multiline on `PROPERTY_FULL_ADDRESS`.

## New field keys (56)

Accessories (12 + other text); reservation grid 10×2 (20); ag district yes/no; government programs; lease/renewal/expansion compensation §5.E (19); property condition exceptions.

## Reuse highlights

Aligned with published TXR-1101 where meaning matches: seller/brokerage party fields, `listing_*` price/term/comp/MLS/intermediary/internet, financing, keybox, addenda, foreign-person, `PROPERTY_FULL_ADDRESS`, `property_county`, `property_legal_description`, `SPECIAL_PROVISIONS`, `KNOWN_*`, `AGENT_*`, etc.

## Excluded

- Identification initials on pages 1–11 (3 each)
- Page 12 signatures and signing dates
- Decorative heading/column underlines
- No attached-exhibit checkbox printed on p1

## Confirmations

- Remains GLOBAL + ACTIVE + DRAFT; unpublished
- PDF unchanged
- No defaults, collections, packets, snapshots, or Storage changes
- Placement quality target: TXR-1948 / TXR-1954 level (underline-anchored); Lee refine in `/forms/38/editor`
