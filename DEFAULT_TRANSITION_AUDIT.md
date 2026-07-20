# Default Transition Audit

**Branch:** `defaults-management-ui`  
**Database:** `harbaugh-forms-dev`  
**Audit date:** 2026-07-20  
**Status:** Lee review completed. **19** Lee Personal form-specific ACTIVE defaults created. Disputed Listing fields left unrestored. Do not merge.

**Starting HEAD (pre-doc commit):** `516e6a88f4b757918d2a33c61d57fcb78e8feda2`

---

## Lee Review Checklist — decisions recorded

### Group 1 — Proven manual-only omissions

- [x] `CONTRACT_PROPERTY_EXCLUSIONS` — One to Four `#11` p.1
  - **Decision: Approved** — Lee Personal form-specific `NA`
  - **Created:** yes (`default_value` text `"NA"`)

- [x] `TXR_2001_MOVE_IN_LANDLORD_CONDITIONS` — Residential Lease `#18` p.7
  - **Decision: Approved** — Lee Personal form-specific `NA`
  - **Created:** yes

- [x] `TXR_2001_UTILITIES_LANDLORD_PAYS` — Residential Lease `#18` p.5
  - **Decision: Approved** — Lee Personal form-specific `NA`
  - **Created:** yes

- [x] `TXR_2001_TENANT_SPECIFIC_REPAIR_ITEMS` — Residential Lease `#18` p.10
  - **Decision: Approved** — Lee Personal form-specific `NA`
  - **Created:** yes

### Group 2 — Mapped fields / Personal fallback

