# Condominium Resale Certificate (TXR-1921) — Production Field Implementation

**Date:** 2026-07-25  
**Environment:** `harbaugh-forms-prod` / `eetonalyyyssvkyfdoxh` only  
**Development:** not modified  
**Supabase CLI link:** left on development (`ewxsxwzezhkeawnjvigx`)

---

## Resolved form

| Item | Value |
|------|-------|
| Production form ID | **25** |
| Stable identity | `form_code=TXR-1921`, `version_label=TXR-1921-11-04-2024`, `form_family_key=TXR-1921` |
| Title | Condominium Resale Certificate |
| Form number / revision | TXR-1921 / TREC 32-5 / 11-04-2024 |
| Status / publication | **ACTIVE** + **DRAFT** (`published_at` null) |
| Scope | GLOBAL |
| Created | 2026-07-25T21:40:10Z |

Exactly one ACTIVE + DRAFT match. Not Published, Retired, or Deleted.

---

## PDF (authoritative Storage object)

| Item | Value |
|------|-------|
| Storage path | `global/forms/25/CondoResaleCert.pdf` |
| Filename | `CondoResaleCert.pdf` |
| Bytes | 465184 |
| MD5 | `37cf2920c30d2b6f7d9e03f2cef7f5ea` |
| SHA-256 | `5d9f5d3408f106c95e6f616ad8c475cbf46e787c3899de29f8f63d181b10b0c9` |
| Pages | 2 (612×792) |
| AcroForm fields | 66 (including `Signature1`) |
| Displayed title | CONDOMINIUM RESALE CERTIFICATE |

PDF loaded from private `form-templates`. Not replaced. Path/size/checksum unchanged after writes. Publish-readiness PDF page-count inspect succeeded (2 pages); form was **not** published.

---

## Counts

| Metric | Count |
|--------|------:|
| ACTIVE mappings created | **58** |
| Existing Global fields reused | **10** |
| New Global fields created | **48** |
| Text widgets | **44** |
| Checkbox widgets | **14** |
| Date widgets | **0** |
| Ordinary automatic sources | **5** |
| Custom resolvers | **1** |
| manual_only mappings | **52** |

---

## Reused Global fields

| field_key | source |
|-----------|--------|
| `contract_condo_unit_number` | `packet_property` / `unit` |
| `contract_condo_building` | `manual_only` |
| `contract_condo_project_name` | `manual_only` |
| `PROPERTY_ADDRESS` | `packet_property` / `full_address` |
| `PROPERTY_CITY` | `packet_property` / `city` |
| `property_county` | `packet_property` / `county` |
| `listing_condo_assessment_amount` | `manual_only` (shared periodic assessment with TXR-1401 ¶B) |
| `listing_condo_assessment_frequency` | `manual_only` |
| `PROPERTY_FULL_ADDRESS` | `packet_property` / `full_address` (page 2 header) |
| `property_hoa_name` | `custom_resolver` / `property_hoa_name` |

No shared Global field metadata or preference literals were changed.

---

## New Global field keys (48)

All `manual_only`, null path/resolver, null Global defaults:

**¶A–D:**  
`condo_resale_right_of_refusal_does`, `condo_resale_right_of_refusal_does_not`, `condo_resale_right_of_refusal_declaration_section`, `condo_resale_unpaid_assessment_is`, `condo_resale_unpaid_assessment_is_not`, `condo_resale_unpaid_assessment_amount`, `condo_resale_unpaid_assessment_description`, `condo_resale_other_amounts_are`, `condo_resale_other_amounts_are_not`, `condo_resale_other_amounts_amount`, `condo_resale_other_amounts_description`

**¶E–I:**  
`condo_resale_capital_expenditures_approved`, `condo_resale_reserves_amount`, `condo_resale_reserves_designated_amount`, `condo_resale_reserves_designated_for`, `condo_resale_unsatisfied_judgments_amount`, `condo_resale_suits_pending_are`, `condo_resale_suits_pending_are_not`, `condo_resale_suits_pending_nature`

**¶J–N:**  
`condo_resale_insurance_does`, `condo_resale_insurance_does_not`, `condo_resale_violations_has_knowledge`, `condo_resale_violations_has_no_knowledge`, `condo_resale_known_violations`, `condo_resale_gov_notice_has`, `condo_resale_gov_notice_has_not`, `condo_resale_gov_notices_received`, `condo_resale_leasehold_remaining_term`, `condo_resale_leasehold_renewal_provisions`, `condo_resale_managing_agent_name`, `condo_resale_managing_agent_mailing_address`, `condo_resale_managing_agent_phone`, `condo_resale_managing_agent_fax`, `condo_resale_managing_agent_email`

**¶O–P + certifying block:**  
`condo_resale_transfer_fee_description_1`…`_3`, `condo_resale_transfer_fee_paid_to_1`…`_3`, `condo_resale_transfer_fee_amount_1`…`_3`, `condo_resale_capital_reserves_contribution`, `condo_resale_certifying_officer_name`, `condo_resale_certifying_officer_title`, `condo_resale_association_mailing_address`, `condo_resale_association_email`

Mutually exclusive checkbox pairs are separate booleans (no radio-group system).

---

## Excluded signing / notary / non-entry items

- `Signature1` / By: association signature  
- Certifying officer **Date** (signature date)  
- ¶G “budget and balance sheet is attached” statement (no blank)  
- REQUIRED ATTACHMENTS list (informational; no checkboxes)  
- Decorative / misnamed AcroForm label overlays on printed titles  

---

## Unresolved / intentionally unmapped

- Managing agent left `manual_only` — `property_hoas.management_company_*` has no existing Global resolver; no new resolver/schema added.  
- Placements are approximate for Lee to refine in Map Fields (`/forms/25/editor`).  
- No Personal or Organization defaults assigned.  

---

## Isolation confirmations

| Check | Result |
|-------|--------|
| Form remains ACTIVE + DRAFT | Yes |
| Form not published | Yes |
| PDF path + checksum unchanged | Yes |
| Packets / packet_forms / field_instances unchanged | Yes (5 / 16 / 173) |
| field_defaults unchanged | Yes (166) |
| Unrelated ACTIVE form mappings unchanged | Yes (1189) |
| Shared reused field metadata unchanged | Yes |
| Publish-readiness PDF inspect | OK (2 pages); **not published** |

---

## Notes

- Same production Draft-form workflow as TXR-1401.  
- No application-code or schema change.  
- `decisions.md` / `project_status.md` not updated (routine Draft field configuration).
