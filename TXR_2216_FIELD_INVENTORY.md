# TXR-2216 Itemization of Security Deposit — Proposed Field Inventory

**Audit date:** 2026-08-05  
**Mode:** Discovery / propose only — no fields, mappings, defaults, migrations, schema changes, PDF writes, storage uploads, or packet regeneration  
**Production:** `harbaugh-forms-prod` / `eetonalyyyssvkyfdoxh` — **read-only**  
**Development:** `harbaugh-forms-dev` / `ewxsxwzezhkeawnjvigx` — form **absent**; not modified  

---

## 1. Concise summary

TXR-2216 (**Itemization of Security Deposit**, revision **01-05-26**) exists **only in production** as Global form **id 51**, **ACTIVE + DRAFT**, with PDF `global/forms/51/ItemizationOfSecurityDeposit.pdf` (3 pages, **0** AcroForm fields, **0** mappings). Development has **no** matching form record.

The form is a landlord/manager notice that itemizes fixed deduction categories **(1)–(19)**, states the deposit tendered, shows balance after deductions, and offers mutually exclusive outcomes **A** (refund check) or **B** (excess owed, pay-to address), plus Means of Delivery. It is **not** a free-form repeating table; categories are fixed on the promulgated PDF.

**Initial discovery recommendation:** **64** logical fields (3 automatic + 61 manual).  

**Decision-review correction (2026-08-05):** see `TXR_2216_APPROVAL_MEMO.md`. Reconciled baseline awaiting Lee approval: **63** logical fields (3 automatic + 60 manual), **65** PDF placements (extra `PROPERTY_FULL_ADDRESS` headers on pages 2–3), semantic item keys, item (10) amount-only, **no** v1 calculations/defaults. **No** schema changes. Ignore **4** signature/date signing lines.

---

## 2. Form record confirmation

| Attribute | Production | Development |
|-----------|------------|-------------|
| Form ID | **51** | — (no TXR-2216 row) |
| Form number / code | `TXR-2216` | — |
| Form name | Itemization of Security Deposit | — |
| Version / family | `TXR-2216-01-05-2026` / `TXR-2216` | — |
| Category | `OTHER` | — |
| Owner type / owner | `GLOBAL` / `owner_user_id = null` | — |
| Status | `ACTIVE` | — |
| Publication | `DRAFT` (`published_at` null) | — |
| PDF storage path | `global/forms/51/ItemizationOfSecurityDeposit.pdf` | — |
| Created / updated | 2026-08-05T18:35:03Z / 18:35:04Z | — |
| Environments | **Production only** | Absent |

**Inference:** Form IDs are not portable across environments. Any later development copy must resolve by stable identity (`form_code` + `version_label` / `form_family_key`), not by id `51`.

---

## 3. Source PDF inspection

| Item | Finding |
|------|---------|
| Bucket | `form-templates` (private) |
| Object path | `global/forms/51/ItemizationOfSecurityDeposit.pdf` |
| Filename | `ItemizationOfSecurityDeposit.pdf` |
| Bytes | 181660 |
| MD5 | `599fdccc5c3e551f9360e152d1e50a6a` |
| SHA-256 | `63a99020c1e8ee8c36d90018ad71b49b424a51734d0ff7b81d504da20084515b` |
| Pages | **3** (612×792 each) |
| Face revision | `(TXR-2216) 01-05-26` · Page n of 3 |
| AcroForm fields | **0** |
| ACTIVE mappings | **0** |
| Local read-only copy | `_audit_tmp/TXR-2216-ItemizationOfSecurityDeposit.pdf` (gitignored) |
| Page renders | `_audit_tmp/txr2216_page_{1,2,3}.png` |
| Production mutation | **None** — download/list/select only |

Brokerage footer branding on the PDF (Davey Goosmann Realty / Kenneth Harbaugh) is template imprint, not a fillable field.

---

## 4. Existing AcroForm comparison

