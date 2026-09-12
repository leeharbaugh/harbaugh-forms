# TXR-2216 — Decision Review & Approval Memo

**Date:** 2026-08-05  
**Mode:** Decision review only — no fields, mappings, widgets, defaults, migrations, schema, packets, or storage writes  
**Production / development:** read-only verification only  
**Baseline inventory:** `TXR_2216_FIELD_INVENTORY.md`  
**Form:** Production id **51** · `TXR-2216` · Itemization of Security Deposit · ACTIVE + DRAFT · 3-page PDF · 0 AcroForm · 0 mappings  

This memo resolves every open item in inventory §13 and reconciles the final logical-field count before Lee’s explicit implementation approval.

---

## Compact decision table (§13 → recommendation)

| # | Open issue | Cursor recommendation | If approved | If rejected |
|---|------------|----------------------|-------------|-------------|
| 1 | Reuse `PROPERTY_FULL_ADDRESS`? | **Reuse** existing Global field + `packet_property` / `full_address` | Auto-fills lease property address on p1 “Property at” and (recommended) p2–p3 headers | Use form-scoped manual address field(s); more typing; loses packet property sync |
| 2 | Reuse `AGENT_NAME`? | **Reuse** Global + `settings_agent` / `agent_full_name` | Printed Name autofills from current agent settings path used by other forms | Manual Printed Name; risk of drift from agent profile |
| 3 | Reuse `BROKERAGE_NAME`? | **Reuse** Global + `settings_brokerage` / `brokerage_name` | Firm Name autofills brokerage name | Manual Firm Name |
| 4 | Tenant names source | **Manual-only v1** (`txr_2216_tenant_names`) | Correct for multi-tenant / custom packets; agent types names | Auto `tenant_1` only underfills; new resolver is extra product work |
| 5 | Item (10) description? | **Amount only** — drop description field | Matches PDF; no phantom blank | Invented description field with nowhere to place it |
| 6 | Pages 2–3 header blank | **Same logical field**, extra placements of `PROPERTY_FULL_ADDRESS` | Header shows same property address; +2 placements, +0 logical fields | Leave unmapped (titles only); headers stay blank |
| 7 | Numbered vs semantic item keys | **Semantic form-scoped keys** for fixed categories | Stable if TXR renumbers; readable Map Fields | Keep `item_NN_*`; easier PDF-order scan, brittle on category insert/reorder |
| 8 | Outcome A/B model | **Two independent checkboxes** + notes; no radio engine | Matches current app (no exclusive checkbox groups); both start unchecked | Require new exclusive-choice product before mapping |
| 9 | Outcome B dollar amount? | **Do not create** — PDF has pay-to address only | No invented field | Phantom excess `$` with no widget target |
| 10 | Means of Delivery vs TXR-2217 | **New `txr_2216_delivery_*` only**; independent checkboxes | Form-scoped service log; no cross-form bleed | Reusing `txr_2217_*` couples unrelated notices |
| 11 | Calculations v1 | **None** — enter balance and A amount manually | No hidden coupling; safe with snapshot architecture | Calc needs new engine + blank/rounding/A-B rules |
| 12 | Defaults v1 | **None** (no 0, no NA, no prechecked elections/dates) | Blank-safe settlement form | Defaults can imply charges or elections |
| 13 | Development mirror | **Defer** until after approved production Map Fields | Avoid dual-env drift during placement | Create empty dev shell now (optional; not required for approval) |

---

## 1. Automatic-field verification

### `PROPERTY_FULL_ADDRESS`

| Item | Finding |
|------|---------|
| Definition | ACTIVE Global · id `9e2d6525-3f8c-46db-a306-49e7ac5c7051` · label “Property Full Address” |
| Source | `packet_property` / `full_address` (no resolver_key) |
| Formatting | `formatPropertyAddress`: `street[ unit], city, state, zip` |
| Coupling | Already on **64** ACTIVE mappings across many forms; each packet_form still gets its own field instance |
| TXR-2216 fit | Matches “Lease concerning the Property at” and continuation headers |
| Recommendation | **Reuse** (not a new form-scoped duplicate) |

### `AGENT_NAME`

| Item | Finding |
|------|---------|
| Definition | ACTIVE Global · id `fcd1089b-47e1-4f03-ae77-a6582b778e09` · “Agent Name” |
| Source | `settings_agent` / `agent_full_name` → resolved via brokerage settings agent name parts (`First Middle Last`) |
| Coupling | **9** ACTIVE mappings; same Printed Name pattern as TXR-2217 |
| TXR-2216 fit | Page 3 “Printed Name:” under PM / POA signing block — identity, not signature |
| Recommendation | **Reuse** |

