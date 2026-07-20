# Recovered STRUCTURAL + UNKNOWN + PACKET sections

Source: agent transcript `575f308f-df10-4d8b-9e0e-1f26d3b0c392` (Write + StrReplace).
Full report: `e:/dev/harbaugh-forms/_recovered_defaults_classification.md`
Inventory: `_defaults_inventory.json` generated 2026-07-15T21:52:19.340Z (JSON itself not recoverable from transcripts).
Final counts: **32 STRUCTURAL** (17 ACTIVE + 15 INACTIVE), **3 UNKNOWN**, **1 PACKET**.

## 1. ACTIVE STRUCTURAL (17)

| field_id | field_key | value |
|---|---|---|
| `d3455dd4-59dd-4332-9384-70d0f5e67fd5` | `BUYER_REP_OTHER_COMPENSATION` | `NA` |
| `ef9b7bc7-b878-49f6-8e92-c294dd733089` | `SPECIAL_PROVISIONS` | `NA` |
| `2d17023a-94ae-47f2-8b9e-c274bcbe9f68` | `BUYER_REP_EMPLOYER_RELOCATION` | `NA` |
| `4861d3dd-ad35-4a65-827b-a6266486f7da` | `LISTING_EXCLUSIONS` | `NA` |
| `54300c4c-ffed-4dce-9fb0-e43ec9869e6a` | `OTHER_FEES_REIMBURSABLE_EXPENSES` | `NA` |
| `6b3e506e-33b6-448a-8da9-9279e14f4877` | `TXR_2001_MOVE_IN_LANDLORD_CONDITIONS` | `NA` |
| `b08bb4a1-95ec-4824-92cc-36a3a0601e90` | `KNOWN_FINANCIAL_OBLIGATIONS_EXCEPTION` | `NA` |
| `b4fa63a8-2107-4fda-b5ec-c06ba3e85884` | `KNOWN_LIENS_EXCEPTION` | `NA` |
| `998b7869-bc45-4686-a75c-e60cd3581b78` | `EMPLOYER_RELOCATION_COMPANY` | `NA` |
| `062cc399-475f-471e-a23e-cc4156c7a531` | `KNOWN_DISTRICTS` | `NA` |
| `da9e14f5-6f26-4d0a-9f13-7e8097fed433` | `CONTRACT_SPECIAL_PROVISIONS` | `NA` |
| `b00cae55-3d09-49f4-a31b-df49b481b886` | `CONTRACT_BROKER_DISCLOSURE_TEXT` | `NA` |
| `8d7eaeae-1fbc-444d-83d7-d3606a6d11b1` | `TXR_2001_UTILITIES_LANDLORD_PAYS` | `NA` |
| `14da27da-1f12-437d-b7d8-4e60c9af92ae` | `TXR_2001_TENANT_SPECIFIC_REPAIR_ITEMS` | `NA` |
| `002b9939-472a-4254-8d08-37a86a0f6ef4` | `BUYER_REP_CONSTRUCTION_COMPENSATION` | `NA` |
| `75358af0-183c-47d4-9bcb-87e8691b4e66` | `CONTRACT_PROPERTY_EXCLUSIONS` | `NA` |
| `92b8cdbd-479b-44ea-8bfd-1a98d823429d` | `CONTRACT_SELLER_EXPENSE_CONTRIBUTION_AMOUNT` | `0` |

## 2. INACTIVE STRUCTURAL (15) — AcroForm `Off` (default_value)

IDs from `20260715180000` clear list; keys from `_audit_qE_out.json`.

| field_id | field_key | value |
|---|---|---|
| `5f480d14-2e06-402e-b4df-18a6c8497fec` | `1_CONVENTIONAL_FINANCING` | `Off` |
| `a1404448-982a-459c-b271-600a440ca685` | `A_A_FIRST_MORTGAGE_LOAN_IN_THE_PRINCIPAL_AMOUNT_OF` | `Off` |
| `742fe165-51d1-47d0-93cb-628bfd0a2b88` | `B_A_SECOND_MORTGAGE_LOAN_IN_THE_PRINCIPAL_AMOUNT_OF` | `Off` |
| `b5934b51-ed28-46b9-afe5-4f946c7918bf` | `2_TEXAS_VETERANS_LOAN_A_LOANS_FROM_THE_TEXAS_VETERANS_LAND_BOARD_OF` | `Off` |
| `9420f5d9-cd4a-4580-b575-de3913e39738` | `3_FHA_INSURED_FINANCING_A_SECTION` | `Off` |
| `c0bed14f-f60a-4a02-82b1-3f1f4a0471f4` | `6_REVERSE_MORTGAGE_FINANCING_A_REVERSE_MORTGAGE_LOAN_ALSO_KNOWN_AS_A_HOME_EQUITY` | `Off` |
| `5254ad06-34c6-4649-8128-5aa99bf7f8c3` | `4_VA_GUARANTEED_FINANCING_A_VA_GUARANTEED_LOAN_OF_NOT_LESS_THAN` | `Off` |
| `ce0590d1-17ea-43dc-9520-32e12b008147` | `5_USDA_GUARANTEED_FINANCING_A_USDAGUARANTEED_LOAN_OF_NOT_LESS_THAN` | `Off` |
| `948dfe50-b56e-428e-bad9-eeeb63b23a31` | `WILL_NOT_BE_AN_FHA_INSURED_LOAN` | `Off` |
| `793b8d36-94fe-4673-b5de-a854769256bb` | `WILL` | `Off` |
| `b588ec62-0c76-4695-89b3-baa297de7d42` | `6_REVERSE_MORTGAGE_FINANCING_A_REVERSE_MORTGAGE_LOAN_ALSO_KNOWN_AS_A_HOME_EQUITY-1` | `Off` |
| `07b66176-594e-42a8-a926-9fff41a04765` | `WILL-1` | `Off` |
| `6b8ce90a-3286-4d14-a9e2-fe315a50fcbf` | `WILL-2` | `Off` |
| `ad8a3bfc-49ed-441d-b211-949a854ae1a6` | `CHECK_BOX2` | `Off` |
| `52263155-4c81-4feb-89d6-e37008165734` | `THIS_CONTRACT_IS_SUBJECT_TO_BUYER_OBTAINING_BUYER_APPROVAL_IF_BUYER_CANNOT_OBTAIN_BUYER` | `Off` |

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