| Metric | Count |
|--------|------:|
| Existing AcroForm fields | **0** |
| Usable / rename / replace / ignore | N/A |

All widgets must be created in Map Fields (hand-drawn placements). Recommended PDF action for every proposed field: **create new widget** (no AcroForm name to retain).

---

## 5. Page-by-page visual review

### Page 1 — Header + deductions (1)–(8)

- **To:** two rules → tenant name(s)
- **(Forwarding Address):** two rules
- **Re: Lease concerning the Property at** → two rules (property address)
- **Move-Out Date:** short date rule
- **Total Security Deposit tendered… additional deposits:** `$` amount
- **(1)** Damages — ~5 description lines + `$`
- **(2)** clean / deodorize / exterminate / maintain — **4 checkboxes** + `$` (no separate narrative blank)
- **(3)** Unpaid/accelerated rent periods — description + `$`
- **(4)** Late charges months — description + `$`
- **(5)** Reletting costs — **amount only** (label has no description rules)
- **(6)** Unpaid utilities — description + `$`
- **(7)** Unpaid animal charges — description + `$`
- **(8)** unreturned keys / garage door openers / security devices / other components — **4 checkboxes**, short “other” description, + `$`
- Signatures/initials: **none** on this page

### Page 2 — Deductions (9)–(19)

Fixed categories continue; each has right-aligned `$` amount:

| # | Description blank | Amount |
|---|-------------------|--------|
| 9 | Yes (~2 lines) | Yes |
| 10 | **No** — amount only (confirmed in decision review) | Yes |
| 11 | Yes (~2 lines) | Yes |
| 12 | Yes (~3 lines) | Yes |
| 13 | Yes (~3 lines) | Yes |
| 14 | Yes (~3 lines) | Yes |
| 15 | Yes (~2 lines) | Yes |
| 16 | Yes (~3 lines) | Yes |
| 17 | Yes (~3 lines) | Yes |
| 18 | **No** (amount only; rekey paragraph) | Yes |
| 19 | **Other** — large ~10-line block | Yes (one amount for the section) |

No checkboxes on page 2. No signatures.

### Page 3 — Balance, outcomes, signing, delivery

- **Balance of Security Deposit after Deductions** `$`
- **Amount Tendered or Owed:** mutually exclusive
  - **A** checkbox + refund check `$` amount
  - **B** checkbox + pay-to **address** blank (no excess `$` blank on the PDF)
- **Ignored (Authentisign):** Landlord signature + Date; By: signature + Date
- **Mapped (non-signature identity):** Printed Name; Firm Name
- **Means of Delivery:** Regular US Mail; Certified Mail + No.; Hand delivered to / on / by; Other + text
- Continuation header: title “Itemization of Security Deposit”; possible adjacent rule — **ambiguous** (see Lee decisions)

---

## 6. Repeated-item modeling recommendation

**Recommend approach 1 — individual fixed fields** (e.g. `txr_2216_item_01_description`, `txr_2216_item_01_amount`).

**Why:**

1. The PDF defines **fixed promulgated categories (1)–(19)**, not an open repeating grid.
2. Categories differ (checkboxes on 2 and 8; amount-only on 5 and 18; oversized Other on 19).
3. Current Harbaugh architecture maps **one PDF widget ↔ one catalog field / mapping**, with no first-class repeating-row editor for packet forms.
4. Matches prior TXR form-scoped key patterns (`txr_2217_*`, `txr_2222_*`, `txr_2001_*`).

**Reject for now:** structured repeating-row model (approach 2) — would need product/schema work without PDF benefit.  
**Hybrid (approach 3):** unnecessary; Other is still one description + one amount.  
**Approach 4** is effectively the same as 1 for this fixed layout.

Do **not** implement until Lee approves.

---

## 7. Calculation candidates (do not implement)

Current architecture has **no** general form-field calculation engine; Refresh resolves automatic sources/defaults only. Packet snapshots are immutable on ordinary open. Any calculation would be new product behavior.