### `BROKERAGE_NAME`

| Item | Finding |
|------|---------|
| Definition | ACTIVE Global · id `6427cd73-8d56-4112-9d18-ee3c45d947a5` · “Brokerage Name” |
| Source | `settings_brokerage` / `brokerage_name` |
| Coupling | **19** ACTIVE mappings |
| TXR-2216 fit | Page 3 “Firm Name:” |
| Recommendation | **Reuse** |

**Note:** Sharing a source path does **not** require sharing a catalog field, but here reuse is appropriate: semantics match, and TXR-2217 already established this trio for the same Printed Name / Firm Name / property pattern. Creating form-scoped duplicates would only reduce coupling at the cost of duplicate Global metadata with identical sources.

---

## 2. Tenant auto-source

| Question | Answer |
|----------|--------|
| Who is “Tenant”? | The vacating residential tenant(s) named in “To: … (Tenant(s))” — the deposit claimants / notice recipients |
| Multiple tenants? | Yes — “(Tenant(s))” and two name rules; packets support `tenant_1` and `tenant_2` roles |
| Join behavior today | No `tenant_names` custom resolver. Existing `txr_2001_tenant_names` uses **only** `packet_contact` / `tenant_1.full_name` (single name). `buyer_names` joins buyers; no tenant equivalent |
| Reliable in all workflows? | **No.** Custom packets may omit tenant roles; listing/sale packets may use buyer/seller only; order may not match lease order |
| Off-lease packets? | Form can be added to any collection/custom packet once published |
| Stale/wrong-name risks | High if auto-sourced from wrong role, single tenant only, or outdated contact |

**Recommendation:** option **3 — Manual-only for version 1** (`txr_2216_tenant_names`, multiline).  
Do **not** reuse `txr_2217_tenant_names` or `txr_2001_tenant_names`.  
Optional later: editable prefill via a new `tenant_names` resolver joining `tenant_1`+`tenant_2` — not in v1.

---

## 3. Item (10) — description uncertainty resolved

**PDF wording (page 2):**

> (10) Landlord’s cost to access the Property because Property was made inaccessible by Tenant: **$**____

**Why it looked uncertain:** the long fixed sentence wraps; early discovery mistook the wrap / trailing rule for a user description blank (confidence was only Medium).

**Classification after re-inspection:**

- Fully fixed printed category text  
- **Amount blank only**  
- Not “Other,” not a subpart of (9), not a user description + amount  

**Required field (exactly one):**

| Key | Label | Data | Widget | Description field? | Printed text in DB? |
|-----|-------|------|--------|--------------------|---------------------|
| `txr_2216_inaccessible_access_amount` | TXR-2216 Inaccessible Property Access Amount | currency | text | **No** | **No** — category text stays on the PDF only |

**Inventory change:** remove proposed `txr_2216_item_10_description`.

---

## 4. Page-header rule

| Location | Visual | Recommendation |
|----------|--------|----------------|
| Page 1 title | Title only (no header address rule) | No header mapping |
| Page 1 “Property at” | Two address rules | `PROPERTY_FULL_ADDRESS` placement #1 |
| Page 2 header | Title + long blank rule after title | `PROPERTY_FULL_ADDRESS` placement #2 |
| Page 3 header | Title + long blank rule after title | `PROPERTY_FULL_ADDRESS` placement #3 |

**Model:** one logical catalog field, **three** PDF placements (established pattern: TXR-2012, TXR-1701, multi-page contracts).  
**Do not** count headers as separate logical fields.  
**Source:** automatic via existing `packet_property` / `full_address`.

If Lee prefers headers unmapped, subtract **2 placements** only (logical count unchanged).

---

## 5. Fixed-item structure & naming

### Per-item classification