- [x] `BUYER_REP_OTHER_COMPENSATION` — Buyer Rep `#1` p.3 → **Approved** Personal form-specific `"0"` (text). **Created:** yes
- [x] `BUYER_REP_CONSTRUCTION_COMPENSATION` — Buyer Rep `#1` p.2 → **Approved** Personal form-specific `"0"` (text). **Created:** yes
- [x] `BUYER_REP_EMPLOYER_RELOCATION` — Buyer Rep `#1` p.3 → **Approved** Personal form-specific `"NA"`. **Created:** yes
- [x] `LISTING_EXCLUSIONS` — Listing `#7` p.1 → **Approved** Personal form-specific `"NA"`. **Created:** yes
- [ ] `OTHER_FEES_REIMBURSABLE_EXPENSES` — Listing `#7` p.3 → **Not approved for restoration**
  - Lee: field does **not** appear on the Listing Agreement
  - **Created:** no
  - See [Disputed Listing fields](#disputed-listing-fields)
- [x] `KNOWN_FINANCIAL_OBLIGATIONS_EXCEPTION` — Listing `#7` p.8 → **Approved** Personal form-specific `"NA"`. **Created:** yes
- [x] `KNOWN_LIENS_EXCEPTION` — Listing `#7` p.8 → **Approved** Personal form-specific `"NA"`. **Created:** yes
- [x] `EMPLOYER_RELOCATION_COMPANY` — Listing `#7` p.8 → **Approved** Personal form-specific `"NA"`. **Created:** yes
- [ ] `KNOWN_DISTRICTS` — Listing `#7` p.8 → **Not approved for restoration**
  - Lee: field does **not** appear on the Listing Agreement
  - **Created:** no
  - See [Disputed Listing fields](#disputed-listing-fields)
- [x] `CONTRACT_BROKER_DISCLOSURE_TEXT` — One to Four `#11` p.6 → **Approved** Personal form-specific `"NA"`. **Created:** yes
- [x] `CONTRACT_SPECIAL_PROVISIONS` — One to Four `#11` p.6 → **Approved** Personal form-specific `"NA"`. **Created:** yes
- [x] `SPECIAL_PROVISIONS` — Buyer Rep `#1` p.5 **and** Listing `#7` p.9 → **Approved** separate form-specific `"NA"` rows. **Created:** yes (2 rows)

### Group 3 — Numeric zeros

- [x] `BUYER_REP_RETAINER_AMOUNT` — Buyer Rep `#1` p.2 → **Approved** Personal form-specific `"0"` (currency). **Created:** yes
- [x] `CONTRACT_SERVICE_CONTRACT_REIMBURSEMENT_AMOUNT` — One to Four `#11` p.5 → **Approved** Personal form-specific `"0"` (currency). **Created:** yes
- [x] `CONTRACT_SELLER_EXPENSE_CONTRIBUTION_AMOUNT` — One to Four `#11` p.6 → **Approved** Personal form-specific `"0"` (currency). **Created:** yes

### Group 4 — Structured-data (not a catalog omission)

- [x] `contract_title_objection_use_activity` — One to Four `#11` p.3
  - **Decision: Approved** — Lee explicitly chose Personal form-specific `"NA"` fallback even though this was **not** a proven catalog-default omission (column default / mapped `contract_details` path)
  - **Created:** yes

### Group 5 — Intentionally removed

- 15 INACTIVE AcroForm `Off` fields — no restoration
- No Global catalog preference literals created

---

## Restoration summary

| Metric | Result |
|---|---|
| Approved defaults created | **19** Lee Private ACTIVE form-specific |
| Scope | `PRIVATE`, owner Lee, `form_id` set, `form_field_mapping_id` null |
| Disputed left unrestored | **2** (`OTHER_FEES_REIMBURSABLE_EXPENSES`, `KNOWN_DISTRICTS`) |
| Global catalog literals | unchanged (null) |
| Lee legacy all-forms Private | **56** ACTIVE unchanged |
| Organization ACTIVE defaults | **4** unchanged |
| Mappings / packets | unchanged (except new preference rows) |
| All-forms new defaults | **0** |

Creation path: Forms → Map Fields → Edit default → Save Personal default (Lee session), except one accidental collateral row cleared afterward (see below).

### Persisted representations

| Kind | Stored shape |
|---|---|
| Text `NA` | `default_value = "NA"`, `default_checked = null` |
| Text `"0"` (compensation) | `default_value = "0"`, `default_checked = null` |
| Currency zero | `default_value = "0"`, `default_checked = null` (not blank; not `default_checked`) |

### Collateral during automation

An unintended form-scoped Private `buyer_client_name_1` / form `#1` / `NA` was created during a failed CDP pass, then soft-deleted (`status=DELETED`) using `clearPrivateFormDefault` semantics. Admin Map Fields currently has **no Clear** control (Clear exists on non-admin My setup only) — noted as a product gap, not fixed in this task. Legacy 56 and the 19 approved rows were verified intact after cleanup.

---

## Disputed Listing fields

Lee stated these do **not** appear on current TXR-1101. Restoration remains **unapproved**. No defaults created.

### `OTHER_FEES_REIMBURSABLE_EXPENSES`

| Question | Finding |
|---|---|
| Active mapping on TXR-1101 `#7`? | **Yes** — ACTIVE mapping `5e8c93c8-…`, name `¶5E Other fees/reimbursable expenses` |
| Page / coords | Page **3**, x=90.58 y=494.54 w=480.16 h=13.85 |
| Visible blank at coords? | Lee: **no**. Mapping notes describe paragraph-based / estimated placement; older estimated row is INACTIVE |
| Related language / details column? | `listing_agreement_details.other_fees_reimbursable_expenses` exists; catalog `source_type=listing_agreement_details` but **`source_path` null** (resolver cannot pull) |
| Older TXR-1101 version? | Seeded with Listing migrations; prior estimated placement mapping INACTIVE |
| Packet use of mapping? | `field_instance_mappings` for active mapping: **0**; `field_instances` by field_id: **2** ACTIVE (legacy instances) |
| Why in historical audit? | STRUCTURAL Global `NA` clear set + ACTIVE form-7 mapping + listing_agreement_details association |
| Classification | **Hidden/non-visible mapping** (obsolete estimated placement on current form). Not a legitimate visible current field for default restoration without Lee re-approval after visual proof |
| Future cleanup (separate) | Review deactivating the ACTIVE mapping and/or fixing/removing catalog field + null `source_path`; do **not** restore preference default pending Lee |

### `KNOWN_DISTRICTS`

| Question | Finding |
|---|---|
| Active mapping on TXR-1101 `#7`? | **Yes** — ACTIVE mapping `89bbf5cc-…`, name `¶12K Known districts` |
| Page / coords | Page **8**, x=73.65 y=280.76 w=488.37 h=13.85 |
| Visible blank at coords? | Lee: **no**. Paragraph-based estimated placement; older estimated row INACTIVE (was page 7) |
| Related language / details column? | `listing_agreement_details.known_districts`; `source_type=listing_agreement_details`, **`source_path` null** |
| Packet use of mapping? | mapping instances: **0**; field_instances by field_id: **2** ACTIVE |
| Why in historical audit? | Same STRUCTURAL / Listing association path as above |
| Classification | **Hidden/non-visible mapping** (obsolete estimated placement). Unapproved for defaults |
| Future cleanup (separate) | Same structural review as above — not part of this restoration |

---

## Mapping verification (approved + disputed)

Forms: Buyer Rep TXR-1501 (`#1`), Listing TXR-1101 (`#7`), One to Four TXR-1601 (`#11`), Residential Lease TXR-2001 (`#18`) — all GLOBAL ACTIVE.

| Field key | Form | Page | Mapping status | Default created |
|---|---|---:|---|---|
| BUYER_REP_RETAINER_AMOUNT | `#1` | 2 | ACTIVE | yes `"0"` currency |
| BUYER_REP_CONSTRUCTION_COMPENSATION | `#1` | 2 | ACTIVE | yes `"0"` text |
| BUYER_REP_OTHER_COMPENSATION | `#1` | 3 | ACTIVE | yes `"0"` text |
| BUYER_REP_EMPLOYER_RELOCATION | `#1` | 3 | ACTIVE | yes `"NA"` |
| SPECIAL_PROVISIONS | `#1` | 5 | ACTIVE | yes `"NA"` |
| LISTING_EXCLUSIONS | `#7` | 1 | ACTIVE | yes `"NA"` |
| OTHER_FEES_REIMBURSABLE_EXPENSES | `#7` | 3 | ACTIVE | **no** |
| KNOWN_FINANCIAL_OBLIGATIONS_EXCEPTION | `#7` | 8 | ACTIVE | yes `"NA"` |
| KNOWN_LIENS_EXCEPTION | `#7` | 8 | ACTIVE | yes `"NA"` |
| EMPLOYER_RELOCATION_COMPANY | `#7` | 8 | ACTIVE | yes `"NA"` |
| KNOWN_DISTRICTS | `#7` | 8 | ACTIVE | **no** |
| SPECIAL_PROVISIONS | `#7` | 9 | ACTIVE | yes `"NA"` |
| CONTRACT_PROPERTY_EXCLUSIONS | `#11` | 1 | ACTIVE | yes `"NA"` |
| contract_title_objection_use_activity | `#11` | 3 | ACTIVE | yes `"NA"` |
| CONTRACT_SERVICE_CONTRACT_REIMBURSEMENT_AMOUNT | `#11` | 5 | ACTIVE | yes `"0"` currency |
| CONTRACT_BROKER_DISCLOSURE_TEXT | `#11` | 6 | ACTIVE | yes `"NA"` |
| CONTRACT_SPECIAL_PROVISIONS | `#11` | 6 | ACTIVE | yes `"NA"` |
| CONTRACT_SELLER_EXPENSE_CONTRIBUTION_AMOUNT | `#11` | 6 | ACTIVE | yes `"0"` currency |
| TXR_2001_UTILITIES_LANDLORD_PAYS | `#18` | 5 | ACTIVE | yes `"NA"` |
| TXR_2001_MOVE_IN_LANDLORD_CONDITIONS | `#18` | 7 | ACTIVE | yes `"NA"` |
| TXR_2001_TENANT_SPECIFIC_REPAIR_ITEMS | `#18` | 10 | ACTIVE | yes `"NA"` |

---

## UI verification (Map Fields)

For created defaults: **Default if blank** shows `NA` or `0`; **Default source** shows `Personal` (not `Personal — applies to all forms`); **Filled from** unchanged (Packet details / Not connected / Client name as before).

---

## Resolution precedence (tests)

Existing unit tests confirm:

- Explicit packet / manual values win
- Mapped object values precede Personal defaults when present
- Form-specific Personal used when mapped value blank/unavailable
- Numeric `"0"` is a real value (not blank)
- Other users do not receive Lee’s Private defaults

---

## Supporting context (original audit)

### Timeline (abbreviated)

1. `20260715180000` — migrate Private/Org; leave STRUCTURAL NA/0 on Global  
2. `20260717120000` — clear UNKNOWN money zeros  
3. `20260717180000` — clear all remaining Global catalog literals  
4. Packet repairs + FIRPTA Private restore  

### Safely migrated (unchanged by restoration)

- Lee Private: **56** ACTIVE all-forms (includes restored FIRPTA)  
- Organization: **4** (Broker Bay scheduling + landlord manage checkboxes)  

### Related artifacts

- `_recovered_defaults_classification.md`
- `_recovered_structural_unknown_packet_sections.md`