| Candidate | Inputs | Formula | PDF support | Blank→0? | Rounding | Editable? | Arch. safe now? | Risks |
|-----------|--------|---------|-------------|----------|----------|-----------|-----------------|-------|
| `txr_2216_balance_after_deductions` | Deposit + item amounts (1)–(19) | `deposit − Σ(amounts)` | Wording “Balance … after Deductions” supports derivation | **Uncertain** — blank likely means “no charge,” but treating blank as 0 can invent a balance when items are incomplete | Currency cents; banker’s vs half-up TBD | **Yes** — must remain overrideable | **No** without new calc feature | Wrong balance on incomplete itemization; conflicts with packet snapshot immutability if auto-written on open |
| `txr_2216_outcome_refund_amount` (A) | Balance (or same inputs) | Equal to balance when A selected and balance ≥ 0 | A’s `$` is the enclosed-check amount | Same as above | Same | **Yes** | **No** | Auto-filling A while B is checked; mutual exclusivity |
| Excess owed (B) | Σ − deposit when Σ > deposit | Not a PDF blank | B has **no** excess `$` field — only pay-to address | N/A | N/A | N/A | N/A | Do **not** invent an excess amount field |

**Recommendation:** ship settlement amount fields as **manual_only**; document calc as optional future enhancement after Lee approval.

---

## 8. Duplicate / reuse analysis

| Need | Existing ACTIVE field | Recommendation |
|------|----------------------|----------------|
| Property address | `PROPERTY_FULL_ADDRESS` (`packet_property` / `full_address`) | **Reuse** Global field + source (same as TXR-2217) |
| Printed Name | `AGENT_NAME` (`settings_agent` / `agent_full_name`) | **Reuse** |
| Firm Name | `BROKERAGE_NAME` (`settings_brokerage` / `brokerage_name`) | **Reuse** |
| Tenant names | `txr_2217_tenant_names` (manual_only, form-labeled) | **Do not reuse** — form-specific key/label; create `txr_2216_tenant_names` |
| Lease security deposit | `lease_security_deposit`, `txr_2001_security_deposit_amount` | **Do not reuse** — those are listing/lease contract amounts, not this settlement “tendered including additional deposits” figure |
| Move-out / forwarding | none | **New** form-specific manual fields |
| Delivery block | `txr_2217_delivery_*` | **Do not reuse** — create parallel `txr_2216_delivery_*` keys (same pattern, distinct form scope) |
| Landlord name | `landlord_name_1` | **Not applicable** — landlord line is signature-only on this PDF |
| Itemized deductions | none | **New** form-specific fields |

Optional future auto-source (not proposed as default): `packet_contact` `tenant_1.full_name` for tenant names — TXR-2217 kept tenants manual; recommend same unless Lee prefers automatic.

**Key collision check:** no ACTIVE or DELETED `txr_2216%` catalog keys; sample proposed keys returned **0** hits.

---

## 9. Source-mapping recommendation summary

| Class | Count | Fields |
|------|------:|--------|
| Automatic reuse | **3** | `PROPERTY_FULL_ADDRESS`, `AGENT_NAME`, `BROKERAGE_NAME` |
| Custom resolver | **0** | — |
| Manual-only (new) | **61** | All `txr_2216_*` |
| Abandoned sources | **0** | Do not resurrect `contract_details` / `listing_agreement_details` |
| Schema additions | **0** | Deductions/settlement stay packet/field-instance scoped |

**Defaults:** none proposed. Conditional/Other/mutual-exclusive/currency/date/transaction fields remain blank (TXR-1102 blank-vs-NA rule).

---

## 10. Ignored signature / initials areas

| Page | Area | Action |
|------|------|--------|
| 3 | Landlord signature underline | Ignore |
| 3 | Landlord Date (signing) | Ignore |
| 3 | By: signature underline | Ignore |
| 3 | By: Date (signing) | Ignore |