| # | Structure | Recommended keys (semantic) |
|---|-----------|------------------------------|
| 1 | User description + amount | `txr_2216_damages_description`, `txr_2216_damages_amount` |
| 2 | Checkbox elections + amount | `txr_2216_clean_selected`, `…_deodorize_selected`, `…_exterminate_selected`, `…_maintain_selected`, `txr_2216_cleaning_amount` |
| 3 | Supplemental periods text + amount | `txr_2216_unpaid_rent_periods`, `txr_2216_unpaid_rent_amount` |
| 4 | Supplemental months text + amount | `txr_2216_late_charge_months`, `txr_2216_late_charges_amount` |
| 5 | Fixed printed + amount only | `txr_2216_reletting_amount` |
| 6 | User description + amount | `txr_2216_unpaid_utilities_description`, `txr_2216_unpaid_utilities_amount` |
| 7 | User description + amount | `txr_2216_unpaid_animal_charges_description`, `txr_2216_unpaid_animal_charges_amount` |
| 8 | Checkboxes + other text + amount | `txr_2216_keys_selected`, `…_garage_door_openers_selected`, `…_security_devices_selected`, `…_other_components_selected`, `txr_2216_other_components_description`, `txr_2216_unreturned_items_amount` |
| 9 | User description + amount | `txr_2216_unauthorized_locks_description`, `txr_2216_unauthorized_locks_amount` |
| 10 | Fixed printed + amount only | `txr_2216_inaccessible_access_amount` |
| 11 | Rooms text + amount | `txr_2216_light_bulbs_rooms`, `txr_2216_light_bulbs_amount` |
| 12 | User description + amount | `txr_2216_abandoned_property_description`, `txr_2216_abandoned_property_amount` |
| 13 | User description + amount | `txr_2216_abandoned_vehicles_description`, `txr_2216_abandoned_vehicles_amount` |
| 14 | User description + amount | `txr_2216_legal_proceeding_description`, `txr_2216_legal_proceeding_amount` |
| 15 | Violations text + amount | `txr_2216_lease_violation_notices`, `txr_2216_mailing_costs_amount` |
| 16 | User description + amount | `txr_2216_unapproved_alterations_description`, `txr_2216_unapproved_alterations_amount` |
| 17 | User description + amount | `txr_2216_smoking_damages_description`, `txr_2216_smoking_damages_amount` |
| 18 | Fixed printed + amount only | `txr_2216_rekey_amount` |
| 19 | Other description + amount | `txr_2216_other_description`, `txr_2216_other_amount` |

Still **individual fixed fields** (not a repeating-row schema). Numbered `item_NN_*` keys from the discovery inventory are **superseded** by these semantic keys if Lee approves this memo.

**Maintainability:** Semantic keys survive TXR renumbering when category meaning is stable; numbered keys track face order but break when categories are inserted. Category meaning change under the same number is rare but would require a new key either way. **Prefer semantic.**

---

## 6. Outcomes A / B

| Side | Logical fields |
|------|----------------|
| **A** | `txr_2216_outcome_refund_selected` (checkbox); `txr_2216_outcome_refund_amount` (currency `$` in “Enclosed is a check in the amount of $___”) |
| **B** | `txr_2216_outcome_excess_selected` (checkbox); `txr_2216_outcome_excess_pay_to_address` (text). **No** excess `$` blank |

| Topic | Finding |
|-------|---------|
| Mutual exclusivity | A vs B are exclusive by form wording (“Amount Tendered or Owed”) |
| App support | Hand-drawn checkboxes are independent booleans; fill pipeline can select AcroForm radio groups, but this PDF has **0** AcroForm fields and Map Fields does not enforce exclusive checkbox groups |
| v1 model | Two checkboxes; mapping notes say check one; both start **unchecked** |
| A amount vs balance | Separately entered on the PDF; often equals balance but is its own blank — do not auto-tie in v1 |

---

## 7. Means of Delivery

| Control | Key | Type | Notes |
|---------|-----|------|-------|
| Regular US Mail | `txr_2216_delivery_regular_mail` | checkbox | |
| Certified Mail… | `txr_2216_delivery_certified_mail` | checkbox | |
| Certified No. | `txr_2216_delivery_certified_mail_no` | text | Conditional; blank default |
| Hand delivered | `txr_2216_delivery_hand` | checkbox | |
| to | `txr_2216_delivery_hand_to` | text | |
| on | `txr_2216_delivery_hand_on` | date | |
| by | `txr_2216_delivery_hand_by` | text | |
| Other | `txr_2216_delivery_other_selected` | checkbox | |
| Other text | `txr_2216_delivery_other_text` | text | Conditional; blank default |

- **Exclusivity:** Form does not say “check one.” Model as **independent** checkboxes (same as TXR-2217 practice).  
- **Scope:** Entirely form-scoped `txr_2216_*`.  
- **Do not reuse `txr_2217_delivery_*`:** different notice event; shared Global keys would invite cross-form confusion even though packet_form instances are separate.

---

## 8. Calculation scope (version 1)

