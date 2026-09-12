# Condominium Addendum to Listing (TXR-1401) — Production Field Implementation

**Date:** 2026-07-25  
**Environment:** `harbaugh-forms-prod` / `eetonalyyyssvkyfdoxh` only  
**Development:** not modified  
**Supabase CLI link:** left on development (`ewxsxwzezhkeawnjvigx`)

---

## Resolved form

| Item | Value |
|------|-------|
| Production form ID | **24** |
| Stable identity | `form_code=TXR-1401`, `version_label=TXR-1401-01-05-2026`, `form_family_key=TXR-1401` |
| Title | Condominium Addendum to Listing |
| Form number / revision | TXR-1401 / 01-05-26 |
| Status / publication | **ACTIVE** + **DRAFT** (`published_at` null) |
| Scope | GLOBAL |
| Created | 2026-07-25T17:06:24Z (Lee upload → Global Draft) |

Unambiguous match among production Draft forms. DELETED PRIVATE form **23** (same title/code) was ignored. Form was not Published, Retired, or Deleted.

---

## PDF (authoritative Storage object)

| Item | Value |
|------|-------|
| Storage path | `global/forms/24/CondoListingAddendum.pdf` |
| Filename | `CondoListingAddendum.pdf` |
| Bytes | 159071 |
| MD5 | `ff7bb258a46c121c54f9460015ba18ec` |
| SHA-256 | `4a6856dba4be6233b69891ceddf3e1582d10b50e4b24b5dd70163699818b6566` |
| Pages | 1 (612×792) |
| AcroForm fields | 0 |
| Displayed title | CONDOMINIUM ADDENDUM TO LISTING |

PDF was loaded from the private `form-templates` bucket. It was not replaced. Path and checksum unchanged after writes.

---

## Counts

| Metric | Count |
|--------|------:|
| ACTIVE mappings created | **21** |
| Existing Global fields reused | **4** |
| New Global fields created | **17** |
| Text widgets | **8** |
| Checkbox widgets | **12** |
| Date widgets | **1** |
| Automatic sources | **3** |
| Custom resolvers | **0** |
| manual_only mappings | **18** |

---

## Reused Global fields

| field_key | source |
|-----------|--------|
| `PROPERTY_FULL_ADDRESS` | `packet_property` / `full_address` |
| `contract_condo_parking_assigned` | `manual_only` (shared with TXR-1605 parking blank) |
| `BROKERAGE_NAME` | `settings_brokerage` / `brokerage_name` |
| `brokerage_license_number` | `settings_brokerage` / `brokerage_license_number` |

No shared Global field metadata, source paths, or preference literals were changed.

---

## New Global field keys

All `manual_only`, with null `source_path` / `resolver_key`, and null Global `default_value` / `default_checked` / `fallback_value`:

1. `listing_condo_assessment_amount`
2. `listing_condo_assessment_frequency`
3. `listing_condo_fee_includes_water`
4. `listing_condo_fee_includes_water_heater`
5. `listing_condo_fee_includes_sewer`
6. `listing_condo_fee_includes_trash`
7. `listing_condo_fee_includes_electricity`
8. `listing_condo_fee_includes_gas`
9. `listing_condo_fee_includes_cable`
10. `listing_condo_fee_includes_local_telephone`
11. `listing_condo_fee_includes_security`
12. `listing_condo_fee_includes_property_taxes`
13. `listing_condo_fee_includes_insurance_on_structure`
14. `listing_condo_fee_includes_other`
15. `listing_condo_fee_includes_other_description`
16. `listing_condo_delinquency_exceptions`
17. `listing_condo_documents_delivery_date`

---

## Excluded signing / Authentisign fields

Not mapped (intentionally):

- Seller or Landlord signature lines (two)
- Seller or Landlord signature dates (two)
- Broker’s Associate’s Signature line
- Broker’s Associate’s Signature date

Broker company printed name and brokerage license number **were** mapped (identity fields, not signatures).

---

## Unresolved / intentionally unmapped

- `properties.hoa_dues_amount` / `hoa_dues_frequency` exist in schema but are not exposed through current `packet_property` source paths. Assessment amount/frequency left `manual_only` rather than inventing a resolver or schema change.
- Initial placements are approximate; Lee should refine in Map Fields (`/forms/24/editor`) before Publish.
- No Personal or Organization defaults were assigned.

---

## Isolation confirmations

| Check | Result |
|-------|--------|
| Form remains ACTIVE + DRAFT | Yes |
| Form not published | Yes |
| PDF path + checksum unchanged | Yes |
| Packets / packet_forms / field_instances unchanged | Yes (5 / 16 / 173) |
| field_defaults unchanged | Yes (165) |
| Unrelated ACTIVE form mappings unchanged | Yes (1168) |
| Shared reused field metadata unchanged | Yes |
| Production Storage objects besides existing PDF | Untouched |
| Map Fields data prerequisites | Form + 21 ACTIVE mappings + PDF download verified via service role |

Map Fields UI redirects to login when unauthenticated; structural data required by `/forms/24/editor` is present and valid.

---

## Notes

- First real production Draft-form workflow write for this form family.
- No application-code or schema change was required.
- `decisions.md` and `project_status.md` were not updated (routine Draft field placement).