**Count ignored:** **4**  
Means of Delivery and Printed Name / Firm Name are **not** treated as signatures (consistent with TXR-2217).

---

## 11. Proposed field inventory (complete)

**Conventions:** durable form-scoped keys `txr_2216_*`; widget/data types follow catalog norms; multiline descriptions = one field (first-line placement + height covering rules); required = **No** (consistent with other TXR mappings); AcroForm = none → **create new widget**; schema change = **No** for all rows; default = **none / blank**.

### 11.A Identification & deposit (page 1)

| field_key | Label | Pg | Section | Data | Widget | Multi | Source | Path/resolver | Form-specific | Item row | Calc? | Confidence | Notes |
|-----------|-------|----|---------|------|--------|-------|--------|---------------|---------------|----------|-------|------------|-------|
| `txr_2216_tenant_names` | TXR-2216 Tenant Names | 1 | To: (Tenant(s)) | text | text | Yes (2 lines) | manual_only | — | Yes | No | No | High | Parallel to `txr_2217_tenant_names`; optional later `packet_contact` tenant_1.full_name |
| `txr_2216_forwarding_address` | TXR-2216 Forwarding Address | 1 | (Forwarding Address) | text | text | Yes (2 lines) | manual_only | — | Yes | No | No | High | Not contact mailing — post-move forwarding |
| `PROPERTY_FULL_ADDRESS` | Property Full Address | 1 | Property at | text | text | Yes (2 lines) | packet_property | `full_address` | No (reuse) | No | No | High | Reuse ACTIVE Global id `9e2d6525-…` |
| `txr_2216_move_out_date` | TXR-2216 Move-Out Date | 1 | Move-Out Date | date | date | No | manual_only | — | Yes | No | No | High | |
| `txr_2216_security_deposit_amount` | TXR-2216 Security Deposit Tendered | 1 | Total deposit tendered | currency | text | No | manual_only | — | Yes | No | Input | High | Do not reuse lease deposit fields |

### 11.B Item (1)–(8) (page 1)