## 3. UNKNOWN (3)

| field_id | field_key | value | disposition |
|---|---|---|---|
| `71cc5bb4-8b16-4e6d-861a-a925a650da91` | `CONTRACT_PROPERTY_AS_IS` | default_checked true | migrated PRIVATE w/ HUMAN_REVIEW note |
| `e39569b9-d5e3-4e8d-a391-09bdf02d2aad` | `BUYER_REP_RETAINER_AMOUNT` | `0` | left Global by 15180000; later cleared |
| `b4cfd37f-98ec-4b44-95e5-a47ffce8dc9d` | `CONTRACT_SERVICE_CONTRACT_REIMBURSEMENT_AMOUNT` | `0` | left Global by 15180000; later cleared |

### UNKNOWN — human review before migrate

| field_id | field_key | value category | why unknown |
|---|---|---|---|
| `71cc5bb4-8b16-4e6d-861a-a925a650da91` | CONTRACT_PROPERTY_AS_IS | boolean | Extremely common TREC habit vs true preference — decide PRIVATE vs STRUCTURAL |
| `e39569b9-d5e3-4e8d-a391-09bdf02d2aad` | BUYER_REP_RETAINER_AMOUNT | money | Literal `0` could be STRUCTURAL empty or PRIVATE zero-retainer policy |
| `b4cfd37f-98ec-4b44-95e5-a47ffce8dc9d` | CONTRACT_SERVICE_CONTRACT_REIMBURSEMENT_AMOUNT | money | Same ambiguity for money `0` placeholder vs private policy |

*(If review keeps money-zeros as structural, leave on Global; if they encode Lee’s “always zero” policy, migrate PRIVATE.)*

---

### UNKNOWN

| field_key | value category | proposed scope | short rationale |
|---|---|---|---|
| CONTRACT_PROPERTY_AS_IS | boolean | UNKNOWN | Common TREC habit vs preference |
| BUYER_REP_RETAINER_AMOUNT | money | UNKNOWN | `0` structural vs policy |
| CONTRACT_SERVICE_CONTRACT_REIMBURSEMENT_AMOUNT | money | UNKNOWN | `0` structural vs policy |

---

## 4. PACKET (1)

| field_id | field_key | value |
|---|---|---|
| `b0548c8b-c4f7-44f9-8328-9c14899e09e7` | `SELLER_IS_NOT_FOREIGN_PERSON` | default_checked true (clear-only) |

### Clear from Global — PACKET-SPECIFIC (do not migrate as catalog default)

| field_id | field_key | value category | rationale |
|---|---|---|---|
| `b0548c8b-c4f7-44f9-8328-9c14899e09e7` | SELLER_IS_NOT_FOREIGN_PERSON | boolean | Seller FIRPTA fact is packet/deal-specific; must not be a catalog default |

### PACKET-SPECIFIC

| field_key | value category | proposed scope | short rationale |
|---|---|---|---|
| SELLER_IS_NOT_FOREIGN_PERSON | boolean | PACKET-SPECIFIC | Deal fact about seller — clear Global, do not catalog-default |

## 5. Other Global defaults mentioned that were not preference-migrated

- **17 ACTIVE STRUCTURAL** NA/0 — left on Global by `20260715180000`, later cleared by `20260717180000`
- **2 money-zero UNKNOWN** retainers — left on Global by 15180000, cleared by `20260717120000` (not PRIVATE/ORG migrate)
- **15 INACTIVE AcroForm Off** — cleared by 15180000 as clutter (not preference-migrated)
- **PACKET** `SELLER_IS_NOT_FOREIGN_PERSON` — clear-only
- **15 ACTIVE TXR-1901 mapping Off overrides** — retained as structural mappings (not `fields` defaults)

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