| Candidate | Inputs | Formula | Blank amounts | Negatives | Editable | A/B coupling | Arch. support |
|-----------|--------|---------|---------------|-----------|----------|--------------|---------------|
| Balance after deductions | Deposit + 19 item amounts | `deposit − Σ(amounts)` | Treating blank as 0 invents totals mid-entry | Negative balance implies B, not shown as B amount | Must stay editable | Indirect | **No** general calc engine; snapshot immutability blocks open-time rewrite |
| Outcome A refund amount | Balance or same inputs | Often = balance when A & balance ≥ 0 | Same | N/A if forced into A | Must stay editable | Direct — auto-A fights manual B | Same |

**v1 recommendation:** **No calculations; all values manually entered.**  
Keep both as documented future candidates only. Do not prefill A from balance.

---

## 9. Defaults

Confirmed for initial implementation:

- No deduction amount → `0`  
- No narrative → `NA`  
- Neither A nor B preselected  
- No Means of Delivery preselected  
- No dates defaulted  
- No calculated defaults  
- No Personal/Organization form-specific defaults proposed in this phase  

---

## 10. Reconciled counts

### Logical fields (catalog / Map Fields entities)

| Class | Count |
|------|------:|
| Automatic-source | **3** |
| Manual-only | **60** |
| Election / checkbox | **14** |
| Amount / currency | **22** |
| Text (non-amount) | **25** |
| Date | **2** |
| Multiline (approx.) | **16** |
| Calculation candidates (deferred) | **2** |
| Schema changes | **0** |
| **Total logical fields** | **63** |

Checkbox detail (14): item 2 ×4 + item 8 ×4 + A/B ×2 + delivery ×4.  
Currency detail (22): deposit + 19 item amounts + balance + A refund.  
Dates (2): move-out; hand-delivered on.

### PDF placements

| Item | Count |
|------|------:|
| One placement per logical field | 63 |
| Extra `PROPERTY_FULL_ADDRESS` header placements (p2, p3) | +2 |
| **Total anticipated placements** | **65** |
| Ignored signature / signing-date areas | **4** |

### Delta vs discovery baseline (64)

| Change | Effect on logical count |
|--------|-------------------------|
| Remove item (10) description field | **−1** |
| Semantic rename of item keys | 0 (relabel only) |
| Page 2–3 headers as extra placements of existing property field | 0 logical / **+2** placements |
| **Net logical** | **63** (was 64) |
| **Net placements** | **65** (was implicitly ~64 one-per-field) |

---

## Inventory rows changed during review

1. **Removed:** `txr_2216_item_10_description` (no user blank).  
2. **Renamed (recommended):** all `txr_2216_item_NN_*` → semantic keys in §5 table.  
3. **Clarified:** `PROPERTY_FULL_ADDRESS` has **3** placements, still **1** logical field.  
4. **Clarified:** calculations deferred; v1 manual.  
5. **Unchanged recommendations:** reuse of three automatic Globals; manual tenant; no B dollar field; no `txr_2217_*` delivery reuse; no defaults; no schema.

---

## Proposed implementation sequence (do not execute)

1. Lee approves this memo (and any dissent on the decision table).  
2. Create **60** new ACTIVE Global `txr_2216_*` fields (`manual_only`, null path/resolver, no Global defaults).  
3. Reuse **3** existing Globals without metadata edits.  
4. Add **65** ACTIVE mappings on production form **51** via Map Fields; note A/B exclusivity and item 2/8 multi-select in mapping notes.  
5. Leave form **DRAFT**; Lee visually places/reviews before Publish.  
6. No calc code, migrations, PDF replace, storage upload, or packet regeneration.  
7. Optionally mirror to development by stable identity **after** production placement is approved.  
8. Write `TXR_2216_FIELD_IMPLEMENTATION.md` only after apply.

---

## Decisions Lee must approve

1. Reuse `PROPERTY_FULL_ADDRESS`, `AGENT_NAME`, and `BROKERAGE_NAME` as proposed.  
2. Tenant names = **manual-only** for v1.  
3. Item (10) = **amount-only** (no description field).  
4. Pages 2–3 headers = **extra placements** of `PROPERTY_FULL_ADDRESS` (or explicitly leave unmapped).  
5. Use **semantic** `txr_2216_*` keys (not `item_NN_*`).  
6. A/B = two unchecked checkboxes + notes; **no** B dollar field.  
7. Delivery = new `txr_2216_delivery_*` independent checkboxes; **not** `txr_2217_*`.  
8. **No calculations** and **no defaults** in v1.  
9. Proceed to implement **63** logical fields / **65** placements on production form 51 only after this approval.

---

## Confirmation