| field_key | Label | Pg | Section | Data | Widget | Multi | Source | Item | Calc? | Confidence | Notes |
|-----------|-------|----|---------|------|--------|-------|--------|------|-------|------------|-------|
| `txr_2216_item_01_description` | TXR-2216 Item 1 Damages Description | 1 | (1) | text | text | Yes | manual_only | Yes | No | High | |
| `txr_2216_item_01_amount` | TXR-2216 Item 1 Damages Amount | 1 | (1) `$` | currency | text | No | manual_only | Yes | Input | High | |
| `txr_2216_item_02_clean` | TXR-2216 Item 2 Clean | 1 | (2) | boolean | checkbox | No | manual_only | Yes | No | High | Check-all-that-apply with 02 siblings |
| `txr_2216_item_02_deodorize` | TXR-2216 Item 2 Deodorize | 1 | (2) | boolean | checkbox | No | manual_only | Yes | No | High | |
| `txr_2216_item_02_exterminate` | TXR-2216 Item 2 Exterminate | 1 | (2) | boolean | checkbox | No | manual_only | Yes | No | High | |
| `txr_2216_item_02_maintain` | TXR-2216 Item 2 Maintain | 1 | (2) | boolean | checkbox | No | manual_only | Yes | No | High | |
| `txr_2216_item_02_amount` | TXR-2216 Item 2 Cleaning/Maintenance Amount | 1 | (2) `$` | currency | text | No | manual_only | Yes | Input | High | |
| `txr_2216_item_03_description` | TXR-2216 Item 3 Unpaid Rent Periods | 1 | (3) | text | text | Yes | manual_only | Yes | No | High | |
| `txr_2216_item_03_amount` | TXR-2216 Item 3 Unpaid Rent Amount | 1 | (3) `$` | currency | text | No | manual_only | Yes | Input | High | |
| `txr_2216_item_04_description` | TXR-2216 Item 4 Late Charge Months | 1 | (4) | text | text | No–short | manual_only | Yes | No | High | |
| `txr_2216_item_04_amount` | TXR-2216 Item 4 Late Charges Amount | 1 | (4) `$` | currency | text | No | manual_only | Yes | Input | High | |
| `txr_2216_item_05_amount` | TXR-2216 Item 5 Reletting Costs Amount | 1 | (5) `$` | currency | text | No | manual_only | Yes | Input | High | Amount-only |
| `txr_2216_item_06_description` | TXR-2216 Item 6 Unpaid Utilities Description | 1 | (6) | text | text | Yes | manual_only | Yes | No | High | |
| `txr_2216_item_06_amount` | TXR-2216 Item 6 Unpaid Utilities Amount | 1 | (6) `$` | currency | text | No | manual_only | Yes | Input | High | |
| `txr_2216_item_07_description` | TXR-2216 Item 7 Unpaid Animal Charges Description | 1 | (7) | text | text | Yes | manual_only | Yes | No | High | |
| `txr_2216_item_07_amount` | TXR-2216 Item 7 Unpaid Animal Charges Amount | 1 | (7) `$` | currency | text | No | manual_only | Yes | Input | High | |
| `txr_2216_item_08_keys` | TXR-2216 Item 8 Keys | 1 | (8) | boolean | checkbox | No | manual_only | Yes | No | High | |
| `txr_2216_item_08_garage_door_openers` | TXR-2216 Item 8 Garage Door Openers | 1 | (8) | boolean | checkbox | No | manual_only | Yes | No | High | |
| `txr_2216_item_08_security_devices` | TXR-2216 Item 8 Security Devices | 1 | (8) | boolean | checkbox | No | manual_only | Yes | No | High | |
| `txr_2216_item_08_other_components` | TXR-2216 Item 8 Other Components Selected | 1 | (8) | boolean | checkbox | No | manual_only | Yes | No | High | |
| `txr_2216_item_08_other_description` | TXR-2216 Item 8 Other Components Description | 1 | (8) after “other components:” | text | text | No–short | manual_only | Yes | No | High | Conditional on other checkbox — keep blank default |
| `txr_2216_item_08_amount` | TXR-2216 Item 8 Replacement Amount | 1 | (8) `$` | currency | text | No | manual_only | Yes | Input | High | |

### 11.C Item (9)–(19) (page 2)

