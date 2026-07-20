# Defaults Classification Report

**Source:** `_defaults_inventory.json` (generated 2026-07-15T21:52:19.340Z)  
**Lee (PRIVATE destination):** `e26c8f57-c0aa-4474-b43e-6e15f0260e99`  
**Org (ORGANIZATION destination):** `b788f525-53f4-42ed-b5a1-cb741398a974` — Davey Goosmann Realty  

**Inventory totals:** 94 GLOBAL field literal defaults · 30 GLOBAL mapping overrides · 0 Lee-owned fields today  

Sensitive literal values (phones, emails, licenses, street addresses) are **not** present in Section A defaults. Full values for migration are limited to non-PII literals in [Sensitive values for migration script](#sensitive-values-for-migration-script).

---

## 1. Counts by classification

### Field defaults (94)

| Classification | Count | ACTIVE | INACTIVE |
|---|---:|---:|---:|
| PRIVATE | 54 | 53 | 1 |
| ORGANIZATION | 4 | 4 | 0 |
| PACKET-SPECIFIC | 1 | 1 | 0 |
| STRUCTURAL CONSTANT | 32 | 17 | 15 |
| UNKNOWN — HUMAN REVIEW REQUIRED | 3 | 3 | 0 |
| **Total** | **94** | **78** | **16** |

### Mapping overrides (30)

| Classification | Count | ACTIVE | DELETED |
|---|---:|---:|---:|
| STRUCTURAL CONSTANT | 26 | 15 | 11 |
| UNKNOWN — HUMAN REVIEW REQUIRED | 4 | 0 | 4 |
| **Total** | **30** | **15** | **15** |

### Combined actionable migration load

| Proposed destination | Field IDs | Notes |
|---|---:|---|
| PRIVATE → Lee | 54 (53 ACTIVE + 1 INACTIVE) | Clear Global `default_value` / `default_checked`, recreate as Lee private defaults |
| ORGANIZATION → Davey | 4 | Clear Global, recreate as org defaults |
| Clear only (PACKET / bad Global) | 1 (+3 UNKNOWN decision) | Do not keep as Global preference |
| Leave / restore as STRUCTURAL on Global | 17 ACTIVE NA/0 fields + 15 ACTIVE mappings | Prefer cleanup of 15 INACTIVE AcroForm Off field duplicates |
| Human review | 3 fields + 4 DELETED mappings | Decide before migrate |

---

## 2. Recommended migration mapping

### → PRIVATE (Lee) — `e26c8f57-c0aa-4474-b43e-6e15f0260e99`

Clear these from Global field defaults; recreate as Lee private defaults (54 field_ids; value category noted).

| field_id | field_key | value category | rationale |
|---|---|---|---|
| `a528c4e3-d980-42f8-9b90-789d746f6145` | CONTRACT_WATER_DISCLOSURE_NOT_REQUIRED | boolean | Practice checkbox default, not a promulgated universal |
| `947bb7a8-4cbe-46c0-bc0f-fc6e8a31366e` | ALLOW_INTERMEDIARY | boolean | Intermediary preference (INACTIVE field; still Lee preference if revived) |
| `36daae3b-ffb0-4be0-ab63-ec17c2f5d006` | BUYER_REP_ADD_GENERAL_INFORMATION_NOTICE | boolean | Preferred addendum |
| `7ca1c044-59f3-4fbe-9ff6-d2509cd61313` | BUYER_REP_ADD_WIRE_FRAUD | boolean | Preferred addendum |
| `31b47d47-9fa6-454e-874e-a1a36ef2c1c0` | PAYMENT_COUNTY | text | County default (Dallas/Tarrant) — Lee market |
| `09a715cb-7a37-4692-bba8-f8d2316074f0` | ADD_IABS | boolean | Preferred addendum / inclusion habit |
| `5ed7cc9f-622f-4c91-b5b7-5b8aa0e0585c` | PROTECTION_PERIOD_DAYS | days | Protection period preference |
| `dba66736-1ec2-41e0-8be2-5566cd7e6507` | BUYER_REP_INTERMEDIARY_STATUS_YES | boolean | Intermediary preference |
| `d7cd8260-f5af-42b8-89cf-2d0da3399648` | BUYER_REP_ADD_HOME_INSPECTION | boolean | Preferred addendum |
| `36a310d2-d5b4-43ea-be8c-19e25d5ae1bd` | ASSOCIATE_SIGNATURE_BOX | boolean | Associate-signature UX tied to Lee’s role |
| `c212f8d3-fe1f-49cb-b50d-7ca25d285c54` | MLS_FILE_LISTING | boolean | MLS filing preference |
| `6b65f1b8-8760-4b12-91e1-29f5fc4ea468` | LISTING_COMPENSATION_MODEL_WITH_COOP | boolean | Compensation model preference |
| `b1fe245b-392a-4602-972e-00a3e1c375de` | MLS_FILE_IMMEDIATELY | boolean | MLS timing preference |
| `4c8b9d81-896a-4516-8236-28266ff077a8` | KEYBOX_AUTHORIZED_YES | boolean | Keybox preference |
| `4cb5280f-65e4-4419-8c02-aab5f283ce2a` | LISTING_INTERMEDIARY_YES | boolean | Intermediary preference |
| `3311c96c-eb8f-42c7-989a-9de1bb97c6ad` | FINANCING_CONVENTIONAL | boolean | Listing financing acceptance habit |
| `9db19ac1-eabb-4826-9757-6c9efa83b45f` | FINANCING_FHA | boolean | Same |
| `966f8d2d-932a-4d8a-9a94-370550690cda` | FINANCING_VA | boolean | Same |
| `860c8696-5631-4e3e-a690-2a823795c173` | FINANCING_TEXAS_VETERANS | boolean | Same |
| `888cd309-28f6-46b0-bbc3-80e9330f7b85` | FINANCING_CASH | boolean | Same |
| `d5944d77-d968-489a-be3f-88f8b88016ec` | LISTING_ADD_SELLERS_DISCLOSURE | boolean | Preferred addendum |
| `d5763dc1-8999-4644-a23a-6c8fd4e69731` | LISTING_ADD_MINERAL_INFO | boolean | Preferred addendum |
| `c87c03a5-bf42-4449-af96-95763bdc7a2f` | TXR_2001_INVENTORY_CONDITION_DUE_DAYS | days | Lease policy preference |
| `02c5a1ff-2a57-4aa5-bd5e-540fd1a0dab4` | TXR_2001_YARD_WATERING_TIMES | text | Lease wording preference |
| `c7eabed4-ac1a-4d99-8448-03b60693bd17` | TXR_2001_YARD_MAINTAINED_BY_TENANT | boolean | Lease policy preference |
| `d96b71d9-35ef-4a5a-a2cf-22819ef889b9` | CONTRACT_BUYER_POSSESSION_AT_CLOSING | boolean | Contract possession habit |
| `ac99f38c-27f8-4858-aa3e-c68f1a94ae55` | TXR_2001_TERMINATION_NOTICE_DAYS_BEFORE_EXPIRATION | days | Lease notice preference |
| `e8be8ea5-0f47-4d7a-baa6-0bf0fdf8e69d` | TXR_2001_SECURITY_DEPOSIT_DUE_ON_EXECUTION | boolean | Lease fee timing preference |
| `c4e82ea4-c14b-404e-83e2-55ca575c7535` | TXR_2001_INITIAL_LATE_FEE_AMOUNT_CHECKED | boolean | Lease fee-structure preference |
| `c453bfe1-9afa-4a3a-ba26-42819066dd61` | TXR_2001_RETURNED_PAYMENT_FEE | money | Lease fee amount |
| `bc48623b-d1e0-46bd-9e44-7d3d796dcb91` | TXR_2001_SPECIAL_PROVISIONS | text | Personal/lease special-provisions boilerplate |
| `54b2daba-1958-42f2-a95d-dfae9fd24728` | TXR_2001_REPLACEMENT_TENANT_FEE_LANDLORD_PROCURES_PERCENT_CHECKED | boolean | Compensation-structure preference |
| `9c2f4fc1-195f-40d6-8826-2d94bc9608c3` | TXR_2001_SMOKING_NOT_PERMITTED | boolean | Lease policy preference |
| `8aa470f2-7d6e-4ef5-a537-4457e2d5bf61` | TXR_2001_UNAUTHORIZED_ANIMAL_DAILY_CHARGE | money | Lease fee amount |
| `626ce306-4ef5-427d-b0df-f79d97ade2c8` | TXR_2001_ACCESS_TRIP_CHARGE | money | Lease fee amount |
| `448d1e05-8510-48f1-a405-b2eac1863925` | TXR_2001_KEYBOX_WITHDRAWAL_FEE | money | Lease fee amount |
| `621751ca-9f68-4547-acbd-b82cbc64ab89` | TXR_2001_LIABILITY_INSURANCE_REQUIRED_YES | boolean | Lease insurance preference |
| `f1e33c27-70d9-48bc-acc0-986f61ae262b` | TXR_2001_AUTO_RENEWAL_NOTICE_OTHER_DAYS | days | Lease notice preference |
| `4cf3ac91-28b8-4558-a725-46c9288d8284` | TXR_2001_VEHICLE_LIMIT | text/number | Lease policy preference |
| `e4ca3ca2-4d5f-4e1a-838d-744899221685` | TXR_2001_RENT_DUE_FIRST_DAY | boolean | Lease rent-timing preference |
| `62af561c-0adc-466d-bda6-830d95f4c4f1` | TXR_2001_ADDITIONAL_LATE_FEE_AMOUNT_CHECKED | boolean | Lease fee-structure preference |
| `7f820e7f-11a0-4fb6-a177-fbd7c9a797fa` | TXR_2001_KEYBOX_AUTHORIZED_LAST_DAYS | days | Lease keybox preference |
| `1c46fcb4-dfd4-45a1-a6ad-644422b99664` | TXR_2001_REPLACEMENT_TENANT_FEE_LANDLORD_PROCURES_PERCENT | percent | Fee percent preference |
| `ff54fb53-ea6f-43f7-abab-495296fb57ae` | TXR_2001_FIRST_MONTH_RENT_PAYABLE_TO_LANDLORD | boolean | Lease payable-to preference |
| `bf743a7f-eb33-4570-af58-bcf9137b3af0` | TXR_2001_INITIAL_LATE_FEE_AMOUNT | money | Lease fee amount |
| `e9ae5e97-4e78-4623-93f7-0902376f8c7d` | TXR_2001_ADDITIONAL_LATE_FEE_AMOUNT | money | Lease fee amount |
| `7228e019-c849-43f9-baef-8ae0e4da6e73` | TXR_2001_MONTH_TO_MONTH_TERMINATION_LAST_DAY_NEXT_MONTH | boolean | Lease termination preference |
| `aadc7808-7fb3-4c67-be1f-fd7c37df1522` | TXR_2001_REPLACEMENT_TENANT_FEE_TENANT_PROCURES_PERCENT | percent | Fee percent preference |
| `e9a0aa75-2b32-4a27-89b9-7664d3698e92` | BUYER_REP_MARKET_AREA | text | Lee market-area wording |
| `5c0204ff-5609-4ac6-88be-d0de2a8f5c59` | TXR_2001_GUEST_CONSECUTIVE_DAY_LIMIT | days | Lease guest policy |
| `18dab366-85ef-4c6b-8fe6-411eb5f09869` | TXR_2001_LATE_FEE_DUE_DAY | text | Lease late-fee day preference |
| `03337afc-c3b0-4228-9227-978920a8816d` | TXR_2001_AUTO_RENEWAL_NOTICE_OTHER_DAYS_CHECKED | boolean | Lease notice-structure preference |
| `9c8ac69d-34b1-4ff8-8c57-0c7f59878d4c` | TXR_2001_UNAUTHORIZED_ANIMAL_INITIAL_CHARGE | money | Lease fee amount |
| `509e6201-ce4e-446a-a055-af43001fc151` | TXR_2001_REPLACEMENT_TENANT_FEE_TENANT_PROCURES_PERCENT_CHECKED | boolean | Fee-structure preference |

### → ORGANIZATION (Davey Goosmann) — `b788f525-53f4-42ed-b5a1-cb741398a974`

| field_id | field_key | value category | rationale |
|---|---|---|---|
| `1c7ef2a8-0842-4a84-80ac-4e69a8ec2437` | SCHEDULING_COMPANY | text | Showing/scheduling vendor name — brokerage operational default |
| `72cdf8b6-cbe1-43d1-8c6e-c427bff8741d` | LEASE_SCHEDULING_COMPANY | text | Same vendor on lease listing path — brokerage operational |
| `2f3851c6-8cdc-40cc-95de-8c49f06bbe78` | TXR_2001_LANDLORD_BROKER_WILL_NOT_MANAGE | boolean | Brokerage management stance (broker will not manage) |
| `148ed8d3-a666-46ad-9cfc-5e4525b989f3` | TXR_2001_MANAGED_BY_LANDLORD | boolean | Complements broker-will-not-manage — firm lease/management policy |

### Clear from Global — PACKET-SPECIFIC (do not migrate as catalog default)

| field_id | field_key | value category | rationale |
|---|---|---|---|
| `b0548c8b-c4f7-44f9-8328-9c14899e09e7` | SELLER_IS_NOT_FOREIGN_PERSON | boolean | Seller FIRPTA fact is packet/deal-specific; must not be a catalog default |

### UNKNOWN — human review before migrate

| field_id | field_key | value category | why unknown |
|---|---|---|---|
| `71cc5bb4-8b16-4e6d-861a-a925a650da91` | CONTRACT_PROPERTY_AS_IS | boolean | Extremely common TREC habit vs true preference — decide PRIVATE vs STRUCTURAL |
| `e39569b9-d5e3-4e8d-a391-09bdf02d2aad` | BUYER_REP_RETAINER_AMOUNT | money | Literal `0` could be STRUCTURAL empty or PRIVATE zero-retainer policy |
| `b4cfd37f-98ec-4b44-95e5-a47ffce8dc9d` | CONTRACT_SERVICE_CONTRACT_REIMBURSEMENT_AMOUNT | money | Same ambiguity for money `0` placeholder vs private policy |

*(If review keeps money-zeros as structural, leave on Global; if they encode Lee’s “always zero” policy, migrate PRIVATE.)*

---

## 3. Field defaults — full classification (redacted)

Legend: **scope proposed** = PRIVATE | ORGANIZATION | PACKET-SPECIFIC | STRUCTURAL CONSTANT | UNKNOWN

### PRIVATE

| field_key | value category | proposed scope | short rationale |
|---|---|---|---|
| CONTRACT_WATER_DISCLOSURE_NOT_REQUIRED | boolean | PRIVATE | Practice default checkbox |
| ALLOW_INTERMEDIARY | boolean | PRIVATE | Intermediary preference |
| BUYER_REP_ADD_GENERAL_INFORMATION_NOTICE | boolean | PRIVATE | Preferred addendum |
| BUYER_REP_ADD_WIRE_FRAUD | boolean | PRIVATE | Preferred addendum |
| PAYMENT_COUNTY | text | PRIVATE | County preference |
| ADD_IABS | boolean | PRIVATE | Preferred addendum |
| PROTECTION_PERIOD_DAYS | days | PRIVATE | Protection period |
| BUYER_REP_INTERMEDIARY_STATUS_YES | boolean | PRIVATE | Intermediary preference |
| BUYER_REP_ADD_HOME_INSPECTION | boolean | PRIVATE | Preferred addendum |
| ASSOCIATE_SIGNATURE_BOX | boolean | PRIVATE | Associate signature habit |
| MLS_FILE_LISTING | boolean | PRIVATE | MLS filing preference |
| LISTING_COMPENSATION_MODEL_WITH_COOP | boolean | PRIVATE | Compensation model |
| MLS_FILE_IMMEDIATELY | boolean | PRIVATE | MLS timing |
| KEYBOX_AUTHORIZED_YES | boolean | PRIVATE | Keybox preference |
| LISTING_INTERMEDIARY_YES | boolean | PRIVATE | Intermediary preference |
| FINANCING_CONVENTIONAL | boolean | PRIVATE | Financing acceptance set |
| FINANCING_FHA | boolean | PRIVATE | Financing acceptance set |
| FINANCING_VA | boolean | PRIVATE | Financing acceptance set |
| FINANCING_TEXAS_VETERANS | boolean | PRIVATE | Financing acceptance set |
| FINANCING_CASH | boolean | PRIVATE | Financing acceptance set |
| LISTING_ADD_SELLERS_DISCLOSURE | boolean | PRIVATE | Preferred addendum |
| LISTING_ADD_MINERAL_INFO | boolean | PRIVATE | Preferred addendum |
| TXR_2001_INVENTORY_CONDITION_DUE_DAYS | days | PRIVATE | Lease days policy |
| TXR_2001_YARD_WATERING_TIMES | text | PRIVATE | Lease wording |
| TXR_2001_YARD_MAINTAINED_BY_TENANT | boolean | PRIVATE | Lease yard policy |
| CONTRACT_BUYER_POSSESSION_AT_CLOSING | boolean | PRIVATE | Possession habit |
| TXR_2001_TERMINATION_NOTICE_DAYS_BEFORE_EXPIRATION | days | PRIVATE | Notice days |
| TXR_2001_SECURITY_DEPOSIT_DUE_ON_EXECUTION | boolean | PRIVATE | Deposit timing |
| TXR_2001_INITIAL_LATE_FEE_AMOUNT_CHECKED | boolean | PRIVATE | Fee structure |
| TXR_2001_RETURNED_PAYMENT_FEE | money | PRIVATE | Fee amount |
| TXR_2001_SPECIAL_PROVISIONS | text | PRIVATE | Boilerplate special provisions |
| TXR_2001_REPLACEMENT_TENANT_FEE_LANDLORD_PROCURES_PERCENT_CHECKED | boolean | PRIVATE | Fee structure |
| TXR_2001_SMOKING_NOT_PERMITTED | boolean | PRIVATE | Smoking policy |
| TXR_2001_UNAUTHORIZED_ANIMAL_DAILY_CHARGE | money | PRIVATE | Fee amount |
| TXR_2001_ACCESS_TRIP_CHARGE | money | PRIVATE | Fee amount |
| TXR_2001_KEYBOX_WITHDRAWAL_FEE | money | PRIVATE | Fee amount |
| TXR_2001_LIABILITY_INSURANCE_REQUIRED_YES | boolean | PRIVATE | Insurance requirement |
| TXR_2001_AUTO_RENEWAL_NOTICE_OTHER_DAYS | days | PRIVATE | Notice days |
| TXR_2001_VEHICLE_LIMIT | number | PRIVATE | Vehicle limit |
| TXR_2001_RENT_DUE_FIRST_DAY | boolean | PRIVATE | Rent due day |
| TXR_2001_ADDITIONAL_LATE_FEE_AMOUNT_CHECKED | boolean | PRIVATE | Fee structure |
| TXR_2001_KEYBOX_AUTHORIZED_LAST_DAYS | days | PRIVATE | Keybox window |
| TXR_2001_REPLACEMENT_TENANT_FEE_LANDLORD_PROCURES_PERCENT | percent | PRIVATE | Fee percent |
| TXR_2001_FIRST_MONTH_RENT_PAYABLE_TO_LANDLORD | boolean | PRIVATE | Payable-to choice |
| TXR_2001_INITIAL_LATE_FEE_AMOUNT | money | PRIVATE | Fee amount |
| TXR_2001_ADDITIONAL_LATE_FEE_AMOUNT | money | PRIVATE | Fee amount |
| TXR_2001_MONTH_TO_MONTH_TERMINATION_LAST_DAY_NEXT_MONTH | boolean | PRIVATE | Termination rule |
| TXR_2001_REPLACEMENT_TENANT_FEE_TENANT_PROCURES_PERCENT | percent | PRIVATE | Fee percent |
| BUYER_REP_MARKET_AREA | text | PRIVATE | Market area |
| TXR_2001_GUEST_CONSECUTIVE_DAY_LIMIT | days | PRIVATE | Guest days |
| TXR_2001_LATE_FEE_DUE_DAY | text | PRIVATE | Late-fee day |
| TXR_2001_AUTO_RENEWAL_NOTICE_OTHER_DAYS_CHECKED | boolean | PRIVATE | Notice structure |
| TXR_2001_UNAUTHORIZED_ANIMAL_INITIAL_CHARGE | money | PRIVATE | Fee amount |
| TXR_2001_REPLACEMENT_TENANT_FEE_TENANT_PROCURES_PERCENT_CHECKED | boolean | PRIVATE | Fee structure |

### ORGANIZATION

| field_key | value category | proposed scope | short rationale |
|---|---|---|---|
| SCHEDULING_COMPANY | text | ORGANIZATION | Brokerage scheduling vendor |
| LEASE_SCHEDULING_COMPANY | text | ORGANIZATION | Same vendor, lease path |
| TXR_2001_LANDLORD_BROKER_WILL_NOT_MANAGE | boolean | ORGANIZATION | Firm will-not-manage stance |
| TXR_2001_MANAGED_BY_LANDLORD | boolean | ORGANIZATION | Firm landlord-management stance |

### PACKET-SPECIFIC

| field_key | value category | proposed scope | short rationale |
|---|---|---|---|
| SELLER_IS_NOT_FOREIGN_PERSON | boolean | PACKET-SPECIFIC | Deal fact about seller — clear Global, do not catalog-default |

### STRUCTURAL CONSTANT (OK to keep on Global after cleaning preferences)

| field_key | value category | proposed scope | short rationale |
|---|---|---|---|
| BUYER_REP_OTHER_COMPENSATION | text | STRUCTURAL CONSTANT | Universal NA placeholder |
| SPECIAL_PROVISIONS | text | STRUCTURAL CONSTANT | Universal NA placeholder |
| BUYER_REP_EMPLOYER_RELOCATION | text | STRUCTURAL CONSTANT | Universal NA placeholder |
| LISTING_EXCLUSIONS | text | STRUCTURAL CONSTANT | Universal NA placeholder |
| OTHER_FEES_REIMBURSABLE_EXPENSES | text | STRUCTURAL CONSTANT | Universal NA placeholder |
| TXR_2001_MOVE_IN_LANDLORD_CONDITIONS | text | STRUCTURAL CONSTANT | Universal NA placeholder |
| KNOWN_FINANCIAL_OBLIGATIONS_EXCEPTION | text | STRUCTURAL CONSTANT | Universal NA placeholder |
| KNOWN_LIENS_EXCEPTION | text | STRUCTURAL CONSTANT | Universal NA placeholder |
| EMPLOYER_RELOCATION_COMPANY | text | STRUCTURAL CONSTANT | Universal NA placeholder |
| KNOWN_DISTRICTS | text | STRUCTURAL CONSTANT | Universal NA placeholder |
| CONTRACT_SPECIAL_PROVISIONS | text | STRUCTURAL CONSTANT | Universal NA placeholder |
| CONTRACT_BROKER_DISCLOSURE_TEXT | text | STRUCTURAL CONSTANT | Universal NA placeholder |
| TXR_2001_UTILITIES_LANDLORD_PAYS | text | STRUCTURAL CONSTANT | Universal NA placeholder |
| TXR_2001_TENANT_SPECIFIC_REPAIR_ITEMS | text | STRUCTURAL CONSTANT | Universal NA placeholder |
| BUYER_REP_CONSTRUCTION_COMPENSATION | text | STRUCTURAL CONSTANT | Universal NA placeholder |
| CONTRACT_PROPERTY_EXCLUSIONS | text | STRUCTURAL CONSTANT | NA placeholder (notes say packet-specific field; empty NA stays structural) |
| CONTRACT_SELLER_EXPENSE_CONTRIBUTION_AMOUNT | money | STRUCTURAL CONSTANT | Zero empty-amount placeholder |
| 1_CONVENTIONAL_FINANCING | boolean | STRUCTURAL CONSTANT | INACTIVE AcroForm Off default |
| A_A_FIRST_MORTGAGE_LOAN_IN_THE_PRINCIPAL_AMOUNT_OF | boolean | STRUCTURAL CONSTANT | INACTIVE AcroForm Off |
| B_A_SECOND_MORTGAGE_LOAN_IN_THE_PRINCIPAL_AMOUNT_OF | boolean | STRUCTURAL CONSTANT | INACTIVE AcroForm Off |
| 2_TEXAS_VETERANS_LOAN_A_LOANS_FROM_THE_TEXAS_VETERANS_LAND_BOARD_OF | boolean | STRUCTURAL CONSTANT | INACTIVE AcroForm Off |
| 3_FHA_INSURED_FINANCING_A_SECTION | boolean | STRUCTURAL CONSTANT | INACTIVE AcroForm Off |
| 6_REVERSE_MORTGAGE_FINANCING_A_REVERSE_MORTGAGE_LOAN_ALSO_KNOWN_AS_A_HOME_EQUITY | boolean | STRUCTURAL CONSTANT | INACTIVE AcroForm Off |
| 4_VA_GUARANTEED_FINANCING_A_VA_GUARANTEED_LOAN_OF_NOT_LESS_THAN | boolean | STRUCTURAL CONSTANT | INACTIVE AcroForm Off |
| 5_USDA_GUARANTEED_FINANCING_A_USDAGUARANTEED_LOAN_OF_NOT_LESS_THAN | boolean | STRUCTURAL CONSTANT | INACTIVE AcroForm Off |
| WILL_NOT_BE_AN_FHA_INSURED_LOAN | boolean | STRUCTURAL CONSTANT | INACTIVE AcroForm Off |
| WILL | boolean | STRUCTURAL CONSTANT | INACTIVE AcroForm Off |
| 6_REVERSE_MORTGAGE_FINANCING_…_HOME_EQUITY-1 | boolean | STRUCTURAL CONSTANT | INACTIVE AcroForm Off |
| WILL-1 | boolean | STRUCTURAL CONSTANT | INACTIVE AcroForm Off |
| WILL-2 | boolean | STRUCTURAL CONSTANT | INACTIVE AcroForm Off |
| CHECK_BOX2 | boolean | STRUCTURAL CONSTANT | INACTIVE AcroForm Off |
| THIS_CONTRACT_IS_SUBJECT_TO_BUYER_OBTAINING_BUYER_APPROVAL_… | boolean | STRUCTURAL CONSTANT | INACTIVE AcroForm Off |

### UNKNOWN

| field_key | value category | proposed scope | short rationale |
|---|---|---|---|
| CONTRACT_PROPERTY_AS_IS | boolean | UNKNOWN | Common TREC habit vs preference |
| BUYER_REP_RETAINER_AMOUNT | money | UNKNOWN | `0` structural vs policy |
| CONTRACT_SERVICE_CONTRACT_REIMBURSEMENT_AMOUNT | money | UNKNOWN | `0` structural vs policy |

---

## 4. Mapping overrides — classification

All 30 overrides are on **TXR-1901** (Third Party Financing Addendum), Global form, `default_value_override` = Off (unchecked).

### Duplicate / supersession note

- **15 DELETED** mappings are historical duplicates of the same PDF checkbox Off behavior.
- **15 ACTIVE** mappings point at dedicated `txr_1901_*` GLOBAL fields (correct form-local keys).
- Several **DELETED** mappings wrongly pointed at unrelated Global fields (`buyer_rep_retainer_will_not_apply`, `contract_buyer_names`) or had `field_id: null` — treat as junk; do not migrate overrides as private/org preferences.
- Parallel **INACTIVE** field rows in Section A (same AcroForm keys with `default_value: Off`) **duplicate** the ACTIVE mapping Off defaults. Prefer one place: either field default **or** mapping override — keep ACTIVE `txr_1901_*` mapping Offs; clean INACTIVE field defaults / DELETED mappings.

### ACTIVE overrides → STRUCTURAL CONSTANT (may remain as Global mapping Off)

| mapping_id | field_key (mapped) | value category | proposed scope | rationale |
|---|---|---|---|---|
| `cd300d27-d533-4e8e-aabf-5cd69b40c102` | txr_1901_check_box2 | boolean | STRUCTURAL CONSTANT | PDF Off = unchecked; form behavior |
| `3740989c-e773-49ff-b60e-aaae70e49501` | txr_1901_this_contract_is_subject_to_buyer_obtaining_buyer_approval_if_buyer_cannot_obtain_buyer | boolean | STRUCTURAL CONSTANT | Financing addendum Off default |
| `33f7f51f-1066-4c69-87ed-0849d268b264` | txr_1901_1_conventional_financing | boolean | STRUCTURAL CONSTANT | Off until chosen by packet |
| `5fbfa5e3-b777-4d44-b8fe-a97c326d3b56` | txr_1901_a_a_first_mortgage_loan_in_the_principal_amount_of | boolean | STRUCTURAL CONSTANT | Off until chosen |
| `f18ac78d-fce2-43cc-8614-c9ae77f9574d` | txr_1901_b_a_second_mortgage_loan_in_the_principal_amount_of | boolean | STRUCTURAL CONSTANT | Off until chosen |
| `b2edd94f-57e5-4109-b5ec-048d0a26da82` | txr_1901_2_texas_veterans_loan_a_loans_from_the_texas_veterans_land_board_of | boolean | STRUCTURAL CONSTANT | Off until chosen |
| `cc4181d0-7966-4e32-9405-918c5b06674b` | txr_1901_3_fha_insured_financing_a_section | boolean | STRUCTURAL CONSTANT | Off until chosen |
| `f4913a37-e772-440e-b46a-0189ea0ca9b2` | txr_1901_6_reverse_mortgage_financing_a_reverse_mortgage_loan_also_known_as_a_home_equity | boolean | STRUCTURAL CONSTANT | Off until chosen |
| `61fa5aa9-9b0b-46a5-abe1-02b457ad8e6a` | txr_1901_4_va_guaranteed_financing_a_va_guaranteed_loan_of_not_less_than | boolean | STRUCTURAL CONSTANT | Off until chosen |
| `103e8671-0637-4267-98d5-0ef43fe69c10` | txr_1901_5_usda_guaranteed_financing_a_usdaguaranteed_loan_of_not_less_than | boolean | STRUCTURAL CONSTANT | Off until chosen |
| `9531ae54-bbc7-4286-aad9-29c8274a01d7` | txr_1901_will_not_be_an_fha_insured_loan | boolean | STRUCTURAL CONSTANT | Off until chosen |
| `ccb0a129-382e-42fc-ac9c-7e522b7870ee` | txr_1901_will | boolean | STRUCTURAL CONSTANT | Off until chosen |
| `8b1a49aa-d757-4315-8928-928b0fc1cd4c` | txr_1901_6_reverse_mortgage_financing_a_reverse_mortgage_loan_also_known_as_a_home_equity_1 | boolean | STRUCTURAL CONSTANT | Off until chosen |
| `e93c949f-ce87-41b0-a3da-5cd8763726ff` | txr_1901_will_1 | boolean | STRUCTURAL CONSTANT | Off until chosen |
| `049fd68b-7600-4ac5-8b30-5b14eceea4b3` | txr_1901_will_2 | boolean | STRUCTURAL CONSTANT | Off until chosen |

### DELETED overrides → STRUCTURAL CONSTANT (cleanup only; do not migrate)

Safe to ignore for preference migration (historical Off duplicates / orphan mappings):

| mapping_id | mapping_name | field_key | note |
|---|---|---|---|
| `e6c4abc5-535e-4377-9ce8-1a1a5d6e39a4` | 1 Conventional Financing | 1_CONVENTIONAL_FINANCING | Dup of ACTIVE txr_1901 + INACTIVE field default |
| `067cca7e-0a12-44ea-89d0-cdc7656a2ddc` | A A First Mortgage… | THIRD_PARTY_FINANCING_FIRST_LOAN_PRINCIPAL | Historical Off |
| `1ddaa085-2032-4a8d-9f8f-a6b008743ded` | Check Box2 | *(null)* | Orphan mapping |
| `19c6f99d-a463-4e5c-8aaf-e08ecd10740e` | 2 Texas Veterans… | *(null)* | Orphan |
| `bbb487c4-3651-4275-a085-608336736480` | 3 Fha Insured… | *(null)* | Orphan |
| `311199ef-447f-4967-a262-ae92a4cf8ab3` | 5 Usda… | *(null)* | Orphan |
| `c92fca85-b1c4-4418-b324-d78b9cd8d16b` | 6 Reverse Mortgage… | *(null)* | Orphan |
| `f42704a7-9b50-4cae-91d7-ef4a764834d2` | 4 Va Guaranteed… | *(null)* | Orphan |
| `1dcd8a3a-55a0-4eec-be29-fff4a3c27845` | B A Second Mortgage… | THIRD_PARTY_FINANCING_SECOND_LOAN_PRINCIPAL | Historical Off |
| `d22e8377-a6a5-4f80-8913-a848f97bf75f` | Will Not Be An Fha… | *(null)* | Orphan |
| `6016f7b5-7634-48a1-b3da-c5e9e1d77b39` | 6 Reverse Mortgage…-1 | *(null)* | Orphan |

### DELETED overrides → UNKNOWN (miswired — human review / delete, do not migrate as preferences)

| mapping_id | mapping_name | linked field_key | proposed scope | rationale |
|---|---|---|---|---|
| `f75ae186-2f47-444a-9147-c5afdad753c0` | Will-1 | buyer_rep_retainer_will_not_apply | UNKNOWN | Wrong field link for TXR-1901 PDF |
| `30fa24bf-5724-45fc-8f16-cb11f81464f3` | Will-2 | buyer_rep_retainer_will_not_apply | UNKNOWN | Same miswire |
| `3c75ea95-2195-4846-be73-4681e1bf4ab7` | Will | buyer_rep_retainer_will_not_apply | UNKNOWN | Same miswire |
| `32e4101c-e9ed-4406-aa41-59a9bb077e0a` | This Contract Is Subject To Buyer Obtaining… | contract_buyer_names | UNKNOWN | Wrong field (buyer names ≠ financing checkbox) |

---

## 5. What stays structural on Global vs what must be cleared

### Stays OK on Global fields / mappings (STRUCTURAL CONSTANT)

**Keep (or restore after preference strip) on Global fields:**

- All universal **NA** placeholder text defaults listed above.
- **Zero** money empties only if human review confirms STRUCTURAL (seller expense contribution already treated as structural; retainer / service-contract reimbursement pending UNKNOWN).
- **15 INACTIVE AcroForm Off** fields: prefer **delete/inactive cleanup** rather than keeping as live catalog defaults — ACTIVE TXR-1901 mapping Offs already cover the live form.

**Keep on Global mappings:**

- All **15 ACTIVE** TXR-1901 `default_value_override = Off` entries — these are unchecked promulgated financing checkboxes, not Lee/org preferences.

### Must be cleared from Global fields

1. **All 54 PRIVATE** field defaults (incl. INACTIVE `ALLOW_INTERMEDIARY`) → move to Lee private defaults.  
2. **All 4 ORGANIZATION** field defaults → move to Davey org defaults.  
3. **SELLER_IS_NOT_FOREIGN_PERSON** → clear entirely (packet-specific).  
4. **UNKNOWN trio** → clear from Global pending decision (do not leave preference ambiguity on Global).  
5. **INACTIVE duplicate Off field defaults** (15) → clear/archive as clutter once ACTIVE mapping Offs are confirmed; they are not PRIVATE/ORG but should not remain as competing Global defaults.

### Must be cleared / not migrated from Global mappings

1. **15 DELETED** historical Off overrides — no preference migration; optional hard-delete for hygiene.  
2. **4 miswired DELETED** mappings → delete only; never recreate as Lee/org defaults.

### No agent contact PII in this inventory

Section A/B contain **no** agent phone/email/license/street address literals. Verify block (`C_verify`) has profile email — out of scope for field-default migration. Form 22 (deleted condo addendum) has **no** override mappings and one linked field without defaults.

---

## Sensitive values for migration script

Needed for data move only: `field_id` + proposed destination + value kind. Literal values are non-PII in this inventory (no phones/emails/licenses/addresses). Script should read current DB/inventory for exact literals.

### → PRIVATE Lee (`e26c8f57-c0aa-4474-b43e-6e15f0260e99`)

```
a528c4e3-d980-42f8-9b90-789d746f6145  PRIVATE  default_checked
947bb7a8-4cbe-46c0-bc0f-fc6e8a31366e  PRIVATE  default_checked
36daae3b-ffb0-4be0-ab63-ec17c2f5d006  PRIVATE  default_checked
7ca1c044-59f3-4fbe-9ff6-d2509cd61313  PRIVATE  default_checked
31b47d47-9fa6-454e-874e-a1a36ef2c1c0  PRIVATE  default_value
09a715cb-7a37-4692-bba8-f8d2316074f0  PRIVATE  default_checked
5ed7cc9f-622f-4c91-b5b7-5b8aa0e0585c  PRIVATE  default_value
dba66736-1ec2-41e0-8be2-5566cd7e6507  PRIVATE  default_checked
d7cd8260-f5af-42b8-89cf-2d0da3399648  PRIVATE  default_checked
36a310d2-d5b4-43ea-be8c-19e25d5ae1bd  PRIVATE  default_checked
c212f8d3-fe1f-49cb-b50d-7ca25d285c54  PRIVATE  default_checked
6b65f1b8-8760-4b12-91e1-29f5fc4ea468  PRIVATE  default_checked
b1fe245b-392a-4602-972e-00a3e1c375de  PRIVATE  default_checked
4c8b9d81-896a-4516-8236-28266ff077a8  PRIVATE  default_checked
4cb5280f-65e4-4419-8c02-aab5f283ce2a  PRIVATE  default_checked
3311c96c-eb8f-42c7-989a-9de1bb97c6ad  PRIVATE  default_checked
9db19ac1-eabb-4826-9757-6c9efa83b45f  PRIVATE  default_checked
966f8d2d-932a-4d8a-9a94-370550690cda  PRIVATE  default_checked
860c8696-5631-4e3e-a690-2a823795c173  PRIVATE  default_checked
888cd309-28f6-46b0-bbc3-80e9330f7b85  PRIVATE  default_checked
d5944d77-d968-489a-be3f-88f8b88016ec  PRIVATE  default_checked
d5763dc1-8999-4644-a23a-6c8fd4e69731  PRIVATE  default_checked
c87c03a5-bf42-4449-af96-95763bdc7a2f  PRIVATE  default_value
02c5a1ff-2a57-4aa5-bd5e-540fd1a0dab4  PRIVATE  default_value
c7eabed4-ac1a-4d99-8448-03b60693bd17  PRIVATE  default_checked
d96b71d9-35ef-4a5a-a2cf-22819ef889b9  PRIVATE  default_checked
ac99f38c-27f8-4858-aa3e-c68f1a94ae55  PRIVATE  default_value
e8be8ea5-0f47-4d7a-baa6-0bf0fdf8e69d  PRIVATE  default_checked
c4e82ea4-c14b-404e-83e2-55ca575c7535  PRIVATE  default_checked
c453bfe1-9afa-4a3a-ba26-42819066dd61  PRIVATE  default_value
bc48623b-d1e0-46bd-9e44-7d3d796dcb91  PRIVATE  default_value
54b2daba-1958-42f2-a95d-dfae9fd24728  PRIVATE  default_checked
9c2f4fc1-195f-40d6-8826-2d94bc9608c3  PRIVATE  default_checked
8aa470f2-7d6e-4ef5-a537-4457e2d5bf61  PRIVATE  default_value
626ce306-4ef5-427d-b0df-f79d97ade2c8  PRIVATE  default_value
448d1e05-8510-48f1-a405-b2eac1863925  PRIVATE  default_value
621751ca-9f68-4547-acbd-b82cbc64ab89  PRIVATE  default_checked
f1e33c27-70d9-48bc-acc0-986f61ae262b  PRIVATE  default_value
4cf3ac91-28b8-4558-a725-46c9288d8284  PRIVATE  default_value
e4ca3ca2-4d5f-4e1a-838d-744899221685  PRIVATE  default_checked
62af561c-0adc-466d-bda6-830d95f4c4f1  PRIVATE  default_checked
7f820e7f-11a0-4fb6-a177-fbd7c9a797fa  PRIVATE  default_value
1c46fcb4-dfd4-45a1-a6ad-644422b99664  PRIVATE  default_value
ff54fb53-ea6f-43f7-abab-495296fb57ae  PRIVATE  default_checked
bf743a7f-eb33-4570-af58-bcf9137b3af0  PRIVATE  default_value
e9ae5e97-4e78-4623-93f7-0902376f8c7d  PRIVATE  default_value
7228e019-c849-43f9-baef-8ae0e4da6e73  PRIVATE  default_checked
aadc7808-7fb3-4c67-be1f-fd7c37df1522  PRIVATE  default_value
e9a0aa75-2b32-4a27-89b9-7664d3698e92  PRIVATE  default_value
5c0204ff-5609-4ac6-88be-d0de2a8f5c59  PRIVATE  default_value
18dab366-85ef-4c6b-8fe6-411eb5f09869  PRIVATE  default_value
03337afc-c3b0-4228-9227-978920a8816d  PRIVATE  default_checked
9c8ac69d-34b1-4ff8-8c57-0c7f59878d4c  PRIVATE  default_value
509e6201-ce4e-446a-a055-af43001fc151  PRIVATE  default_checked
```

### → ORGANIZATION Davey (`b788f525-53f4-42ed-b5a1-cb741398a974`)

```
1c7ef2a8-0842-4a84-80ac-4e69a8ec2437  ORGANIZATION  default_value
72cdf8b6-cbe1-43d1-8c6e-c427bff8741d  ORGANIZATION  default_value
2f3851c6-8cdc-40cc-95de-8c49f06bbe78  ORGANIZATION  default_checked
148ed8d3-a666-46ad-9cfc-5e4525b989f3  ORGANIZATION  default_checked
```

### Clear only (no Lee/Org recreate)

```
b0548c8b-c4f7-44f9-8328-9c14899e09e7  CLEAR  default_checked  # PACKET-SPECIFIC
71cc5bb4-8b16-4e6d-861a-a925a650da91  HOLD   default_checked  # UNKNOWN
e39569b9-d5e3-4e8d-a391-09bdf02d2aad  HOLD   default_value    # UNKNOWN
b4cfd37f-98ec-4b44-95e5-a47ffce8dc9d  HOLD   default_value    # UNKNOWN
```

### Leave structural on Global (field_ids)

```
d3455dd4-59dd-4332-9384-70d0f5e67fd5  STRUCTURAL  # BUYER_REP_OTHER_COMPENSATION NA
ef9b7bc7-b878-49f6-8e92-c294dd733089  STRUCTURAL  # SPECIAL_PROVISIONS NA
2d17023a-94ae-47f2-8b9e-c274bcbe9f68  STRUCTURAL  # BUYER_REP_EMPLOYER_RELOCATION NA
4861d3dd-ad35-4a65-827b-a6266486f7da  STRUCTURAL  # LISTING_EXCLUSIONS NA
54300c4c-ffed-4dce-9fb0-e43ec9869e6a  STRUCTURAL  # OTHER_FEES_REIMBURSABLE_EXPENSES NA
6b3e506e-33b6-448a-8da9-9279e14f4877  STRUCTURAL  # TXR_2001_MOVE_IN_LANDLORD_CONDITIONS NA
b08bb4a1-95ec-4824-92cc-36a3a0601e90  STRUCTURAL  # KNOWN_FINANCIAL_OBLIGATIONS_EXCEPTION NA
b4fa63a8-2107-4fda-b5ec-c06ba3e85884  STRUCTURAL  # KNOWN_LIENS_EXCEPTION NA
998b7869-bc45-4686-a75c-e60cd3581b78  STRUCTURAL  # EMPLOYER_RELOCATION_COMPANY NA
062cc399-475f-471e-a23e-cc4156c7a531  STRUCTURAL  # KNOWN_DISTRICTS NA
da9e14f5-6f26-4d0a-9f13-7e8097fed433  STRUCTURAL  # CONTRACT_SPECIAL_PROVISIONS NA
b00cae55-3d09-49f4-a31b-df49b481b886  STRUCTURAL  # CONTRACT_BROKER_DISCLOSURE_TEXT NA
8d7eaeae-1fbc-444d-83d7-d3606a6d11b1  STRUCTURAL  # TXR_2001_UTILITIES_LANDLORD_PAYS NA
14da27da-1f12-437d-b7d8-4e60c9af92ae  STRUCTURAL  # TXR_2001_TENANT_SPECIFIC_REPAIR_ITEMS NA
002b9939-472a-4254-8d08-37a86a0f6ef4  STRUCTURAL  # BUYER_REP_CONSTRUCTION_COMPENSATION NA
75358af0-183c-47d4-9bcb-87e8691b4e66  STRUCTURAL  # CONTRACT_PROPERTY_EXCLUSIONS NA
92b8cdbd-479b-44ea-8bfd-1a98d823429d  STRUCTURAL  # CONTRACT_SELLER_EXPENSE_CONTRIBUTION_AMOUNT 0
# + 15 INACTIVE AcroForm Off field_ids — cleanup recommended, not preference-migrate
# + 15 ACTIVE TXR-1901 mapping_ids — keep Off overrides on Global
```

---

## 6. Executive summary

- **58 preference defaults** currently sit incorrectly on Global fields (54 Lee + 4 Davey) and should move off Global.  
- **TXR-2001 lease fees/policies** dominate PRIVATE volume; **Broker Bay + broker-will-not-manage / managed-by-landlord** are the only clear ORGANIZATION set.  
- **Mapping overrides are not preference data** — they are TXR-1901 Off checkboxes; keep ACTIVE ones as structural; DELETED/miswired ones are cleanup only and often **duplicate** INACTIVE field Off defaults.  
- **No contact PII** appears among these defaults; migration risk is preference leakage across tenants, not redaction of contact data.  
- Human review needed for **as-is** and two money-**0** fields before treating them as structural forever.
