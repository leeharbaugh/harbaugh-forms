# CONDO TXR-1605 / TREC 30-18 â€” Field Inventory Audit

**Audit date:** 2026-07-24  
**Mode:** Propose only â€” no fields, mappings, defaults, migrations, storage objects, or database writes  
**Supabase target confirmed:** `harbaugh-forms-dev` (`ewxsxwzezhkeawnjvigx`) via `.env.local` / CLI link  
**Production (`eetonalyyyssvkyfdoxh`):** out of scope â€” not queried, not modified  

---

## A. Form identification

| Item | Finding |
|------|---------|
| Development form for TREC 30-18 / TXR 1605 | **Does not exist** in `harbaugh-forms-dev` |
| Closest existing â€œcondoâ€ forms | **#21** PRIVATE and **#23** GLOBAL `CondoListingAddendum` (`TXR-1401`, version `TXR-1401-01-05-2026`) â€” **different form** (listing addendum), not the Residential Condominium Contract (Resale) |
| One to Four reuse reference | Form **#11** `One to Four Residential` / `TXR-1601` / `TXR-1601-05-04-2026` / `global/forms/11/OneToFour_20260504.pdf` (12 pages, 173 ACTIVE mappings, 163 unique fields) |
| Attached `CondoListing.pdf` | **Not found** in the workspace or common download paths (message content was text-only). Audit used the official TREC PDF below. |
| PDF used for this audit | Official TREC download: `https://www.trec.texas.gov/sites/default/files/pdf-forms/30-18.pdf` saved as `_audit_tmp/TREC_30-18.pdf` |
| Form title | Residential Condominium Contract (Resale) |
| Form ID | **TREC NO. 30-18** (footer on every page) |
| Version / date on face | **05-04-2026**; â€œPage *n* of 10â€ |
| Page count | **10** |
| AcroForm fields | **0** (pdf-lib `getForm().getFields().length === 0`) â€” matches expectation |
| Current fields / mappings for a 1605 form | **0 / 0** (form record absent) |
| Scope / owner / storage path | N/A until a development form is created |

**Lee confirmation needed:** Confirm that the intended `CondoListing.pdf` / TXR-1605 branded file matches this TREC 30-18 content (same blanks/checkboxes). TXR branding may differ cosmetically; substantive blank layout should match.

---

## B. Summary counts

From `_audit_tmp/condo_inventory_counts.json` (derived from the detailed inventory):

| Metric | Count |
|--------|------:|
| Proposed total fields/mappings | **161** |
| Existing Global fields proposed for reuse | **148** |
| New Global fields proposed | **13** |
| Text widgets | **113** |
| Checkbox widgets | **47** |
| Date widgets | **1** |
| Automatic-source candidates (`packet_property` / `packet_contact` / `settings_*`) | **28** |
| Supported custom resolvers | **4** |
| `manual_only` | **129** |
| Data-model / ambiguity questions for Lee | **3** (1 hard + 2 optional schema) |
| Excluded signing / initials / receipt-signature blanks (approx.) | **~72** |

Widget + source tallies treat multi-page `property_concerning_full_address` as separate mapping rows (same Global field, multiple placements), consistent with Form 11.

---

## C. Detailed proposed inventory (page order)

Full table (one row per proposed PDF blank/checkbox):

See embedded table below (also mirrored at `_audit_tmp/condo_inventory_table.md`).

COLUMNS: Page Â· Paragraph/section Â· Visible PDF label or purpose Â· Proposed field_key Â· Proposed catalog label Â· Widget type Â· Data type Â· Existing field ID if reused Â· Reuse or New Â· Proposed source_type Â· Proposed source_path or resolver_key Â· Required? Â· Condo-specific? Â· Notes/reasoning Â· Data-model change needed?

<!-- TABLE_START -->