| field_key | Label | Pg | Section | Data | Widget | Multi | Source | Item | Calc? | Confidence | Notes |
|-----------|-------|----|---------|------|--------|-------|--------|------|-------|------------|-------|
| `txr_2216_item_09_description` | TXR-2216 Item 9 Unauthorized Locks/Fixtures | 2 | (9) | text | text | Yes | manual_only | Yes | No | High | |
| `txr_2216_item_09_amount` | TXR-2216 Item 9 Amount | 2 | (9) `$` | currency | text | No | manual_only | Yes | Input | High | |
| `txr_2216_item_10_description` | ~~TXR-2216 Item 10 Access Cost Note~~ | 2 | (10) | — | — | — | — | — | — | — | **Removed** | **Superseded:** PDF has no user description blank; see approval memo |
| `txr_2216_item_10_amount` | TXR-2216 Item 10 Access Amount | 2 | (10) `$` | currency | text | No | manual_only | Yes | Input | High | Rename to semantic `txr_2216_inaccessible_access_amount` per approval memo |
| `txr_2216_item_11_description` | TXR-2216 Item 11 Light Bulbs Rooms | 2 | (11) | text | text | Yes | manual_only | Yes | No | High | |
| `txr_2216_item_11_amount` | TXR-2216 Item 11 Amount | 2 | (11) `$` | currency | text | No | manual_only | Yes | Input | High | |
| `txr_2216_item_12_description` | TXR-2216 Item 12 Abandoned Property | 2 | (12) | text | text | Yes | manual_only | Yes | No | High | |
| `txr_2216_item_12_amount` | TXR-2216 Item 12 Amount | 2 | (12) `$` | currency | text | No | manual_only | Yes | Input | High | |
| `txr_2216_item_13_description` | TXR-2216 Item 13 Abandoned/Illegal Vehicles | 2 | (13) | text | text | Yes | manual_only | Yes | No | High | |
| `txr_2216_item_13_amount` | TXR-2216 Item 13 Amount | 2 | (13) `$` | currency | text | No | manual_only | Yes | Input | High | |
| `txr_2216_item_14_description` | TXR-2216 Item 14 Legal Proceeding Description | 2 | (14) | text | text | Yes | manual_only | Yes | No | High | |
| `txr_2216_item_14_amount` | TXR-2216 Item 14 Amount | 2 | (14) `$` | currency | text | No | manual_only | Yes | Input | High | |
| `txr_2216_item_15_description` | TXR-2216 Item 15 Lease Violation Notices | 2 | (15) | text | text | Yes | manual_only | Yes | No | High | |
| `txr_2216_item_15_amount` | TXR-2216 Item 15 Amount | 2 | (15) `$` | currency | text | No | manual_only | Yes | Input | High | |
| `txr_2216_item_16_description` | TXR-2216 Item 16 Unapproved Alterations | 2 | (16) | text | text | Yes | manual_only | Yes | No | High | |
| `txr_2216_item_16_amount` | TXR-2216 Item 16 Amount | 2 | (16) `$` | currency | text | No | manual_only | Yes | Input | High | |
| `txr_2216_item_17_description` | TXR-2216 Item 17 Smoking Damages | 2 | (17) | text | text | Yes | manual_only | Yes | No | High | |
| `txr_2216_item_17_amount` | TXR-2216 Item 17 Amount | 2 | (17) `$` | currency | text | No | manual_only | Yes | Input | High | |
| `txr_2216_item_18_amount` | TXR-2216 Item 18 Rekey Amount | 2 | (18) `$` | currency | text | No | manual_only | Yes | Input | High | Amount-only |
| `txr_2216_item_19_description` | TXR-2216 Item 19 Other Description | 2 | (19) Other | text | text | Yes (~10 lines) | manual_only | Yes | No | High | Single field for Other block |
| `txr_2216_item_19_amount` | TXR-2216 Item 19 Other Amount | 2 | (19) `$` | currency | text | No | manual_only | Yes | Input | High | One amount for Other section |

### 11.D Settlement, identity, delivery (page 3)