**No development or production data was modified during this decision review.**  
Read-only checks only: catalog field definitions, mapping counts for the three reuse candidates, local PDF/page renders under `_audit_tmp/`, and inventory/status documents.

---

## Implementation Phase 1 stop (2026-08-05)

Lee authorized production implementation. Pre-write validation confirmed form **51** identity, DRAFT status, PDF checksum match, reuse field sources, and zero `txr_2216%` collisions.

**Hard stop (resolved later same day):** this memo and `TXR_2216_FIELD_INVENTORY.md` did **not** include the exact **65** placement coordinate tuples. Lee then chose **Option 1** (underline/glyph-derived draft placements).

---

## Implementation Option 1 apply (2026-08-05)

### Authorization

Lee authorized deriving **initial draft** Map Fields coordinates from visible underlines, boxes, and checkbox glyphs (same methodology as TXR-2217 / batches 38–50; 612×792 top-origin `y`). Coordinates remain draft pending Lee’s visual review — **not** final human-verified placements.

### Production results

| Item | Result |
|------|--------|
| Form | **51** · `TXR-2216` · `ACTIVE` + **`DRAFT`** · not published |
| PDF | MD5 `599fdccc5c3e551f9360e152d1e50a6a` · **181660** bytes · **unchanged** |
| New fields | **60** ACTIVE Global `txr_2216_*` · `manual_only` · null path/resolver/defaults |
| Reused fields | `PROPERTY_FULL_ADDRESS` `9e2d6525-3f8c-46db-a306-49e7ac5c7051` · `AGENT_NAME` `fcd1089b-47e1-4f03-ae77-a6582b778e09` · `BROKERAGE_NAME` `6427cd73-8d56-4112-9d18-ee3c45d947a5` |
| Placements | **65** ACTIVE (`PROPERTY_FULL_ADDRESS` ×3 with `occurrence_index` 0/1/2) |
| By page | p1 **27** · p2 **21** · p3 **17** |
| Calcs / defaults / resolvers / schema / migrations / PDF / packets / other forms / development | **None** |

### Artifact paths

| Artifact | Path |
|----------|------|
| Geometry extract | `_audit_tmp/txr2216_geometry_extract.json` |
| Initial coordinate manifest | `_audit_tmp/txr2216_initial_placement_manifest.json` |
| Manifest CSV | `_audit_tmp/txr2216_initial_placement_manifest.csv` |
| Apply result (field + mapping IDs) | `_audit_tmp/txr2216_apply_result.json` |
| Phase 6 validation | `_audit_tmp/txr2216_phase6_final_validation.json` |
| Annotated review PDF | `_audit_tmp/txr2216_validation_annotated_full.pdf` |
| Per-page review PDF/PNG | `_audit_tmp/txr2216_validation_page_{1,2,3}.pdf` / `.png` |

Field IDs and mapping IDs are recorded in `_audit_tmp/txr2216_apply_result.json` and `_audit_tmp/txr2216_phase6_final_validation.json` (machine-readable source of truth).

### Coordinate refinements vs raw glyph union

| Change | Detail |
|--------|--------|
| P1 `PROPERTY_FULL_ADDRESS` | Used first-line `x=238.5`, `width=337.5`, `height=28.5` (label-prefixed convention) instead of `min(x0)` across the continuation underline that starts farther left. Applied **before** production write. |
| Post-render edits | **None** after apply |

### Placement confidence / special visual attention

High confidence for most right-column `$` bands and checkbox glyphs. **Extra attention for Lee:**

1. Page 3 Means of Delivery dense rows (`delivery_certified_mail_no`, `delivery_hand_to`, `delivery_hand_on`, `delivery_hand_by`, `delivery_other_text`) — adjacent 14pt boxes with slight vertical adjacency.  
2. Page 3 `AGENT_NAME` / `BROKERAGE_NAME` vs ignored Landlord/By signature lines.  
3. Multiline blocks: damages (1), abandoned property (12), alterations (16), smoking (17), other (19), outcome B pay-to address.  
4. Page 1 property address continuation line vs first-line-only width.  
5. Outcome A refund amount width on page 3.  
6. Item (10) amount-only (no description) and absence of any outcome-B dollar field.

### Scripts used

`scripts/txr2216-extract-geometry.ts`, `txr2216-apply-production.ts` (dry-run then `--apply`), `txr2216-render-validation.ts`, `txr2216-render-annotated-pngs.ts`, `txr2216-phase6-final-validation.ts`.

**Next:** Lee visual Map Fields review. Do **not** publish. Do **not** mirror to development until placements are approved.