| Page | Paragraph/section | Visible PDF label or purpose | Proposed field_key | Proposed catalog label | Widget type | Data type | Existing field ID if reused | Reuse or New | Proposed source_type | Proposed source_path or resolver_key | Required? | Condo-specific? | Notes/reasoning | Data-model change needed? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | ¶1 PARTIES | "The parties to this contract are ______ (Seller)" | CONTRACT_SELLER_NAMES | Contract Seller Names | text | text | 1ff64dc0-48bb-4c01-9840-2fbc9c377212 | Reuse | manual_only | (none) | No | No | Same wording/role as Form 11 ¶1. Every Form 11 mapping is stored with required=false, so "No" is used in this column throughout for consistency. Also note the page 1 "Contract Concerning ______" header rule is deliberately NOT mapped, matching Form 11 (header mapped only on pages 2-12). | No |
| 1 | ¶1 PARTIES | "and ______ (Buyer)" | contract_buyer_names | Contract Buyer Names | text | text | 2d98b3e9-e212-4141-82fb-c619e806bf56 | Reuse | custom_resolver | resolver: buyer_names | No | No | Same resolver as Form 11; concatenates all buyers on the packet. | No |
| 1 | ¶2A(1) CONDOMINIUM UNIT | "Unit ______," | contract_condo_unit_number | Condominium Unit Number | text | text | | New | packet_property | unit | No | Yes | Condo identity. Explicitly NOT PROPERTY_LOT — lot/block/addition are subdivision legal-description fields and are absent from this form. properties.unit already exists and "unit" is already in PACKET_PROPERTY_DIRECT_SOURCE_PATHS, so this auto-fills with no schema work; only a new Global field catalog row is required. Marked New because no ACTIVE Global field currently uses the unit path. | No |
| 1 | ¶2A(1) CONDOMINIUM UNIT | "in Building ______," | contract_condo_building | Condominium Building | text | text | | New | manual_only | (none) | No | Yes | Condo identity. Explicitly NOT PROPERTY_BLOCK. No property column exists for building today, so manual entry. | Optional — only if Lee wants a properties.building column; manual_only works without it |
| 1 | ¶2A(1) CONDOMINIUM UNIT | "of ______, a condominium project" | contract_condo_project_name | Condominium Project Name | text | text | | New | manual_only | (none) | No | Yes | Condo identity. Explicitly NOT PROPERTY_ADDITION (that is the platted subdivision name). Also distinct from HOA_ASSOCIATION_NAME / property_hoa_name, which name the association rather than the project. | Optional — only if Lee wants a properties.condominium_project_name column; manual_only works without it |
| 1 | ¶2A(1) CONDOMINIUM UNIT | "located at ______ (address/zip code)" | PROPERTY_ADDRESS_ZIP | Property ZIP | text | text | 844c64f4-b9a5-4b7b-9d42-939d556a1c7e | Reuse | packet_property | address_city_state_zip | No | No | Same field Form 11 uses for its "known as ______ (address/zip code)" blank. The blank spans two full-width rules (y=629.6 and y=620.5); map the first line only and leave the second as unmapped overflow, matching Form 11's single-field treatment. | No |
| 1 | ¶2A(1) CONDOMINIUM UNIT | "City of ______," | PROPERTY_CITY | Property City | text | text | ae78da9f-90e5-48fd-9724-8d4562052057 | Reuse | packet_property | city | No | No | Direct equivalent of Form 11 ¶2A city blank. | No |
| 1 | ¶2A(1) CONDOMINIUM UNIT | "County of ______," | property_county | Property County | text | text | 980830bf-8d4d-4bbe-8f4d-026453594617 | Reuse | packet_property | county | No | No | Direct equivalent of Form 11 ¶2A county blank. | No |
| 1 | ¶2A(1) CONDOMINIUM UNIT | Full-width blank line between the county blank and the preprinted word "Texas" | property_legal_description | Property Legal Description | text | text | d2a7f794-9260-406f-9f27-94fb753056eb | Reuse (optional) | packet_property | legal_description | No | Yes | IMPORTANT CORRECTION: this is NOT a state blank. "Texas" is preprinted immediately after it (page 1, y=594.7), so PROPERTY_STATE (d2140c59-111f-4630-9b6e-f583531ef61a, packet_property.state) must NOT be used here or the line renders "Texas, Texas". The rule is a full-width continuation line (y=602.4, x=102.7-550.2) ending in a comma, best read as additional legal/plat description. Recommend confirming intent against a filled sample before activating; safe fallback is to leave it unmapped. | Yes — confirm whether packet_property.legal_description is the right semantic for this county-continuation slot |
| 1 | ¶2A(1) CONDOMINIUM UNIT | "Parking areas assigned to the Unit are: ______" | contract_condo_parking_assigned | Assigned Parking Areas | text | text | | New | manual_only | (none) | No | Yes | Two-line blank (y=547.8 and y=538.7); map as one field on the first line per Form 11's multi-line practice. This is free-text describing assigned/limited-common parking spaces and is not the same as a garage_spaces count, so no property column is appropriate. | No |
| 1 | ¶2A(4) EXCLUSIONS | "will be retained by Seller and must be removed prior to delivery of possession: ______" | CONTRACT_PROPERTY_EXCLUSIONS | Contract Property Exclusions | text | text | 75358af0-183c-47d4-9bcb-87e8691b4e66 | Reuse | manual_only | (none) | No | No | Identical clause to Form 11 ¶2D exclusions. Two-line blank, single field. | No |
| 1 | ¶2B(1) | Checkbox "(1) Buyer has received a copy of the Documents" | contract_condo_documents_received | Condominium Documents Received | checkbox | boolean | | New | manual_only | (none) | No | Yes | Check one box only with ¶2B(2) — separate boolean per election, UI should enforce mutual exclusivity. No Form 11 analogue (1-4 has no Documents delivery election). | No |
| 1 | ¶2B(2) | Checkbox "(2) Buyer has not received a copy of the Documents" | contract_condo_documents_not_received | Condominium Documents Not Received | checkbox | boolean | | New | manual_only | (none) | No | Yes | Check one box only with ¶2B(1). Drives the delivery-days blank below. | No |
| 1 | ¶2B(2) | "shall deliver the Documents to Buyer within ______ days after the Effective Date" | contract_condo_documents_delivery_days | Condominium Documents Delivery Days | text | number | | New | manual_only | (none) | No | Yes | Only meaningful when ¶2B(2) is checked. Data type "number" matches the contract_seller_disclosure_delivery_days convention. | No |
| 1 | ¶2C(1) | Checkbox "(1) Buyer has received the Certificate" | contract_condo_certificate_received | Resale Certificate Received | checkbox | boolean | | New | manual_only | (none) | No | Yes | Check one box only across ¶2C(1)/(2)/(3). Resale Certificate under Tex. Prop. Code §82.157. | No |
| 1 | ¶2C(2) | Checkbox "(2) Buyer has not received the Certificate" | contract_condo_certificate_not_received | Resale Certificate Not Received | checkbox | boolean | | New | manual_only | (none) | No | Yes | Check one box only across ¶2C(1)/(2)/(3). | No |
| 1 | ¶2C(2) | "Seller shall deliver the Certificate to Buyer within ______ days after the Effective Date" | contract_condo_certificate_delivery_days | Resale Certificate Delivery Days | text | number | | New | manual_only | (none) | No | Yes | Only meaningful when ¶2C(2) is checked. | No |
| 1 | ¶2C(3) | Checkbox "(3) Buyer has received Seller's affidavit ... agree to waive the requirement to furnish the Certificate" | contract_condo_certificate_affidavit_waiver | Resale Certificate Affidavit Waiver | checkbox | boolean | | New | manual_only | (none) | No | Yes | Third option in the same check-one-box-only group; waiver path when the Association fails to provide a Certificate. | No |
| 1 | ¶2D | "If Buyer does not receive the Association's certification within ______ days after the Effective Date" | contract_condo_right_of_refusal_certification_days | Right of Refusal Certification Days | text | number | | New | manual_only | (none) | No | Yes | Right-of-refusal certification window; no 1-4 analogue. Blank is rendered as underscore characters, not a drawn rule. | No |
| 2 | Page header | "Contract Concerning ______ (Address of Property)" | property_concerning_full_address | Contract Concerning Property Address | text | text | a68f94bb-1c06-4b40-b54f-9889c945e80f | Reuse | packet_property | full_address (resolver_key property_full_address) | No | No | One mapping per page, pages 2-10, exactly as Form 11 does for its pages 2-12. | No |
| 2 | ¶3A SALES PRICE | "Cash portion of Sales Price payable by Buyer at closing $______" | contract_sales_price_cash | Contract Sales Price Cash | text | currency | 6181a1f8-374c-4861-9d92-0d540ca3fb58 | Reuse | manual_only | (none) | No | No | Identical to Form 11 ¶3A. | No |
| 2 | ¶3B SALES PRICE | Checkbox "Third Party Financing Addendum" | contract_financing_third_party | Third Party Financing Addendum | checkbox | boolean | ed6f557c-a451-4c77-bb75-cb1c2b0dbda6 | Reuse | manual_only | (none) | No | No | Check all that apply (not mutually exclusive). | No |
| 2 | ¶3B SALES PRICE | Checkbox "Loan Assumption Addendum" | contract_financing_loan_assumption | Loan Assumption Addendum | checkbox | boolean | 5f6a8134-5e28-4076-b881-0634a39389ba | Reuse | manual_only | (none) | No | No | Check all that apply. | No |
| 2 | ¶3B SALES PRICE | Checkbox "Seller Financing Addendum" | contract_financing_seller_financing | Seller Financing Addendum | checkbox | boolean | 3a2bbc88-7055-402f-9224-16052012305f | Reuse | manual_only | (none) | No | No | Check all that apply. | No |
| 2 | ¶3B SALES PRICE | "Sum of all financing described in the attached ... $______" | contract_sales_price_financing | Contract Sales Price Financing | text | currency | 5dbc036b-75f6-4de4-b327-c47581c0bc2f | Reuse | manual_only | (none) | No | No | Identical to Form 11 ¶3B. | No |
| 2 | ¶3C SALES PRICE | "Sales Price (Sum of A and B) $______" | contract_sales_price_total | Contract Sales Price Total | text | currency | aa96660b-9ae0-4888-aa64-c32875bd1ad3 | Reuse | manual_only | (none) | No | No | Identical to Form 11 ¶3C. | No |
| 2 | ¶4A LEASES | Checkbox "A. RESIDENTIAL LEASES ... Addendum Regarding Residential Leases is attached" | contract_lease_residential | Residential Lease | checkbox | boolean | 75f612ad-a987-4de2-b6cf-5b73d79333cf | Reuse | manual_only | (none) | No | No | Check all applicable boxes. Condo ¶4 has only A and B — the 1-4 natural-resource-lease option and its delivery/termination-day blanks do not exist here, so contract_lease_natural_resource and contract_natural_resource_* are intentionally not carried over. | No |
| 2 | ¶4B LEASES | Checkbox "B. FIXTURE LEASES ... Addendum Regarding Fixture Leases is attached" | contract_lease_fixture | Fixture Lease | checkbox | boolean | 02611b6b-45a4-4075-bdc5-13dfbd572e87 | Reuse | manual_only | (none) | No | No | Check all applicable boxes. | No |
| 2 | ¶5A EARNEST MONEY | "Buyer must deliver to ______ (Escrow Agent)" | contract_escrow_agent_name | Escrow Agent Name | text | text | fc51201d-953c-4d8d-b6f6-892e5665c488 | Reuse | manual_only | (none) | No | No | Identical to Form 11 ¶5A. | No |
| 2 | ¶5A EARNEST MONEY | "at ______ (address)" | contract_escrow_agent_address | Escrow Agent Address | text | text | 5abf0584-f253-488e-883a-8d6df97ba792 | Reuse | manual_only | (none) | No | No | Blank wraps across two rule segments (end of y=539.5 and y=528.8); single field on the wider second segment, as in Form 11. | No |
| 2 | ¶5A EARNEST MONEY | "$______ as earnest money" | contract_earnest_money_amount | Earnest Money Amount | text | currency | 7c31526f-ce2c-4988-82cb-a2654f5b07a4 | Reuse | manual_only | (none) | No | No | Identical to Form 11 ¶5A. | No |
| 2 | ¶5A EARNEST MONEY | "$______ as the option fee" | contract_option_fee_amount | Option Fee Amount | text | currency | c2891d22-e94a-4bb1-96d8-f376aa2231fa | Reuse | manual_only | (none) | No | No | Identical to Form 11 ¶5A. | No |
| 2 | ¶5A(1) | "Buyer shall deliver additional earnest money of $______" | contract_additional_earnest_money_amount | Additional Earnest Money Amount | text | currency | dc54d9cb-8836-40d9-97ef-033173c2913f | Reuse | manual_only | (none) | No | No | Identical to Form 11 ¶5A(1). | No |
| 2 | ¶5A(1) | "to Escrow Agent within ______ days after the Effective Date" | contract_additional_earnest_money_days | Additional Earnest Money Days | text | number | 1e438c3c-4a1e-48a0-b5fa-7ceb90d9ed01 | Reuse | manual_only | (none) | No | No | Identical to Form 11 ¶5A(1). | No |
| 2 | ¶5B TERMINATION OPTION | "within ______ days after the Effective Date of this contract (Option Period)" | contract_option_period_days | Option Period Days | text | number | c87dbe71-747f-4f50-b82f-74c1cee5149d | Reuse | manual_only | (none) | No | No | Identical to Form 11 ¶5B. | No |
| 2 | ¶6A TITLE POLICY | Checkbox "Seller's expense" | contract_title_policy_paid_by_seller | Title Policy Paid by Seller | checkbox | boolean | 79d9b6af-a31d-4bca-9969-4f175ad4cbad | Reuse | manual_only | (none) | No | No | Check one box only with the Buyer's-expense box. | No |
| 2 | ¶6A TITLE POLICY | Checkbox "Buyer's expense" | contract_title_policy_paid_by_buyer | Title Policy Paid by Buyer | checkbox | boolean | b58b520c-ee81-4a47-a61a-e0e626338f0d | Reuse | manual_only | (none) | No | No | Check one box only with the Seller's-expense box. | No |
| 2 | ¶6A TITLE POLICY | "issued by ______ (Title Company)" | contract_title_company_name | Title Company Name | text | text | 2512bfe5-42fa-4f17-b52c-b6cb65abf9ed | Reuse | manual_only | (none) | No | No | Identical to Form 11 ¶6A. NOTE: condo ¶6A(8) has no amend/not-amend election for the boundary exception (there is no survey on this form), so contract_title_exception_amended, contract_title_exception_not_amended and the two amendment-expense checkboxes from Form 11 are intentionally excluded. | No |
| 3 | Page header | "Contract Concerning ______ (Address of Property)" | property_concerning_full_address | Contract Concerning Property Address | text | text | a68f94bb-1c06-4b40-b54f-9889c945e80f | Reuse | packet_property | full_address (resolver_key property_full_address) | No | No | Per-page header mapping. | No |
| 3 | ¶6C OBJECTIONS | "or which prohibit the following use or activity: ______" | contract_title_objection_use_activity | Title Objection Use Activity | text | text | 35dd64ff-1f22-4b93-afb0-779465316a13 | Reuse | manual_only | (none) | No | No | Two-line blank (y=611.6, y=601.9); single field per Form 11. | No |
| 3 | ¶6C OBJECTIONS | "Buyer must object the earlier of (i) the Closing Date or (ii) ______ days" | contract_title_objection_days | Title Objection Days | text | number | e4d3b4f9-965b-4c38-bbcf-776c8758b55a | Reuse | manual_only | (none) | No | No | Identical to Form 11 ¶6D. Rendered as underscore characters, not a drawn rule. Nothing else on page 3 is fillable — the ¶6D title notices are pure disclosure text. | No |
| 4 | Page header | "Contract Concerning ______ (Address of Property)" | property_concerning_full_address | Contract Concerning Property Address | text | text | a68f94bb-1c06-4b40-b54f-9889c945e80f | Reuse | packet_property | full_address (resolver_key property_full_address) | No | No | Per-page header mapping. | No |
| 4 | ¶7B(1) | Checkbox "(1) Buyer has received the Seller's Disclosure Notice" | contract_seller_disclosure_received | Seller Disclosure Received | checkbox | boolean | 1eee4d1d-9801-44d1-9ebe-1a682c4969c2 | Reuse | manual_only | (none) | No | No | Check one box only across ¶7B(1)/(2)/(3); same three-way election as Form 11. | No |
| 4 | ¶7B(2) | Checkbox "(2) Buyer has not received the Seller's Disclosure Notice" | contract_seller_disclosure_not_received | Seller Disclosure Not Received | checkbox | boolean | e0e827af-9b93-4a99-b51c-1564aa00a011 | Reuse | manual_only | (none) | No | No | Check one box only across ¶7B(1)/(2)/(3). | No |
| 4 | ¶7B(2) | "Within ______ days after the Effective Date ... Seller shall deliver the Seller's Disclosure Notice" | contract_seller_disclosure_delivery_days | Seller Disclosure Delivery Days | text | number | 222650d2-5bf7-4b65-a70a-988d01d6348b | Reuse | manual_only | (none) | No | No | Identical to Form 11 ¶7B(2). | No |
| 4 | ¶7B(3) | Checkbox "(3) The Texas Property Code does not require this Seller to furnish the Seller's Disclosure Notice" | contract_seller_disclosure_not_required | Seller Disclosure Not Required | checkbox | boolean | 3de072c3-3179-461b-8511-815394da97dc | Reuse | manual_only | (none) | No | No | Check one box only across ¶7B(1)/(2)/(3). | No |
| 4 | ¶7D(1) | Checkbox "(1) Buyer accepts the Property As Is" | CONTRACT_PROPERTY_AS_IS | Property Accepted As Is | checkbox | boolean | 71cc5bb4-8b16-4e6d-861a-a925a650da91 | Reuse | manual_only | (none) | No | No | Check one box only with ¶7D(2). | No |
| 4 | ¶7D(2) | Checkbox "(2) Buyer accepts the Property As Is provided Seller ... shall complete the following specific repairs and treatments" | contract_property_as_is_with_repairs | Property As Is With Repairs | checkbox | boolean | 38b72a74-70ff-4c92-b1f6-a340148a2b58 | Reuse | manual_only | (none) | No | No | Check one box only with ¶7D(1). | No |
| 4 | ¶7D(2) | Specific repairs and treatments blank | contract_specific_repairs | Specific Repairs | text | text | 68ab207d-d60c-4262-b96d-4135f8f8e639 | Reuse | manual_only | (none) | No | No | Two-line blank (y=361.1, y=351.2); single field per Form 11. | No |
| 4 | ¶7H RESIDENTIAL SERVICE CONTRACTS | "Seller shall reimburse Buyer at closing ... in an amount not exceeding $______" | CONTRACT_SERVICE_CONTRACT_REIMBURSEMENT_AMOUNT | Service Contract Reimbursement Amount | text | currency | b4cfd37f-98ec-4b44-95e5-a47ffce8dc9d | Reuse | manual_only | (none) | No | No | Identical to Form 11 ¶7I. NOTE: condo ¶7 has no water-service disclosure block, so contract_water_disclosure_* and contract_water_provider_name are intentionally excluded. | No |
| 5 | Page header | "Contract Concerning ______ (Address of Property)" | property_concerning_full_address | Contract Concerning Property Address | text | text | a68f94bb-1c06-4b40-b54f-9889c945e80f | Reuse | packet_property | full_address (resolver_key property_full_address) | No | No | Per-page header mapping. | No |
| 5 | ¶8 BROKER OR SALES AGENT DISCLOSURE | "Disclose if applicable: ______" | CONTRACT_BROKER_DISCLOSURE_TEXT | Broker Disclosure Text | text | text | b00cae55-3d09-49f4-a31b-df49b481b886 | Reuse | manual_only | (none) | No | No | Identical to Form 11 ¶8. | No |
| 5 | ¶9A CLOSING | "The closing of the sale will be on or before ______, 20___" | contract_closing_date | Closing Date | date | date | f7d78229-f99c-4c11-a5b3-082859eeac15 | Reuse | manual_only | (none) | No | No | Maps the main date rule (y=678.4, x=294.6-431.3). The short trailing "20 ___" year rule (x=451.4-474.2) is left unmapped, exactly as Form 11 does; the date field is expected to render a full date on the first blank. | No |
| 5 | ¶10A BUYER'S POSSESSION | Checkbox "upon closing and funding" | CONTRACT_BUYER_POSSESSION_AT_CLOSING | Buyer Possession at Closing | checkbox | boolean | d96b71d9-35ef-4a5a-a2cf-22819ef889b9 | Reuse | manual_only | (none) | No | No | Two mutually exclusive possession options; separate boolean each. | No |
| 5 | ¶10A BUYER'S POSSESSION | Checkbox "according to a temporary residential lease form promulgated by TREC or other written lease" | contract_buyer_possession_by_lease | Buyer Possession by Lease | checkbox | boolean | b5b6ca35-ae6d-4b63-80b5-a7356b2f1453 | Reuse | manual_only | (none) | No | No | Paired with the at-closing option. | No |
| 5 | ¶11 SPECIAL PROVISIONS | Free-text special provisions blank | CONTRACT_SPECIAL_PROVISIONS | Special Provisions | text | text | da9e14f5-6f26-4d0a-9f13-7e8097fed433 | Reuse | manual_only | (none) | No | No | Three-line blank (y=344, 335, 326); single field per Form 11. Existing catalog row has source_type NULL — recommend normalizing it to manual_only when this form is built. | No |
| 5 | ¶12A(1)(b) | "an amount not to exceed $______ to be applied to Buyer's Expenses" | CONTRACT_SELLER_EXPENSE_CONTRIBUTION_AMOUNT | Seller Expense Contribution Amount | text | currency | 92b8cdbd-479b-44ea-8bfd-1a98d823429d | Reuse | manual_only | (none) | No | No | Identical to Form 11 ¶12A(1)(b). | No |
| 5 | ¶12A(3) | "Buyer shall pay any and all Association fees, deposits, reserves and other charges resulting from the transfer of the Property not to exceed $______" | contract_condo_association_transfer_charges_cap | Association Transfer Charges Cap | text | currency | | New | manual_only | (none) | No | Yes | No equivalent exists on the 1-4 form (its ¶12A stops at (1)(b)/(2)). Distinct from hoa_addendum_transfer_fee_cap (095bd62c-2573-492f-b356-ea44e0015548), which belongs to the HOA addendum form, not this contract; keeping them separate avoids cross-form value bleed. | No |
| 5 | ¶12B(1) | Checkbox "(1) Seller will pay ... toward the brokerage compensation owed by Buyer to Buyer's broker" | contract_seller_contributes_to_buyer_broker_comp | Seller Contributes to Buyer Broker Compensation | checkbox | boolean | 464e2e51-e04f-4501-beec-6fa8bbaaf114 | Reuse | manual_only | (none) | No | No | Enables the nested dollar/percent election. | No |
| 5 | ¶12B(1) | Checkbox "$" (dollar option) | contract_seller_contribution_dollar_selected | Seller Contribution Dollar Selected | checkbox | boolean | 2f577094-ab1b-4b05-ae95-5be82ad440b8 | Reuse | manual_only | (none) | No | No | Check one box only with the percent option. | No |
| 5 | ¶12B(1) | "$______" contribution amount | contract_seller_contribution_amount | Seller Contribution Amount | text | currency | 0a47197a-3b0c-4124-994f-f36dea04a75d | Reuse | manual_only | (none) | No | No | Paired with the dollar checkbox. | No |
| 5 | ¶12B(1) | Checkbox "%" (percent option) | contract_seller_contribution_percent_selected | Seller Contribution Percent Selected | checkbox | boolean | 8adc2c2c-b191-4fd5-b11f-eb71cbf2d9ee | Reuse | manual_only | (none) | No | No | Check one box only with the dollar option. | No |
| 5 | ¶12B(1) | "______% of the Sales Price" | contract_seller_contribution_percent | Seller Contribution Percent | text | number | c8d807ad-10bf-4408-aeca-82c3591f7fc3 | Reuse | manual_only | (none) | No | No | Paired with the percent checkbox. | No |
| 6 | Page header | "Contract Concerning ______ (Address of Property)" | property_concerning_full_address | Contract Concerning Property Address | text | text | a68f94bb-1c06-4b40-b54f-9889c945e80f | Reuse | packet_property | full_address (resolver_key property_full_address) | No | No | Per-page header mapping. Page 6 otherwise contains only ¶12B(2) blanks — ¶13-¶19 have no fillable content. | No |
| 6 | ¶12B(2) | Checkbox "(2) Buyer will pay ... toward the brokerage compensation owed by Seller to Seller's broker" | contract_buyer_contributes_to_seller_broker_comp | Buyer Contributes to Seller Broker Compensation | checkbox | boolean | acadebd1-ec33-4ac2-804f-2534b17dcabf | Reuse | manual_only | (none) | No | No | Enables the nested dollar/percent election. | No |
| 6 | ¶12B(2) | Checkbox "$" (dollar option) | contract_buyer_contribution_dollar_selected | Buyer Contribution Dollar Selected | checkbox | boolean | 537f9c5d-d670-4abc-8be4-1f52c9c65cc5 | Reuse | manual_only | (none) | No | No | Check one box only with the percent option. | No |
| 6 | ¶12B(2) | "$______" contribution amount | contract_buyer_contribution_amount | Buyer Contribution Amount | text | currency | f63d04bc-4e6b-44fe-8990-f93a07e3c219 | Reuse | manual_only | (none) | No | No | Paired with the dollar checkbox. | No |
| 6 | ¶12B(2) | Checkbox "%" (percent option) | contract_buyer_contribution_percent_selected | Buyer Contribution Percent Selected | checkbox | boolean | f346cf05-fe86-4496-8228-6f6127969454 | Reuse | manual_only | (none) | No | No | Check one box only with the dollar option. | No |
| 6 | ¶12B(2) | "______% of the Sales Price" | contract_buyer_contribution_percent | Buyer Contribution Percent | text | number | 3989abe8-f184-4cde-b216-8d1764778505 | Reuse | manual_only | (none) | No | No | Paired with the percent checkbox. | No |
| 7 | Page header | "Contract Concerning ______ (Address of Property)" | property_concerning_full_address | Contract Concerning Property Address | text | text | a68f94bb-1c06-4b40-b54f-9889c945e80f | Reuse | packet_property | full_address (resolver_key property_full_address) | No | No | Per-page header mapping. | No |
| 7 | ¶21 NOTICES | "To Buyer(s) at: Address: ______" | CONTRACT_BUYER_NOTICE_ADDRESS | Buyer Notice Address | text | text | a1e25cce-2866-4966-bbe1-e60411e53ac6 | Reuse | packet_contact | buyer_1.address | No | No | ¶21 grid is laid out identically to Form 11 ¶21. | No |
| 7 | ¶21 NOTICES | Buyer address continuation line (city/state/zip) | BUYER_1_CITY_STATE_ZIP | Buyer 1 City, State, and Zip | text | text | 0b452669-1990-4870-a4c0-6caf3b9d4dc5 | Reuse | packet_contact | buyer_1.city_state_zip | No | No | Second full-width rule under the buyer Address label, same as Form 11's placement. | No |
| 7 | ¶21 NOTICES | "Phone(s): ______" (buyer) | contract_buyer_notice_phone | Buyer Notice Phone | text | text | 0b089625-f3b8-48f6-9447-a73f0c0618d3 | Reuse | custom_resolver | resolver: buyer_notice_phone | No | No | Buyer phone blank is underscore characters on this form; the seller side is a drawn rule. | No |
| 7 | ¶21 NOTICES | "Email(s): ______" (buyer) | contract_buyer_notice_email | Buyer Notice Email | text | text | ceaf9445-8db2-4741-8a9a-83578275b3a1 | Reuse | custom_resolver | resolver: buyer_notice_email | No | No | Same resolver as Form 11. | No |
| 7 | ¶21 NOTICES | "To Seller(s) at: Address: ______" | CONTRACT_SELLER_NOTICE_ADDRESS | Seller Notice Address | text | text | e69b3ca9-8dd7-467b-873d-28ea5d0e91fd | Reuse | manual_only | (none) | No | No | Seller-side contacts are manual in Form 11 because the packet models the represented buyer. | No |
| 7 | ¶21 NOTICES | Seller address continuation line (city/state/zip) | seller_city_state_zip | Seller City, State ZIP | text | text | 4892e7cf-cec6-44ff-8d09-968231ac07f1 | Reuse (optional) | custom_resolver | resolver: seller_city_state_zip | No | No | OPTIONAL / divergence: Form 11 leaves the seller address continuation rule unmapped even though this ACTIVE global exists. Recommended small improvement; drop the row if strict Form 11 parity is preferred. | No |
| 7 | ¶21 NOTICES | "Phone(s): ______" (seller) | CONTRACT_SELLER_NOTICE_PHONE | Seller Notice Phone | text | text | 3edc25a9-3620-4d2c-b053-9022ceb4afd8 | Reuse | manual_only | (none) | No | No | Mirrors Form 11. | No |
| 7 | ¶21 NOTICES | "Email(s): ______" (seller) | CONTRACT_SELLER_NOTICE_EMAIL | Seller Notice Email | text | text | a44a4f4a-e723-49da-8969-bff72780cb7d | Reuse | manual_only | (none) | No | No | Mirrors Form 11. | No |
| 7 | ¶21 NOTICES | "To Buyer's agent at: Address: ______" | contract_buyer_agent_notice_address | Buyer Agent Notice Address | text | text | dd891458-968f-4ad3-8fb6-d090e0e815c5 | Reuse | manual_only | (none) | No | No | Agent block address; second (continuation) rule left unmapped as in Form 11. | No |
| 7 | ¶21 NOTICES | "Phone: ______" (buyer's agent) | CONTRACT_BUYER_AGENT_NOTICE_PHONE | Buyer Agent Notice Phone | text | text | 84ab49ce-a340-447a-93f9-cc2abf9b5d57 | Reuse | settings_agent | agent_phone | No | No | Auto-fills from agent settings. | No |
| 7 | ¶21 NOTICES | "Email: ______" (buyer's agent) | CONTRACT_BUYER_AGENT_NOTICE_EMAIL | Buyer Agent Notice Email | text | text | c6f2b888-685b-4868-b1fd-1eac8c4aa0f5 | Reuse | settings_agent | agent_email | No | No | Auto-fills from agent settings. | No |
| 7 | ¶21 NOTICES | "To Seller's agent at: Address: ______" | CONTRACT_SELLER_AGENT_NOTICE_ADDRESS | Seller Agent Notice Address | text | text | e6ee81ce-121c-472e-a26f-638769fa118e | Reuse | manual_only | (none) | No | No | Mirrors Form 11. | No |
| 7 | ¶21 NOTICES | "Phone: ______" (seller's agent) | CONTRACT_SELLER_AGENT_NOTICE_PHONE | Seller Agent Notice Phone | text | text | 5344edf6-26fb-43eb-970e-ba3a0559218f | Reuse | manual_only | (none) | No | No | Mirrors Form 11. | No |
| 7 | ¶21 NOTICES | "Email: ______" (seller's agent) | CONTRACT_SELLER_AGENT_NOTICE_EMAIL | Seller Agent Notice Email | text | text | 4e26b32b-9f6a-4eb0-b083-5ba2ab73497c | Reuse | manual_only | (none) | No | No | Mirrors Form 11. | No |
| 7 | ¶22 Financial | Checkbox "Third Party Financing Addendum" | contract_add_third_party_financing | Third Party Financing Addendum | checkbox | boolean | ea31fc21-cd56-4765-a025-1aa5720e486e | Reuse | manual_only | (none) | No | No | Check all applicable boxes. Condo ¶22 has 22 checkboxes vs Form 11's 24: no POA/HOA addendum and no mineral-reservation addendum. | No |
| 7 | ¶22 Financial | Checkbox "Addendum for Sale of Other Property by Buyer" | contract_add_sale_of_other_property | Sale of Other Property Addendum | checkbox | boolean | 93430239-9686-4eed-a3b3-7c10b16ebd1b | Reuse | manual_only | (none) | No | No | Check all applicable boxes. | No |
| 7 | ¶22 Financial | Checkbox "Addendum Concerning Right to Terminate Due to Lender's Appraisal" | contract_add_appraisal_termination | Appraisal Termination Addendum | checkbox | boolean | 12fa707b-4708-4104-a10c-c1d71c66f1e8 | Reuse | manual_only | (none) | No | No | Check all applicable boxes. | No |
| 7 | ¶22 Financial | Checkbox "Seller Financing Addendum" | contract_add_seller_financing | Seller Financing Addendum | checkbox | boolean | 8f72b85b-3771-41f6-8de3-4bee362af642 | Reuse | manual_only | (none) | No | No | Check all applicable boxes. | No |
| 7 | ¶22 Financial | Checkbox "Addendum for Section 1031 Exchange" | contract_add_1031_exchange | 1031 Exchange Addendum | checkbox | boolean | 10a5d3f4-2d75-4b91-bd44-7d8b12948d8b | Reuse | manual_only | (none) | No | No | Check all applicable boxes. | No |
| 7 | ¶22 Financial | Checkbox "Short Sale Addendum" | contract_add_short_sale | Short Sale Addendum | checkbox | boolean | be855a41-fb78-4644-96f6-b5d509b48ed7 | Reuse | manual_only | (none) | No | No | Check all applicable boxes. | No |
| 7 | ¶22 Financial | Checkbox "Loan Assumption Addendum" | contract_add_loan_assumption | Loan Assumption Addendum | checkbox | boolean | e6958e56-5ead-44b5-aa5c-027c47483194 | Reuse | manual_only | (none) | No | No | Distinct from the ¶3B financing checkbox of the same name. | No |
| 7 | ¶22 Financial | Checkbox "Addendum for Release of Liability on Assumed Loan and/or Restoration of Seller's VA Entitlement" | contract_add_release_liability_va | Release of Liability on VA Loan Addendum | checkbox | boolean | 1b1453c5-c767-4d72-b877-d82e3f91fde7 | Reuse | manual_only | (none) | No | No | Check all applicable boxes. | No |
| 7 | ¶22 Leases | Checkbox "Addendum Regarding Residential Leases" | contract_add_residential_leases | Residential Leases Addendum | checkbox | boolean | 55efbc94-ace0-4b69-a62f-e07e497d875a | Reuse | manual_only | (none) | No | No | Check all applicable boxes. | No |
| 7 | ¶22 Leases | Checkbox "Addendum Regarding Fixture Leases" | contract_add_fixture_leases | Fixture Leases Addendum | checkbox | boolean | e318f5a7-fcef-44f2-8186-6a9d610f438e | Reuse | manual_only | (none) | No | No | Check all applicable boxes. | No |
| 7 | ¶22 Leases | Checkbox "Buyer's Temporary Residential Lease" | contract_add_buyer_temp_lease | Buyer Temporary Lease Addendum | checkbox | boolean | 4c6ac32b-a0a1-4c37-bb3a-b5a2cc6c360a | Reuse | manual_only | (none) | No | No | Check all applicable boxes. | No |
| 7 | ¶22 Leases | Checkbox "Seller's Temporary Residential Lease" | contract_add_seller_temp_lease | Seller Temporary Lease Addendum | checkbox | boolean | 2e611a67-81dd-4b7a-8a10-7d66e2253cea | Reuse | manual_only | (none) | No | No | Check all applicable boxes. | No |
| 7 | ¶22 Additional Tests and Reports | Checkbox "Addendum for Authorizing Hydrostatic Testing" | contract_add_hydrostatic_testing | Hydrostatic Testing Addendum | checkbox | boolean | edb234b3-1a69-41d3-a966-18a62f368dfa | Reuse | manual_only | (none) | No | No | Check all applicable boxes. | No |
| 7 | ¶22 Additional Tests and Reports | Checkbox "Environmental Assessment, Threatened or Endangered Species, and Wetlands Addendum" | contract_add_environmental | Environmental Assessment Addendum | checkbox | boolean | 23b68c56-44ec-4601-b424-b16b7be6becf | Reuse | manual_only | (none) | No | No | Check all applicable boxes. | No |
| 7 | ¶22 Statutory Disclosures and Notices | Checkbox "Addendum for Seller's Disclosure of Information on Lead-Based Paint ..." | contract_add_lead_paint | Lead-Based Paint Addendum | checkbox | boolean | 63ffe296-e1b0-46a2-8986-194cd41ee130 | Reuse | manual_only | (none) | No | No | Check all applicable boxes. | No |
| 7 | ¶22 Statutory Disclosures and Notices | Checkbox "Addendum for Property in a Propane Gas System Service Area" | contract_add_propane_service_area | Propane Service Area Addendum | checkbox | boolean | 0fa2d58a-a40e-4261-a7f9-9fd2d6f9a1bc | Reuse | manual_only | (none) | No | No | Check all applicable boxes. | No |
| 7 | ¶22 Statutory Disclosures and Notices | Checkbox "Addendum for Property Located Seaward of the Gulf Intercoastal Waterway" | contract_add_seaward_gulf | Seaward Gulf Addendum | checkbox | boolean | 592764cb-e12b-4200-8d6f-8ac521b522aa | Reuse | manual_only | (none) | No | No | Check all applicable boxes. | No |
| 7 | ¶22 Statutory Disclosures and Notices | Checkbox "Addendum for Coastal Area Property" | contract_add_coastal_area | Coastal Area Addendum | checkbox | boolean | a5737a0f-4449-4be7-b6fa-569c79abf14a | Reuse | manual_only | (none) | No | No | Check all applicable boxes. | No |
| 7 | ¶22 Statutory Disclosures and Notices | Checkbox "The following utility, water, drainage, public improvement, and other district notices" | contract_add_district_notices | District Notices Addendum | checkbox | boolean | 340c75a3-59bf-4626-b735-a499f182c147 | Reuse | manual_only | (none) | No | No | Check all applicable boxes; paired with the free-text list below. | No |
| 7 | ¶22 Statutory Disclosures and Notices | "(list all that have been given or are attached): ______" | contract_add_district_notices_text | District Notices Addendum Text | text | text | a4822d94-0094-4de0-82ec-abfe48aee3b7 | Reuse | manual_only | (none) | No | No | Two-line underscore blank; single field per Form 11. | No |
| 7 | ¶22 Other | Checkbox "Non-Realty Items Addendum" | contract_add_non_realty_items | Non-Realty Items Addendum | checkbox | boolean | c6d33c3e-c66b-4ec3-adde-f13c658f744b | Reuse | manual_only | (none) | No | No | Check all applicable boxes. | No |
| 7 | ¶22 Other | Checkbox "Addendum for 'Back-Up' Contract" | contract_add_backup_contract | Backup Contract Addendum | checkbox | boolean | e1d7d1f2-285f-42eb-9284-b5c0250f0914 | Reuse | manual_only | (none) | No | No | Check all applicable boxes. NOTE: contract_add_hoa (4a07750e-d9fe-4102-bd39-1e2046df3ead) and contract_add_mineral_reservation (e8acfe5f-8391-4d5d-97db-1cdcb25d9637) are intentionally NOT carried over — neither appears in the condo ¶22 list. | No |
| 7 | ¶22 Other | Checkbox "Other:" | contract_add_other | Other Addendum | checkbox | boolean | 60ba8b16-1b12-47d8-b6f0-a1b73dbf1fe5 | Reuse | manual_only | (none) | No | No | Paired with the free-text blank below. | No |
| 7 | ¶22 Other | "Other: ______" free-text | contract_add_other_text | Other Addendum Text | text | text | 71782c8b-390e-4618-9f87-766cd7fde593 | Reuse | manual_only | (none) | No | No | Two-line underscore blank; single field per Form 11. | No |
| 8 | Page header | "Contract Concerning ______ (Address of Property)" | property_concerning_full_address | Contract Concerning Property Address | text | text | a68f94bb-1c06-4b40-b54f-9889c945e80f | Reuse | packet_property | full_address (resolver_key property_full_address) | No | No | Per-page header mapping. | No |
| 8 | ¶23 CONSULT AN ATTORNEY | "Buyer's Attorney is: ______" | contract_buyer_attorney_name | Buyer Attorney Name | text | text | 76392860-8eb5-4e2f-9145-98e985442c6f | Reuse | manual_only | (none) | No | No | Attorney contact blanks are data fields, not signature lines, and are mapped in Form 11. The full-width continuation rule under each "Attorney is" line is left unmapped, as in Form 11. | No |
| 8 | ¶23 CONSULT AN ATTORNEY | "Phone: ( ) ______" (buyer's attorney) | contract_buyer_attorney_phone | Buyer Attorney Phone | text | text | 4b307b3b-1c5a-4d40-9815-70e8dba86219 | Reuse | manual_only | (none) | No | No | Mirrors Form 11. | No |
| 8 | ¶23 CONSULT AN ATTORNEY | "E-mail: ______" (buyer's attorney) | contract_buyer_attorney_email | Buyer Attorney Email | text | text | 264c6379-7d86-4c41-896b-e3f18f20fb42 | Reuse | manual_only | (none) | No | No | Mirrors Form 11. | No |
| 8 | ¶23 CONSULT AN ATTORNEY | "Seller's Attorney is: ______" | contract_seller_attorney_name | Seller Attorney Name | text | text | 70518a5d-5225-48a7-8776-61cbddcc5de1 | Reuse | manual_only | (none) | No | No | Mirrors Form 11. | No |
| 8 | ¶23 CONSULT AN ATTORNEY | "Phone: ( ) ______" (seller's attorney) | contract_seller_attorney_phone | Seller Attorney Phone | text | text | 527089d0-d9e2-4e69-b905-cfed2f9f124e | Reuse | manual_only | (none) | No | No | Mirrors Form 11. | No |
| 8 | ¶23 CONSULT AN ATTORNEY | "E-mail: ______" (seller's attorney) | contract_seller_attorney_email | Seller Attorney Email | text | text | a8629468-ba85-48e6-9520-2171ecff300f | Reuse | manual_only | (none) | No | No | Mirrors Form 11. The two "Fax:" rules are excluded, as in Form 11. | No |
| 8 | Execution block | "EXECUTED the ______ day of" | contract_effective_day | Contract Effective Day | text | number | 6ecc9d0d-b686-485b-a843-52b6a823a5d3 | Reuse (optional) | manual_only | (none) | No | No | OPTIONAL / divergence: Form 11 leaves the execution date entirely unmapped, but these three globals are ACTIVE and already used by amendment-style forms. Recommend mapping here; drop all three rows for strict Form 11 parity. Not a signature line. | No |
| 8 | Execution block | "day of ______," (month) | contract_effective_month | Contract Effective Month | text | text | 962653cf-db0a-436a-ae79-4056b5e800ea | Reuse (optional) | manual_only | (none) | No | No | OPTIONAL — see the day row above. | No |
| 8 | Execution block | ", 20 ______ (Effective Date)" | contract_effective_year | Contract Effective Year | text | number | bb7c7355-bfa7-47ae-85b6-70234ef2a218 | Reuse (optional) | manual_only | (none) | No | No | OPTIONAL — see the day row above. The four Buyer/Seller signature rules below this line are excluded. | No |
| 9 | Page header | "Contract Concerning ______ (Address of Property)" | property_concerning_full_address | Contract Concerning Property Address | text | text | a68f94bb-1c06-4b40-b54f-9889c945e80f | Reuse | packet_property | full_address (resolver_key property_full_address) | No | No | Per-page header mapping. | No |
| 9 | Broker Contact Information — Seller's agent block | "______ (Broker Firm) represents Seller only as Seller's agent" | CONTRACT_SELLER_BROKERAGE_NAME | Seller Brokerage Name | text | text | b5e63034-df99-47fe-a303-8395d8e67bc4 | Reuse | manual_only | (none) | No | No | This page is laid out identically to Form 11 page 11 (41 blanks in the same order), so all 41 fields reuse 1:1. | No |
| 9 | Broker Contact Information — Seller's agent block | "Address:" | CONTRACT_SELLER_BROKERAGE_ADDRESS | Seller Brokerage Address | text | text | 9b1476c9-c080-4cba-ba90-083ffac3acc9 | Reuse | manual_only | (none) | No | No | Seller-side broker data is manual in Form 11. | No |
| 9 | Broker Contact Information — Seller's agent block | "Broker Firm License No.:" | CONTRACT_SELLER_BROKERAGE_LICENSE_NUMBER | Seller Brokerage License Number | text | text | 6ed5cbc5-7cdd-4741-bc2a-7ea2694a0c0b | Reuse | manual_only | (none) | No | No | 1:1 with Form 11. | No |
| 9 | Broker Contact Information — Seller's agent block | "Associate's Name:" | CONTRACT_SELLER_ASSOCIATE_NAME | Seller Associate Name | text | text | 1f6d3787-a26d-41a8-bca1-0e3c12aa01da | Reuse | manual_only | (none) | No | No | 1:1 with Form 11. | No |
| 9 | Broker Contact Information — Seller's agent block | "Team Name:" | contract_seller_team_name | Seller Team Name | text | text | 91da9194-9c59-4d67-a796-33959c7f1515 | Reuse | manual_only | (none) | No | No | 1:1 with Form 11. | No |
| 9 | Broker Contact Information — Seller's agent block | "Associate's Email:" | CONTRACT_SELLER_ASSOCIATE_EMAIL | Seller Associate Email | text | text | 5444edd7-00dd-4dae-abea-c41b2e44a86c | Reuse | manual_only | (none) | No | No | 1:1 with Form 11. | No |
| 9 | Broker Contact Information — Seller's agent block | "Associate's Phone No.:" | CONTRACT_SELLER_ASSOCIATE_PHONE | Seller Associate Phone | text | text | 5278eb4f-81c5-4516-9a1e-dc2fe9b3694a | Reuse | manual_only | (none) | No | No | 1:1 with Form 11. | No |
| 9 | Broker Contact Information — Seller's agent block | "Associate's License No.:" | CONTRACT_SELLER_ASSOCIATE_LICENSE_NUMBER | Seller Associate License Number | text | text | bf4fc543-73e0-40de-920b-cf580de76766 | Reuse | manual_only | (none) | No | No | 1:1 with Form 11. | No |
| 9 | Broker Contact Information — Seller's agent block | "Licensed Supervisor of Associate:" | CONTRACT_SELLER_SUPERVISOR_NAME | Seller Supervisor Name | text | text | 50babb47-5a7a-4b44-bd6c-f73bd1a9e928 | Reuse | manual_only | (none) | No | No | 1:1 with Form 11. | No |
| 9 | Broker Contact Information — Seller's agent block | "Phone No. of Licensed Supervisor:" | CONTRACT_SELLER_SUPERVISOR_PHONE | Seller Supervisor Phone | text | text | e9228a34-60fe-4f84-869b-9d1c3232c988 | Reuse | manual_only | (none) | No | No | 1:1 with Form 11. | No |
| 9 | Broker Contact Information — Seller's agent block | "License No.:" (supervisor) | CONTRACT_SELLER_SUPERVISOR_LICENSE_NUMBER | Seller Supervisor License Number | text | text | f2b768de-9ebf-4957-9a3e-be09633f8b9a | Reuse | manual_only | (none) | No | No | 1:1 with Form 11. | No |
| 9 | Broker Contact Information — Buyer's agent block | "______ (Broker Firm) represents Buyer only as Buyer's agent" | CONTRACT_BUYER_BROKERAGE_NAME | Buyer Brokerage Name | text | text | b42f2091-5492-46d3-8c28-5fd714455bf3 | Reuse | settings_brokerage | brokerage_name | No | No | Buyer-side broker block auto-fills from brokerage/agent settings, matching Form 11. | No |
| 9 | Broker Contact Information — Buyer's agent block | "Address:" | CONTRACT_BUYER_BROKERAGE_ADDRESS | Buyer Brokerage Address | text | text | 12a8aeaa-5a91-40d3-b102-a63b4f4c22d3 | Reuse | settings_brokerage | brokerage_address | No | No | 1:1 with Form 11. | No |
| 9 | Broker Contact Information — Buyer's agent block | "Broker Firm License No.:" | CONTRACT_BUYER_BROKERAGE_LICENSE_NUMBER | Buyer Brokerage License Number | text | text | 1886fa07-898b-4e78-ad1f-978b38274408 | Reuse | settings_brokerage | brokerage_license_number | No | No | 1:1 with Form 11. | No |
| 9 | Broker Contact Information — Buyer's agent block | "Associate's Name:" | CONTRACT_BUYER_ASSOCIATE_NAME | Buyer Associate Name | text | text | 29670cf7-32c9-4945-8abb-d56d7d8fe79e | Reuse | settings_agent | agent_full_name | No | No | 1:1 with Form 11. | No |
| 9 | Broker Contact Information — Buyer's agent block | "Team Name:" | contract_buyer_team_name | Buyer Team Name | text | text | 935d93e7-ae26-4ea6-a9cb-226ddc23170f | Reuse | manual_only | (none) | No | No | Manual in Form 11 (no team setting exists). | No |
| 9 | Broker Contact Information — Buyer's agent block | "Associate's Email:" | CONTRACT_BUYER_ASSOCIATE_EMAIL | Buyer Associate Email | text | text | 5e474cf8-e3b9-40ae-8301-d79fad1692ab | Reuse | settings_agent | agent_email | No | No | 1:1 with Form 11. | No |
| 9 | Broker Contact Information — Buyer's agent block | "Associate's Phone No.:" | CONTRACT_BUYER_ASSOCIATE_PHONE | Buyer Associate Phone | text | text | 800a48f4-2fcd-42ae-ab9f-5224641e0f80 | Reuse | settings_agent | agent_phone | No | No | 1:1 with Form 11. | No |
| 9 | Broker Contact Information — Buyer's agent block | "Associate's License No.:" | CONTRACT_BUYER_ASSOCIATE_LICENSE_NUMBER | Buyer Associate License Number | text | text | 53d6a7bf-9725-4d98-89ed-11630dd92a41 | Reuse | settings_agent | agent_license_number | No | No | 1:1 with Form 11. | No |
| 9 | Broker Contact Information — Buyer's agent block | "Licensed Supervisor of Associate:" | CONTRACT_BUYER_SUPERVISOR_NAME | Buyer Supervisor Name | text | text | 9d8911a8-d341-4dbe-8d9c-3432c106caf9 | Reuse | settings_brokerage | broker_full_name | No | No | 1:1 with Form 11. | No |
| 9 | Broker Contact Information — Buyer's agent block | "Phone No. of Licensed Supervisor:" | CONTRACT_BUYER_SUPERVISOR_PHONE | Buyer Supervisor Phone | text | text | e37be25c-0504-4b90-8c93-cd6dd06aab53 | Reuse | settings_brokerage | broker_phone | No | No | 1:1 with Form 11. | No |
| 9 | Broker Contact Information — Buyer's agent block | "License No.:" (supervisor) | CONTRACT_BUYER_SUPERVISOR_LICENSE_NUMBER | Buyer Supervisor License Number | text | text | 498c7f0c-0fc7-4565-a782-bb95e288c4a1 | Reuse | settings_brokerage | broker_license_number | No | No | 1:1 with Form 11. | No |
| 9 | Broker Contact Information — Intermediary block | "______ (Broker Firm) represents Seller and Buyer as an intermediary" | CONTRACT_INTERMEDIARY_BROKERAGE_NAME | Intermediary Brokerage Name | text | text | d1616f69-586d-4732-a7a0-665f46fda132 | Reuse | manual_only | (none) | No | No | 1:1 with Form 11. | No |
| 9 | Broker Contact Information — Intermediary block | "Address:" | CONTRACT_INTERMEDIARY_BROKERAGE_ADDRESS | Intermediary Brokerage Address | text | text | a09cc606-6215-4cbb-97a8-8ad7e5813176 | Reuse | manual_only | (none) | No | No | 1:1 with Form 11. | No |
| 9 | Broker Contact Information — Intermediary block | "Broker Firm License No.:" | CONTRACT_INTERMEDIARY_BROKERAGE_LICENSE_NUMBER | Intermediary Brokerage License Number | text | text | f956d037-b9fa-4eb5-9267-f408a901e552 | Reuse | manual_only | (none) | No | No | 1:1 with Form 11. | No |
| 9 | Broker Contact Information — Intermediary block | "Associate's Name (for Seller):" | contract_intermediary_seller_associate_name | Intermediary Seller Associate Name | text | text | 840176fc-0cc0-4735-b96f-f3ce86a30ee0 | Reuse | manual_only | (none) | No | No | 1:1 with Form 11. | No |
| 9 | Broker Contact Information — Intermediary block | "Team Name:" (for Seller) | contract_intermediary_seller_team_name | Intermediary Seller Team Name | text | text | 98a1e6f6-645a-46fb-b19f-ab581c998f80 | Reuse | manual_only | (none) | No | No | 1:1 with Form 11. | No |
| 9 | Broker Contact Information — Intermediary block | "Associate's Email:" (for Seller) | contract_intermediary_seller_associate_email | Intermediary Seller Associate Email | text | text | 08b90eab-0dca-427a-b41f-ad38d2033077 | Reuse | manual_only | (none) | No | No | 1:1 with Form 11. | No |
| 9 | Broker Contact Information — Intermediary block | "Associate's Phone No.:" (for Seller) | contract_intermediary_seller_associate_phone | Intermediary Seller Associate Phone | text | text | 04cb1203-c612-4cb3-81a1-758f8d7a263c | Reuse | manual_only | (none) | No | No | 1:1 with Form 11. | No |
| 9 | Broker Contact Information — Intermediary block | "Associate's License No.:" (for Seller) | contract_intermediary_seller_associate_license_number | Intermediary Seller Associate License Number | text | text | f13acc7d-8874-4802-b523-8a8439537a7c | Reuse | manual_only | (none) | No | No | 1:1 with Form 11. | No |
| 9 | Broker Contact Information — Intermediary block | "Licensed Supervisor of Associate:" (for Seller) | contract_intermediary_seller_supervisor_name | Intermediary Seller Supervisor Name | text | text | b53d1d91-9ee7-48dc-b755-b476e4b38006 | Reuse | manual_only | (none) | No | No | 1:1 with Form 11. | No |
| 9 | Broker Contact Information — Intermediary block | "Phone No. of Licensed Supervisor:" (for Seller) | contract_intermediary_seller_supervisor_phone | Intermediary Seller Supervisor Phone | text | text | 64058a51-f1cb-4ad6-b359-c17169b3730f | Reuse | manual_only | (none) | No | No | 1:1 with Form 11. | No |
| 9 | Broker Contact Information — Intermediary block | "License No.:" (Seller-side supervisor) | contract_intermediary_seller_supervisor_license_number | Intermediary Seller Supervisor License Number | text | text | aacce3b7-7683-4728-b5cf-1fd4588d253b | Reuse | manual_only | (none) | No | No | 1:1 with Form 11. | No |
| 9 | Broker Contact Information — Intermediary block | "Associate's Name (for Buyer):" | CONTRACT_INTERMEDIARY_BUYER_ASSOCIATE_NAME | Intermediary Buyer Associate Name | text | text | 3698d278-52b8-4039-8345-f766f81ed826 | Reuse | manual_only | (none) | No | No | 1:1 with Form 11. | No |
| 9 | Broker Contact Information — Intermediary block | "Team Name:" (for Buyer) | contract_intermediary_buyer_team_name | Intermediary Buyer Team Name | text | text | d3496ab1-31c6-44c4-b722-d0f39a96fcda | Reuse | manual_only | (none) | No | No | 1:1 with Form 11. | No |
| 9 | Broker Contact Information — Intermediary block | "Associate's Email:" (for Buyer) | CONTRACT_INTERMEDIARY_BUYER_ASSOCIATE_EMAIL | Intermediary Buyer Associate Email | text | text | acefce9b-47b9-4981-be4e-b89b856b8b06 | Reuse | manual_only | (none) | No | No | 1:1 with Form 11. | No |
| 9 | Broker Contact Information — Intermediary block | "Associate's Phone No.:" (for Buyer) | CONTRACT_INTERMEDIARY_BUYER_ASSOCIATE_PHONE | Intermediary Buyer Associate Phone | text | text | 71f118dc-7958-4357-a8cd-0d9629c4e22f | Reuse | manual_only | (none) | No | No | 1:1 with Form 11. | No |
| 9 | Broker Contact Information — Intermediary block | "Associate's License No.:" (for Buyer) | CONTRACT_INTERMEDIARY_BUYER_ASSOCIATE_LICENSE_NUMBER | Intermediary Buyer Associate License Number | text | text | dc68b037-4f8e-4425-8dc7-6d734b677897 | Reuse | manual_only | (none) | No | No | 1:1 with Form 11. | No |
| 9 | Broker Contact Information — Intermediary block | "Licensed Supervisor of Associate:" (for Buyer) | CONTRACT_INTERMEDIARY_BUYER_SUPERVISOR_NAME | Intermediary Buyer Licensed Supervisor Name | text | text | 176da3c1-7ce7-4d8b-939d-677577621e21 | Reuse | manual_only | (none) | No | No | 1:1 with Form 11. | No |
| 9 | Broker Contact Information — Intermediary block | "Phone No. of Licensed Supervisor:" (for Buyer) | CONTRACT_INTERMEDIARY_BUYER_SUPERVISOR_PHONE | Intermediary Buyer Licensed Supervisor Phone | text | text | 75942b36-d7f6-4075-ac11-1fd6d275c9bf | Reuse | manual_only | (none) | No | No | 1:1 with Form 11. | No |
| 9 | Broker Contact Information — Intermediary block | "License No.:" (Buyer-side supervisor) | CONTRACT_INTERMEDIARY_BUYER_SUPERVISOR_LICENSE_NUMBER | Intermediary Buyer Licensed Supervisor License Number | text | text | dfac407d-bfcc-4be1-ac10-4f0cee50c3c8 | Reuse | manual_only | (none) | No | No | 1:1 with Form 11. Page header note: "(Print name(s) only. Do not sign)" — no signature lines exist in this block. | No |
| 10 | Page header | "Contract Concerning ______ (Address of Property)" | property_concerning_full_address | Contract Concerning Property Address | text | text | a68f94bb-1c06-4b40-b54f-9889c945e80f | Reuse | packet_property | full_address (resolver_key property_full_address) | No | No | Only mapping proposed on the receipts page, exactly matching Form 11's treatment of its page 12. All four receipt blocks (Option Fee, Earnest Money, Contract, Additional Earnest Money) are excluded: the Escrow Agent / Received by / Date / Date-Time lines are signature-style, and the amount, "in the form of", address, phone, city/state/zip and fax blanks are receipt administrative data that Form 11 does not map. Roughly 26 blanks excluded on this page — revisit only if escrow-receipt automation is added later. | No |

<!-- TABLE_END -->

---

## D. Reuse analysis (vs One to Four / TXR-1601 Form #11)

### Shared sections — safe reuse

| Condo section | Form 11 analogue | Reuse approach |
|---------------|------------------|----------------|
| ¶1 Parties | ¶1 | `CONTRACT_SELLER_NAMES`, `contract_buyer_names` (`buyer_names` resolver) |
| ¶2 exclusions | ¶2D exclusions | `CONTRACT_PROPERTY_EXCLUSIONS` |
| City / County / address-zip style blanks | ¶2A | `PROPERTY_CITY`, `property_county`, `PROPERTY_ADDRESS_ZIP` (same Form 11 convention for address/zip blank) |
| Header “Contract Concerning …” (pp. 2–10) | pp. 2–12 | `property_concerning_full_address` → `packet_property.full_address` |
| ¶3 Sales Price + financing addenda checks | ¶3 | cash / financing / total + third-party / assumption / seller-financing checkboxes |
| ¶4 Residential + Fixture leases | ¶4 A/B | Same lease checkboxes; **omit** natural-resource lease cluster (absent on condo) |
| ¶5 Earnest money / option | ¶5 | Escrow agent, amounts, days, option period |
| ¶6 Title policy payor + company; objections | ¶6A/D | Title payor checkboxes, company, objection use/days — **omit** survey options and boundary-exception amend cluster (no survey paragraph on condo) |
| ¶7 Seller’s Disclosure / As Is / service contract | ¶7 | Same disclosure triad + As Is pair + repairs + service-contract reimbursement — **omit** water disclosure cluster (not on condo contract) |
| ¶8–12B Broker disclosure, closing, possession, special provisions, expense contribution, brokerage compensation | Same | Full Form 11 field set for those blanks |
| ¶21 Notices | ¶21 | Buyer/seller/agent notice fields with same auto-source pattern |
| ¶22 Addenda (overlapping items) | ¶22 | Reuse matching `contract_add_*` fields |
| ¶23 Attorney contacts | ¶23 | Name/phone/email (fax excluded like Form 11) |
| Broker Contact Information page | Form 11 p11 | Full seller / buyer / intermediary associate blocks |

### Legally / structurally different — do not reuse subdivision keys

| Condo blank | Must not reuse | Why |
|-------------|----------------|-----|
| Unit | `PROPERTY_LOT` | Lot ≠ condominium unit |
| Building | `PROPERTY_BLOCK` | Block ≠ building |
| Condominium project name | `PROPERTY_ADDITION` | Addition/subdivision ≠ condo project name; also ≠ `HOA_ASSOCIATION_NAME` (association vs project) |
| Assigned parking text | `garage_spaces` | Count ≠ assigned Limited Common Element description |
| Documents / Certificate / right-of-refusal blanks | HOA-addendum resale-certificate pair | Different statute/form context (`§82.156/157` on this contract vs HOA addendum elections) |
| Association transfer charges cap (¶12A(3)) | `hoa_addendum_transfer_fee_cap` | Same *idea*, different form instrument — keep separate to avoid cross-form bleed |

### Form-specific keys that stay on Form 11 only

Intentionally **not** proposed for condo: natural-resource lease fields; all survey-option fields; HOA subject/not-subject; water disclosure fields; `contract_add_hoa`; `contract_add_mineral_reservation`; title-exception amend cluster.

### Optional Form 11 divergences (Lee decide)

- Map `seller_city_state_zip` on ¶21 seller address continuation (Form 11 left unmapped).
- Map `contract_effective_day` / `month` / `year` on execution block (Form 11 left unmapped).

---

## E. Proposed new Global fields

| Proposed field_key | Why no safe reusable ACTIVE field |
|--------------------|-----------------------------------|
| `contract_condo_unit_number` | No ACTIVE Global currently bound to `packet_property.unit` (path exists; catalog row does not). Must not reuse lot/block. |
| `contract_condo_building` | No building identity field in catalog; must not reuse block. |
| `contract_condo_project_name` | No condominium project field; must not reuse addition or HOA association name. |
| `contract_condo_parking_assigned` | No assigned-parking free-text Global; `garage_spaces` is a different data type/meaning. |
| `contract_condo_documents_received` | Condo Documents receipt election — no 1-4 analogue. |
| `contract_condo_documents_not_received` | Paired election. |
| `contract_condo_documents_delivery_days` | Delivery window when not received. |
| `contract_condo_certificate_received` | Resale Certificate election — distinct from HOA-addendum “updated certificate” pair. |
| `contract_condo_certificate_not_received` | Paired election. |
| `contract_condo_certificate_delivery_days` | Delivery window. |
| `contract_condo_certificate_affidavit_waiver` | Third Certificate option (affidavit / waiver). |
| `contract_condo_right_of_refusal_certification_days` | Right-of-refusal certification deadline — unique to condo ¶2D. |
| `contract_condo_association_transfer_charges_cap` | ¶12A(3) Association transfer charges — not present on 1-4; keep separate from HOA-addendum transfer-fee cap. |

---

## F. Source review

### Automatically sourced from a maintained business object

- `packet_property`: `full_address` (header ×9), `city`, `county`, `address_city_state_zip` (Form 11 convention for address/zip blank), **`unit`** (new condo unit field)
- `packet_contact`: buyer notice address / city-state-zip
- `settings_agent` / `settings_brokerage`: buyer-side agent & brokerage broker-info block; buyer agent notice phone/email

### Supported custom resolvers

- `buyer_names`, `buyer_notice_phone`, `buyer_notice_email`
- Optional: `seller_city_state_zip` if Lee accepts the Form 11 divergence

### `manual_only`

All remaining contract elections, money amounts, days, seller-side contacts, attorney blanks, seller/intermediary broker blocks, condo Documents/Certificate/refusal fields, building/project/parking (unless Lee later adds Property columns), Association transfer-cap, etc.

### Unresolved pending Lee’s decision

1. Confirm TREC 30-18 PDF ≡ intended TXR-1605 / `CondoListing.pdf`.
2. Page-1 blank between “County of ___,” and preprinted “Texas” — leave unmapped vs map as `property_legal_description` (must **not** use `PROPERTY_STATE`).
3. Optional Property columns for **building** and **condominium project name**.
4. Optional Form 11 divergences (seller city/state/zip; effective day/month/year).
5. Whether `PROPERTY_ADDRESS_ZIP` / `address_city_state_zip` is the preferred binding for “located at (address/zip code)” vs `full_address` / `street_address` (Form 11 used the ZIP field — proposed for consistency).

**Not proposed as automatic sources:** Personal/Organization defaults; revived `contract_details` / `listing_agreement_details` / `packet` / `static_default`; inventing sources without Property UI maintenance.

**HOA note:** Condo ¶2 refers to the Association but has **no Association-name blank**. `HOA_ASSOCIATION_NAME` / `property_hoa_name` are therefore **not** mapped on this form unless Lee later identifies a blank we missed.

---

## G. Schema / data-model questions (no changes now)

| # | Question | Recommendation if undecided |
|---|----------|------------------------------|

`properties.unit` already exists — **no migration** required for the unit blank.

---

## H. Excluded signing / initials / receipt fields

Approximate **~72** omitted controls:

- Buyer and Seller **initials** strips on pages 1–10 (identification only)
- Page 8 **Buyer/Seller signature** lines (×4 party signature rules)
- Page 8 attorney **Fax** blanks (Form 11 practice)
- Page 10 receipt blocks (Option Fee, Earnest Money, Contract Receipt, Additional Earnest Money): Escrow Agent / Received by / Date / Date-Time signature-style lines **and** Form-11-style omission of receipt administrative amount/address/phone/fax blanks
- Broker page instruction “Print name(s) only. Do not sign” — contact info is included; no signature fields

Authentisign remains responsible for signing/initials.

---

## I. Development execution plan (after Lee approves)

1. **Confirm PDF asset** — store Lee’s approved TXR-1605 / CondoListing PDF (or confirmed TREC 30-18) under a new Global form path such as `global/forms/<newId>/…` after the form row exists.
2. **Create development form row** — ACTIVE GLOBAL, `form_code` `TXR-1605` (and/or TREC 30-18 in version label), version dated `05-04-2026`, linked storage path. Do **not** reuse form IDs 21/23.
3. **Insert only the 13 new Global fields** — soft-deletable catalog rows; no Global preference literals; sources as approved (`unit` → `packet_property.unit`; others `manual_only` unless Lee approved schema).
4. **Reuse 148 existing Globals** — create `form_field_mappings` only; do not duplicate catalog rows.
5. **Initial placements** — approximate rectangles from PDF geometry / Form 11 analogues; Lee finalizes in Map Fields.
6. **No defaults** in this phase — Lee sets Personal/Organization defaults later in Map Fields.
7. **Validation** — mapping count vs inventory; AcroForm still 0; smoke Map Fields + Fill Form open (snapshot immutability); targeted tests for any new keys; `tsc` / focused lint.
8. **Rollback** — soft-delete new mappings/fields/form; do not hard-delete; do not edit applied migrations (forward-only if any schema later).
9. **Production promotion (later, separate task)**  
   - Resolve production condo form by **stable identity** (`form_code` / version / name), not numeric ID equality.  
   - Reuse matching ACTIVE Global fields; insert only missing Globals.  
   - Upsert mappings for the **existing** production form; never insert a duplicate form.  
   - Promote placements/defaults only after Lee finishes editing in development.  
   - Preserve unrelated production data; no historical `field_instances` rewrites.  
   - Dry-run + strict target guards (`eetonalyyyssvkyfdoxh` only when explicitly approved).

---

## Environment & change confirmation

| Check | Result |
|-------|--------|
| Active target | `ewxsxwzezhkeawnjvigx` (`harbaugh-forms-dev`) |
| Production modified | **No** |
| Development data modified | **No** (read-only queries + local `_audit_tmp` artifacts only) |
| Migrations / storage uploads | **None** |

---

## Companion artifacts (local, not committed unless desired)

- `_audit_tmp/TREC_30-18.pdf`
- `_audit_tmp/condo_pages/page_*.txt`
- `_audit_tmp/form11_mappings.json`
- `_audit_tmp/active_global_fields.json`
- `_audit_tmp/condo_inventory_table.md`
- `_audit_tmp/condo_inventory_counts.json`