| field_key | Label | Pg | Section | Data | Widget | Multi | Source | Path | Form-specific | Calc? | Confidence | Notes |
|-----------|-------|----|---------|------|--------|-------|--------|------|---------------|-------|------------|-------|
| `txr_2216_balance_after_deductions` | TXR-2216 Balance After Deductions | 3 | Balance | currency | text | No | manual_only | — | Yes | **Candidate** | High | Remain manual until calc approved |
| `txr_2216_outcome_refund_selected` | TXR-2216 Outcome A Refund Selected | 3 | A | boolean | checkbox | No | manual_only | — | Yes | No | High | Mutually exclusive with B |
| `txr_2216_outcome_refund_amount` | TXR-2216 Outcome A Refund Check Amount | 3 | A `$` | currency | text | No | manual_only | — | Yes | **Candidate** | High | |
| `txr_2216_outcome_excess_selected` | TXR-2216 Outcome B Excess Selected | 3 | B | boolean | checkbox | No | manual_only | — | Yes | No | High | Mutually exclusive with A |
| `txr_2216_outcome_excess_pay_to_address` | TXR-2216 Outcome B Pay-To Address | 3 | B address | text | text | No–long | manual_only | — | Yes | No | High | No excess `$` blank on PDF |
| `AGENT_NAME` | Agent Name | 3 | Printed Name | text | text | No | settings_agent | `agent_full_name` | No (reuse) | No | High | Non-signature |
| `BROKERAGE_NAME` | Brokerage Name | 3 | Firm Name | text | text | No | settings_brokerage | `brokerage_name` | No (reuse) | No | High | Non-signature |
| `txr_2216_delivery_regular_mail` | TXR-2216 Delivery Regular US Mail | 3 | Means of Delivery | boolean | checkbox | No | manual_only | — | Yes | No | High | |
| `txr_2216_delivery_certified_mail` | TXR-2216 Delivery Certified Mail | 3 | Means of Delivery | boolean | checkbox | No | manual_only | — | Yes | No | High | |
| `txr_2216_delivery_certified_mail_no` | TXR-2216 Delivery Certified Mail Number | 3 | Certified No. | text | text | No | manual_only | — | Yes | No | High | Conditional — blank default |
| `txr_2216_delivery_hand` | TXR-2216 Delivery Hand Delivered | 3 | Means of Delivery | boolean | checkbox | No | manual_only | — | Yes | No | High | |
| `txr_2216_delivery_hand_to` | TXR-2216 Delivery Hand Delivered To | 3 | Hand delivered to | text | text | No | manual_only | — | Yes | No | High | |
| `txr_2216_delivery_hand_on` | TXR-2216 Delivery Hand Delivered On | 3 | on | date | date | No | manual_only | — | Yes | No | High | |
| `txr_2216_delivery_hand_by` | TXR-2216 Delivery Hand Delivered By | 3 | by | text | text | No | manual_only | — | Yes | No | High | |
| `txr_2216_delivery_other_selected` | TXR-2216 Delivery Other Selected | 3 | Other | boolean | checkbox | No | manual_only | — | Yes | No | High | |
| `txr_2216_delivery_other_text` | TXR-2216 Delivery Other Text | 3 | Other | text | text | No | manual_only | — | Yes | No | High | Conditional — blank default |

**PDF widget action (all rows):** create new Map Fields widget; no AcroForm name.  
**Schema change (all rows):** No.

---

## 12. Validation counts (read-only)

| Check | Result |
|-------|--------|
| Prod form 51 ↔ PDF path | Match |
| PDF pages | 3 |
| AcroForm fields | 0 |
| Proposed substantive fields | **64** |
| Ignored signature/date areas | **4** |
| Proposed automatic-source fields | **3** |
| Proposed manual-only fields | **61** |
| Calculation candidates | **2** (balance; A refund amount) |
| Schema-change proposals | **0** |
| `txr_2216%` catalog collisions | **0** |
| Development TXR-2216 rows | **0** |
| Form `update_date` after inspection | Unchanged `2026-08-05T18:35:04.731448+00:00` |
| Mapping count after inspection | Still **0** |

---

## 13. Ambiguous areas for Lee

> **Status (2026-08-05):** Decision review complete. Cursor recommendations and reconciled counts are in **`TXR_2216_APPROVAL_MEMO.md`**. Implementation still requires Lee’s explicit approval of that memo.

Original open items (superseded by the approval memo):

1. **Tenant names source:** keep `manual_only` (recommended, matches TXR-2217) vs `packet_contact` `tenant_1.full_name` (+ maybe tenant_2 concatenation resolver).
2. **Item (10) description:** map short trailing rule or amount-only? → **Resolved: amount-only; drop description field.**
3. **Item (19) Other:** one multiline + one amount (recommended) vs multiple Other sub-rows (not on PDF as separate amounts).
4. **Pages 2–3 header rule:** map as extra `PROPERTY_FULL_ADDRESS` placement or leave unmapped? → **Recommended: extra placements of same logical field.**
5. **Calculations:** remain manual (recommended for v1) vs later auto-balance / auto-A amount?
6. **A/B exclusivity:** UI note only (separate booleans) vs future radio-group enforcement?
7. **Development mirror:** create matching DRAFT Global form in development before/after production field work?
8. **Naming:** numbered `item_NN_*` vs semantic keys → **Recommended: semantic keys** (see approval memo §5).

---

## 14. Proposed schema changes

**None.** Security-deposit deductions, descriptions, totals, refunds, and tenant balances are transaction/settlement-specific and belong on the packet field instances for this form — not on reusable property/contact tables.

---

## 15. Next-phase implementation plan (do not execute)

1. Lee approves inventory (and resolves §13 items).
2. On **production** form **51** (still DRAFT): create **61** new ACTIVE Global `txr_2216_*` fields (`manual_only`, null path/resolver, no Global defaults).
3. Reuse **3** existing Global fields without metadata changes.
4. Create **64** ACTIVE `form_field_mappings` with visual placements in Map Fields (`/forms/51/editor`); set checkbox export values per project norms; mark multiline where noted.
5. Document mutual exclusivity (A/B) and check-all-that-apply (item 2 / 8 / delivery) in mapping notes only.
6. Do **not** publish until Lee places/reviews coordinates.
7. Do **not** add calculation code, schema migrations, PDF replacement, or packet regeneration.
8. Optionally mirror form+fields to development by stable identity after production configuration is approved.
9. Write `TXR_2216_FIELD_IMPLEMENTATION.md` after apply; keep this inventory as the approval baseline.

---

## 16. Files, commands, queries, and objects inspected

### Files / artifacts

- `project_status.md`, `decisions.md` (read)
- `TXR_2217_FIELD_IMPLEMENTATION.md`, `CONDO_TXR_1605_FIELD_INVENTORY.md`, `NOTICE_TERMINATION_RESIDENTIAL_LEASING_TXR_2222_FIELD_IMPLEMENTATION.md` (pattern reference)
- `lib/types/field-source.ts`, `lib/types/packet-contact-source-paths.ts`
- Local (gitignored): `_audit_tmp/TXR-2216-ItemizationOfSecurityDeposit.pdf`, `txr2216_pdf_inspect.json`, `txr2216_text_extract.json`, `txr2216_catalog_reuse.json`, `txr2216_page_1.png`, `txr2216_page_2.png`, `txr2216_page_3.png`
- Helper scripts (read-only tooling): `scripts/discover-txr-2216-readonly.ts`, `scripts/extract-txr-2216-text.ts`, `scripts/render-txr-2216-pages.ts`

### Commands (read-only)

- Supabase JS selects against production `forms`, `form_field_mappings`, `fields`; development `forms` by `form_code` ilike `%2216%`
- Production Storage `form-templates` **download** + **list** of `global/forms/51/` (no upload/replace)
- pdf-lib AcroForm inventory; pdfjs text extract; pdfjs + `@napi-rs/canvas` page renders to `_audit_tmp` only

### Storage object

- `form-templates` / `global/forms/51/ItemizationOfSecurityDeposit.pdf`

### Explicit non-actions

- No INSERT/UPDATE/DELETE on production or development  
- No migrations / schema changes  
- No field or mapping creation  
- No PDF modification or storage upload  
- No packet work  

---

## 17. Recommended counts

### Discovery baseline (pre-review)

| Metric | Count |
|--------|------:|
| Logical fields | **64** |
| Automatic-source | **3** |
| Manual-only | **61** |
| Calculation candidates | **2** |
| Schema changes | **0** |
| Ignored signature/date areas | **4** |

### Decision-review reconciled baseline (awaiting Lee approval)

Authoritative detail: `TXR_2216_APPROVAL_MEMO.md`.

| Metric | Count |
|--------|------:|
| Logical fields | **63** |
| Automatic-source | **3** |
| Manual-only | **60** |
| Anticipated PDF placements | **65** |
| Calculation candidates (deferred; none in v1) | **2** |
| Schema changes | **0** |
| Ignored signature/date areas | **4** |
| New Global field definitions | **60** |
| Reused Global field definitions | **3** |

**Primary delta:** −1 logical field (remove item 10 description); +2 placements (page 2–3 property headers); semantic key rename for fixed deduction categories.
