# TXR-1102 Scoped Default Review

**Branch:** `main`
**HEAD:** `9489c368aa0d19231186472baf5fedac0d863e58`
**Database:** `harbaugh-forms-dev`
**Review date:** 2026-07-22
**Mode:** Review completed; **20 approved Lee Personal form-specific defaults implemented** on `harbaugh-forms-dev` (no migration). Conditional/Other/exclusive branches remain blank.

---

## Implementation Update (2026-07-22)

Lee approved and the following were created as Private / Lee / form `#15` / `form_field_mapping_id` null / ACTIVE:

| Group | Count | Values |
|---|---:|---|
| Standalone narrative `NA` (N6/N1) | 12 | see Recommended Personal Defaults |
| Numeric/text preferences | 3 | `30`, `Dallas/Tarrant`, `2` |
| Checked elections | 5 | MLS immediately, keybox yes, intermediary yes, IABS, rent due first day |

**Intentionally not defaulted:** 10 N2/N3/N4 conditional fields; `lease_mls_file_listing`; compensation amounts; rent/deposits/dates/signatures.

**Preserved:** Organization all-forms `LEASE_SCHEDULING_COMPANY` = Broker Bay (no Personal duplicate).

**Safety:** 300 existing TXR-1102 field instances fingerprint-unchanged after creation; ordinary open remains `ensure_missing` insert-only.

---

## Executive Summary

TXR-1102 (**Residential Lease Listing**, form **#15**, version `TXR-1102-01-05-2026`) has **159 ACTIVE mappings** across **11 pages**. After the 2026-07-22 listing-details source cleanup, **90** mapped fields are `manual_only` / Not connected; **29** remain genuine Property/Client/Agent/Brokerage sources; **40** are `custom_resolver` election/composite fields (mostly inert).

**Existing scoped coverage on this form is thin:**
- Lee form-specific Private defaults for TXR-1102: **0**
- Organization form-specific defaults for TXR-1102: **0**
- Applicable all-forms Organization default: **`LEASE_SCHEDULING_COMPANY` = Broker Bay**
- Lee legacy all-forms Private defaults exist globally (**56**) but almost none key-match TXR-1102 lease fields

Former `listing_agreement_details` schema defaults (`NA`, `0`, `true`/`false`, BrokerBay, Dallas/Tarrant, …) **never reached packets** (allowlist gaps + unlinked packets). They are **not** approved scoped defaults.

**Classification totals (159 active mappings) — revised after N1–N6 text-field review:**

| Class | Count | Meaning |
|---|---:|---|
| D1 Keep blank | 53 | No scoped default (includes former medium/high NA candidates reclassified blank/conditional) |
| D2 Lee Personal form-specific | 12 | Create TXR-1102 Private `NA` only for true N6/N1 standalones |
| D3 Lee Personal all-forms | 0 | Use/keep legacy all-forms |
| D4 Organization form-specific | 0 | Create org TXR-1102 default |
| D5 Organization all-forms | 1 | Keep proven office-wide rule |
| D6 Automatic-source candidate | 33 | Upstream object, not a preference |
| D7 Manual unchecked checkbox | 51 | No checked default |
| D8 Manual checked checkbox | 0 | Checked default candidate |
| U Lee decision required | 9 | Ambiguous |

**Smallest next implementation after Lee marks this checklist:** create only the approved **12 N6/N1 `NA`** Personal form-specific defaults (not the 10 election/conditional blanks) via Map Fields — no migration required.

---

## Form Identity

| Attribute | Value |
|---|---|
| Form ID | **15** |
| Form code | `TXR-1102` |
| Full name | Residential Lease Listing |
| Version | `TXR-1102-01-05-2026` |
| Scope / status | GLOBAL / ACTIVE |
| PDF storage | `global/forms/15/ResidentialLeaseListing.pdf` |
| Page count (mapped) | **11** (pages 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11) |
| ACTIVE mappings | **159** |
| Inactive mappings | **2** |
| Packet forms | **2** (1 ACTIVE DRAFT, 1 DELETED DRAFT) |
| Packets | #19 ACTIVE listing; #15 DELETED listing; both `representation_agreement_id = null`, `collection_id = 5` |
| AcroForm-named mappings | **0** (no mapping names/notes labeled AcroForm; template may still contain AcroForm widgets in the PDF binary — not imported as catalog fields for this form) |

---

## Current Defaults

Global ACTIVE `field_defaults` snapshot used for this review:

| Scope | Count |
|---|---:|
| All ACTIVE defaults | 81 |
| Lee Private (all) | 77 |
| Lee Private all-forms (`form_id IS NULL`) | 56 |
| Lee Private form-specific TXR-1102 | **0** |
| Organization (all) | 4 |
| Organization form-specific TXR-1102 | **0** |

**Defaults that currently apply on TXR-1102 mappings:**

- `LEASE_SCHEDULING_COMPANY` — Organization all-forms **Broker Bay** (already live)
- No other TXR-1102-mapped fields have a form-specific Lee or Organization default today
- Analogous Lee all-forms checked defaults on **other forms** (IABS, keybox, intermediary, MLS file immediately, financing) do **not** automatically attach to the distinct TXR-1102 field keys

---

## Former Schema Defaults

Introduced mainly by `20260630180000_listing_agreement_details_txr_1102_lease_expansion.sql` (+ dates/day in `20260701150000`). Among mapped fields that formerly targeted listing-details columns:

| Former kind | Approx. mapped-field count |
|---|---:|
| 0 | 33 |
| NA | 22 |
| false | 15 |
| blank/null | 6 |
| true | 3 |
| text:30 | 1 |
| Dallas/Tarrant text | 1 |
| BrokerBay text | 1 |
| text:2 | 1 |

**Important:**
- Almost none of these paths were in the resolver allowlist → **never resolvable**
- Packet `source='packet'` count on these fields: **0**
- Real TXR-1102 packets show mostly `empty` / manual values — schema surrogates did not initialize Fill Form
- Therefore former DB defaults are **historical hints only**, not approved scoped defaults

---

## Form Semantics Notes

Recommendations below use mapped field labels/keys, former schema defaults, established Harbaugh Forms preferences (`NA` for inapplicable free text, blank for transaction economics, unchecked elections unless Lee has chosen checked), and live packet evidence. The TXR-1102 PDF binary lives at storage path `global/forms/15/ResidentialLeaseListing.pdf` (not vendored in the repo); mapped coordinates span pages **1–11**.

**Workflow / completion risks (not legal conclusions):**
- Prefilling `NA` is appropriate only for true standalone exception/provision blanks (N1/N6) — not for unselected alternatives or unchecked “Other” text (N2–N4).
- Prefilling `0` on compensation or deposit amounts can assert “none” when the intended meaning is still undecided — prefer blank (N5) unless Lee chooses Group B.
- Checking addendum / MLS / keybox / intermediary boxes can assert attachments or brokerage elections that should be intentional.
- Leaving blank on dates, rent, deposits, parties, and unselected compensation branches preserves “not yet decided.”
- Unchecked checkboxes usually mean “no / not selected” until Fill Form.
- See **N1–N6 Text-Field Context Review** for the 22 former NA-candidate reclassifications.

---

## N1–N6 Text-Field Context Review (22 former NA candidates)

**Rule:** Do not assume every empty text field should receive `NA`. Blank is intentional when the field is part of an unselected alternative, an unchecked “Other” election, or a conditional explanation.

**Form-text source note:** Paragraph numbers/headings below follow the TXR-1102 Residential Lease Listing structure as reflected in mapped field placement (`TXR-1102-01-05-2026`). Printed wording is taken from the published Exclusive Right to Lease form family (Broker Compensation alternatives, Make Ready (a)/(b), Landlord Representations except-blanks, Lease Requirements). The January 2026 revision reworked ¶5 compensation language; with-coop vs no-coop model branches are present in the live mappings (`lease_comp_with_other_broker` / no-coop fields).

| Code | Meaning | Typical default |
|---|---|---|
| N1 | Standalone narrative provision | `NA` |
| N2 | Conditional explanation (only if trigger selected) | blank / conditional |
| N3 | “Other” description tied to Other checkbox | blank while Other unchecked |
| N4 | Mutually exclusive alternative branch | blank until that branch is selected |
| N5 | Amount / percent / date / count / factual value | blank unless Lee approved a specific value |
| N6 | True standalone exception/provision (not tied to unselected alternative) | `NA` |

### Revised outcomes for the 22 fields

- **Still recommend Personal form-specific `NA` (12):** `lease_non_real_estate_items`, `lease_listing_exclusions`, `lease_reimbursable_expenses`, `lease_known_financial_obligations_exception`, `lease_known_liens_exception`, `lease_optional_common_area_fees_exception`, `lease_health_safety_condition_exception`, `lease_special_provisions`, `lease_tenant_utilities_except`, `lease_items_not_repaired`, `lease_requirements_special_provisions`, `lease_requirements_other`
- **Revised to blank / conditional (10):** `lease_broker_fee_other (N3→blank)`, `lease_no_coop_other (N3→blank)`, `lease_renewal_other (N3→blank)`, `lease_sale_comp_other (N3→blank)`, `lease_mls_delayed_purpose (N2→conditional)`, `lease_make_ready_direct_service_fee (N2→blank)`, `lease_make_ready_reimbursement_service_fee (N2→blank)`, `lease_add_other_document_description (N3→blank)`, `lease_rent_due_other (N3→blank)`, `lease_animal_restrictions (N2→conditional)`

### Decision table (PDF order)

| Page | Paragraph | Field key | Form context | Trigger/election | Exclusive branch? | Original group | N-class | Recommendation | Reason |
| ---- | --------- | --------- | ------------ | ---------------- | ----------------- | -------------- | ------- | -------------- | ------ |
| 1 | ¶2B Non-Real Estate Items | `lease_non_real_estate_items` | “Landlord instructs Broker to market the Property with … and the following non-real estate items:” | None | No | high-confidence NA | N6 | NA | Standalone list blank; NA = none |
| 1 | ¶2C Exclusions | `lease_listing_exclusions` | “Landlord will remove the following:” | None | No | high-confidence NA | N6 | NA | Standalone exclusions; NA = none |
| 2 | ¶5A Broker Compensation (3) | `lease_broker_fee_other` | Listing-broker fee alternatives (1)% one month / (2)% all rents / (3) Other text | `lease_broker_fee_other_selected` | Yes — vs (1)/(2) | medium-confidence NA | N3 | blank | Other description only if Other selected; do not NA-fill unselected alt |
| 2 | ¶5 Broker Compensation — no-coop (3) | `lease_no_coop_other` | No-coop compensation alternatives (1)/(2)/(3) Other | `lease_no_coop_other_selected` (+ no-coop model) | Yes — vs no-coop (1)/(2) and vs with-coop model | medium-confidence NA | N3 | blank | Unselected no-coop/Other branch must stay blank |
| 3 | ¶5D(1) Compensation for Renewal (c) | `lease_renewal_other` | Renewal (a)% one month / (b)% all rents / (c) Other | `lease_renewal_other_selected` | Yes — vs (a)/(b) | medium-confidence NA | N3 | blank | Other text only if (c) selected |
| 3 | ¶5D(2) Compensation for a Sale (ii) | `lease_sale_comp_other` | Sale (i)% of sales price / (ii) Other | `lease_sale_comp_other_selected` | Yes — vs (i) | medium-confidence NA | N3 | blank | Other text only if (ii) selected |
| 3 | ¶5 Reimbursable Expenses | `lease_reimbursable_expenses` | Standalone reimbursable-expenses narrative under Broker Compensation | None | No | high-confidence NA | N6 | NA | Standalone provision; NA = none |
| 4 | ¶6A Listing Services — delayed filing | `lease_mls_delayed_purpose` | Delayed MLS filing “for the following purpose(s):” | `lease_mls_delay_filing` (+ days) | Yes — vs File Immediately / No MLS | high-confidence NA | N2 | conditional | Purpose only if delay elected; NA would partially complete delay branch |
| 7 | ¶11D Make Ready (2)(a) | `lease_make_ready_direct_service_fee` | Landlord pays contractors … service fee of ___ | Make Ready authorized + `lease_make_ready_landlord_pays_contractors` | Yes — vs (2)(b) reimbursed | medium-confidence NA | N2 | blank | Fee blank until (a) branch selected |
| 7 | ¶11D Make Ready (2)(b) | `lease_make_ready_reimbursement_service_fee` | Reimburse Broker … service fee of ___ | Make Ready authorized + `lease_make_ready_broker_reimbursed` | Yes — vs (2)(a) | medium-confidence NA | N2 | blank | Fee blank until (b) branch selected |
| 7 | ¶12 Landlord’s Representations (financial) | `lease_known_financial_obligations_exception` | “…current … except ___” | None | No | high-confidence NA | N6 | NA | Standalone except-blank; NA = no exception |
| 7 | ¶12 Landlord’s Representations (liens) | `lease_known_liens_exception` | “…not aware of any liens … except ___” | None | No | high-confidence NA | N6 | NA | Standalone except-blank; NA = no exception |
| 7 | ¶12 Landlord’s Representations (common areas) | `lease_optional_common_area_fees_exception` | “…no optional user fees … except ___” | None | No | high-confidence NA | N6 | NA | Standalone except-blank; NA = no exception |
| 7 | ¶12 Landlord’s Representations (health/safety) | `lease_health_safety_condition_exception` | “…not aware of a condition … except ___” | None | No | high-confidence NA | N6 | NA | Standalone except-blank; NA = no exception |
| 8 | Special Provisions | `lease_special_provisions` | Standalone Special Provisions narrative | None | No | high-confidence NA | N6 | NA | Standalone provision; NA = none |
| 9 | ¶19 Addenda — Other | `lease_add_other_document_description` | Other addendum/document blank after Other checkbox | `lease_add_other_document` | No (but gated) | high-confidence NA | N3 | blank | Blank while Other unchecked; if checked require real description, not NA |
| 9 | ¶20A Monthly Rent due | `lease_rent_due_other` | Rent due first day vs Other ___ | `lease_rent_due_other_selected` | Yes — vs first-day | medium-confidence NA | N3 | blank | Other due-date text only if Other selected |
| 9 | ¶20C Pets | `lease_animal_restrictions` | “permitted with the following restrictions …” | `lease_animals_permitted` | Yes — vs not permitted | high-confidence NA | N2 | conditional | Restrictions only if permitted |
| 9 | ¶20E Utilities | `lease_tenant_utilities_except` | “All utilities to be paid by Tenant except:” | None | No | high-confidence NA | N6 | NA | Standalone except-blank; NA = no exceptions |
| 10 | ¶20M Repairs | `lease_items_not_repaired` | “Appliances or items that will not be repaired:” | None | No | high-confidence NA | N6 | NA | Standalone list; NA = none |
| 10 | ¶20N Special Provisions | `lease_requirements_special_provisions` | Lease-requirements Special Provisions narrative | None | No | high-confidence NA | N6 | NA | Standalone provision; NA = none |
| 10 | ¶20P Other | `lease_requirements_other` | “Other:” catch-all line (no Other checkbox) | None | No | high-confidence NA | N6 | NA | Standalone narrative; NA = none |

### Broker Compensation paragraph — inconsistency risks

Paragraph **5** (and its with-coop / no-coop model branches) contains multiple mutually exclusive (1)/(2)/(3) and (a)/(b)/(c) sets:

| Risk if defaulted | Fields |
|---|---|
| Prefilling `NA` into an unselected **Other** line | `lease_broker_fee_other`, `lease_no_coop_other`, `lease_renewal_other`, `lease_sale_comp_other` |
| Prefilling `0` into unselected % / $ alternatives | `lease_broker_fee_*_percent`, `lease_other_broker_*`, `lease_no_coop_*_percent`, `lease_renewal_*_percent`, `lease_sale_comp_percent` — **keep blank** (already D1/N5) |
| Checking more than one alternative in a set | All `*_selected` compensation checkboxes — **keep unchecked** (D7) |
| Completing both with-coop and no-coop models | Other-broker amounts + no-coop amounts — **keep blank/unchecked** until model chosen |
| Asserting Make Ready fee on both (a) and (b) | `lease_make_ready_direct_service_fee` + `lease_make_ready_reimbursement_service_fee` — **keep blank** |

**Conclusion:** Former schema `NA`/`0` on compensation alternatives were surrogates only. Under N1–N6, **no** compensation alternative text or amount should receive a scoped default.


---

## Page-by-Page Review

### Page 1

- [ ] `landlord_name_1` — Page 1 — Landlord Name 1
  - Current Filled from: Client
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×1, contact_role×1)
  - Recommendation: Keep automatic source (packet_contact → landlord_1.full_name); no preference default
  - Confidence: High
  - Class: **D6** · Group G
  - Note: Genuine upstream object already configured
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `landlord_name_2` — Page 1 — Landlord Name 2
  - Current Filled from: Client
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep automatic source (packet_contact → landlord_2.full_name); no preference default
  - Confidence: High
  - Class: **D6** · Group G
  - Note: Genuine upstream object already configured
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `landlord_address` — Page 1 — Landlord Address
  - Current Filled from: Custom form data
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Automatic-source candidate — landlord address should come from Client/contact, not a preference default; keep blank until resolver/source is fixed
  - Confidence: Medium
  - Class: **D6** · Group G
  - Note: resolver_key=landlord_address; no implemented listing-details dependency found
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `landlord_city_state_zip` — Page 1 — Landlord City State Zip
  - Current Filled from: Custom form data
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×1, contact_role×1)
  - Recommendation: Automatic-source candidate — landlord address should come from Client/contact, not a preference default; keep blank until resolver/source is fixed
  - Confidence: Medium
  - Class: **D6** · Group G
  - Note: resolver_key=landlord_city_state_zip; no implemented listing-details dependency found
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `landlord_phone` — Page 1 — Landlord Phone
  - Current Filled from: Client
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep automatic source (packet_contact → landlord_1.phone); no preference default
  - Confidence: High
  - Class: **D6** · Group G
  - Note: Genuine upstream object already configured
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `landlord_email` — Page 1 — Landlord Email
  - Current Filled from: Client
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep automatic source (packet_contact → landlord_1.email); no preference default
  - Confidence: High
  - Class: **D6** · Group G
  - Note: Genuine upstream object already configured
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `BROKERAGE_NAME` — Page 1 — Brokerage Name
  - Current Filled from: Brokerage
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (settings×2)
  - Recommendation: Keep automatic source (settings_brokerage → brokerage_name); no preference default
  - Confidence: High
  - Class: **D6** · Group G
  - Note: Genuine upstream object already configured
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `brokerage_address` — Page 1 — Brokerage Address
  - Current Filled from: Brokerage
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (settings×2)
  - Recommendation: Keep automatic source (settings_brokerage → brokerage_address); no preference default
  - Confidence: High
  - Class: **D6** · Group G
  - Note: Genuine upstream object already configured
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `BROKERAGE_CITY_STATE_ZIP` — Page 1 — Brokerage City, State, Zip
  - Current Filled from: Brokerage
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (settings×2)
  - Recommendation: Keep automatic source (settings_brokerage → brokerage_city_state_zip); no preference default
  - Confidence: High
  - Class: **D6** · Group G
  - Note: Genuine upstream object already configured
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `brokerage_office_phone` — Page 1 — Brokerage Office Phone
  - Current Filled from: Brokerage
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (settings×2)
  - Recommendation: Keep automatic source (settings_brokerage → brokerage_office_phone); no preference default
  - Confidence: High
  - Class: **D6** · Group G
  - Note: Genuine upstream object already configured
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `brokerage_email` — Page 1 — Brokerage Email
  - Current Filled from: Brokerage
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (settings×2)
  - Recommendation: Keep automatic source (settings_brokerage → brokerage_email); no preference default
  - Confidence: High
  - Class: **D6** · Group G
  - Note: Genuine upstream object already configured
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `PROPERTY_BLOCK` — Page 1 — Property Block
  - Current Filled from: Property
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (property×1, empty×1)
  - Recommendation: Keep automatic source (packet_property → block); no preference default
  - Confidence: High
  - Class: **D6** · Group G
  - Note: Genuine upstream object already configured
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `PROPERTY_LOT` — Page 1 — Property Lot
  - Current Filled from: Property
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (property×1, empty×1)
  - Recommendation: Keep automatic source (packet_property → lot); no preference default
  - Confidence: High
  - Class: **D6** · Group G
  - Note: Genuine upstream object already configured
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `PROPERTY_ADDITION` — Page 1 — Property Addition
  - Current Filled from: Property
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (property×1, empty×1)
  - Recommendation: Keep automatic source (packet_property → subdivision); no preference default
  - Confidence: High
  - Class: **D6** · Group G
  - Note: Genuine upstream object already configured
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `PROPERTY_CITY` — Page 1 — Property City
  - Current Filled from: Property
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (property×2)
  - Recommendation: Keep automatic source (packet_property → city); no preference default
  - Confidence: High
  - Class: **D6** · Group G
  - Note: Genuine upstream object already configured
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `property_county` — Page 1 — Property County
  - Current Filled from: Property
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (property×2)
  - Recommendation: Keep automatic source (packet_property → county); no preference default
  - Confidence: High
  - Class: **D6** · Group G
  - Note: Genuine upstream object already configured
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `PROPERTY_ADDRESS_ZIP` — Page 1 — Property ZIP
  - Current Filled from: Property
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (property×2)
  - Recommendation: Keep automatic source (packet_property → address_city_state_zip); no preference default
  - Confidence: High
  - Class: **D6** · Group G
  - Note: Genuine upstream object already configured
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_non_real_estate_items` — Page 1 — Lease Non Real Estate Items
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `NA` on `non_real_estate_items`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Lee Personal, form-specific `NA` (N6 standalone exception/provision)
  - Confidence: High
  - Class: **D2** · Group A
  - Note: Former schema NA
  - N-class: **N6** → recommended default: **NA**
  - N-reason: ¶2B free-text list; blank is ambiguous; NA means no non-real-estate items to list
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_listing_exclusions` — Page 1 — Lease Listing Exclusions
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `NA` on `lease_listing_exclusions`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Lee Personal, form-specific `NA` (N6 standalone exception/provision)
  - Confidence: High
  - Class: **D2** · Group A
  - Note: Former schema NA
  - N-class: **N6** → recommended default: **NA**
  - N-reason: ¶2C exclusions blank; NA means no exclusions
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_hoa_is_subject` — Page 1 — Lease HOA Is Subject
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `(none)` on `hoa_exists`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Automatic-source candidate (property HOA) — keep blank for now (no property_hoas remapping this wave)
  - Confidence: Medium
  - Class: **D6** · Group G
  - Note: Lee deferred HOA remapping; blank until Property/HOA review
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_hoa_is_not_subject` — Page 1 — Lease HOA Is Not Subject
  - Current Filled from: Custom form data
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Automatic-source / inverse-HOA candidate — keep blank until Property HOA review; do not create a preference default
  - Confidence: Medium
  - Class: **D6** · Group G
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_monthly_rent` — Page 1 — Lease Monthly Rent
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `0` on `monthly_rent`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — core transaction economics / terms
  - Confidence: High
  - Class: **D1** · Group F
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_term_max_months` — Page 1 — Lease Term Max Months
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `0` on `lease_term_max_months`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — core transaction economics / terms
  - Confidence: High
  - Class: **D1** · Group F
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_term_min_months` — Page 1 — Lease Term Min Months
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `0` on `lease_term_min_months`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — core transaction economics / terms
  - Confidence: High
  - Class: **D1** · Group F
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_listing_end_date` — Page 1 — Lease Listing End Date
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `(none)` on `lease_listing_end_date`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — per-transaction listing term dates
  - Confidence: High
  - Class: **D1** · Group F
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_listing_begin_date` — Page 1 — Lease Listing Begin Date
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `(none)` on `lease_listing_begin_date`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — per-transaction listing term dates
  - Confidence: High
  - Class: **D1** · Group F
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

### Page 2

- [ ] `LEASE_LISTING_CONCERNING` — Page 2 — Lease Listing Concerning
  - Current Filled from: Property
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (property×2)
  - Recommendation: Keep automatic source (packet_property → full_address); no preference default
  - Confidence: High
  - Class: **D6** · Group G
  - Note: Genuine upstream object already configured
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_broker_fee_one_month_percent` — Page 2 — Lease Broker Fee One Month Percent
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `0` on `broker_fee_one_month_percent`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — transaction-specific amount (former schema `0` was a surrogate, not an approved scoped default)
  - Confidence: High
  - Class: **D1** · Group F
  - Note: Former schema default 0; creating Personal 0 would assert 'none' on future packets
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_broker_fee_one_month_selected` — Page 2 — Lease Broker Fee One Month Selected
  - Current Filled from: Custom form data
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual election checkbox — keep unchecked (no scoped default); mutually exclusive or transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: custom_resolver lease_broker_fee_one_month_selected is effectively inert / election UI
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_broker_fee_all_rents_percent` — Page 2 — Lease Broker Fee All Rents Percent
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `0` on `broker_fee_all_rents_percent`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — transaction-specific amount (former schema `0` was a surrogate, not an approved scoped default)
  - Confidence: High
  - Class: **D1** · Group F
  - Note: Former schema default 0; creating Personal 0 would assert 'none' on future packets
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_broker_fee_all_rents_selected` — Page 2 — Lease Broker Fee All Rents Selected
  - Current Filled from: Custom form data
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual election checkbox — keep unchecked (no scoped default); mutually exclusive or transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: custom_resolver lease_broker_fee_all_rents_selected is effectively inert / election UI
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_broker_fee_other` — Page 2 — Lease Broker Fee Other
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `NA` on `broker_fee_other`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — N3/N4 Other alternative under Broker Compensation ¶5A(3)
  - Confidence: High
  - Class: **D1** · Group F
  - Note: Former schema NA
  - N-class: **N3** → recommended default: **blank**
  - N-reason: Tied to lease_broker_fee_other_selected; mutually exclusive with (1)/(2); do not prefill NA
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_broker_fee_other_selected` — Page 2 — Lease Broker Fee Other Selected
  - Current Filled from: Custom form data
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual election checkbox — keep unchecked (no scoped default); mutually exclusive or transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: custom_resolver lease_broker_fee_other_selected is effectively inert / election UI
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_other_broker_one_month_selected` — Page 2 — Lease Other Broker One Month Selected
  - Current Filled from: Custom form data
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual election checkbox — keep unchecked (no scoped default); mutually exclusive or transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: custom_resolver lease_other_broker_one_month_selected is effectively inert / election UI
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_other_broker_one_month_percent` — Page 2 — Lease Other Broker One Month Percent
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `0` on `other_broker_one_month_percent`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — transaction-specific amount (former schema `0` was a surrogate, not an approved scoped default)
  - Confidence: High
  - Class: **D1** · Group F
  - Note: Former schema default 0; creating Personal 0 would assert 'none' on future packets
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_other_broker_all_rents_selected` — Page 2 — Lease Other Broker All Rents Selected
  - Current Filled from: Custom form data
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual election checkbox — keep unchecked (no scoped default); mutually exclusive or transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: custom_resolver lease_other_broker_all_rents_selected is effectively inert / election UI
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_other_broker_all_rents_percent` — Page 2 — Lease Other Broker All Rents Percent
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `0` on `other_broker_all_rents_percent`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — transaction-specific amount (former schema `0` was a surrogate, not an approved scoped default)
  - Confidence: High
  - Class: **D1** · Group F
  - Note: Former schema default 0; creating Personal 0 would assert 'none' on future packets
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_other_broker_flat_fee_selected` — Page 2 — Lease Other Broker Flat Fee Selected
  - Current Filled from: Custom form data
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual election checkbox — keep unchecked (no scoped default); mutually exclusive or transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: custom_resolver lease_other_broker_flat_fee_selected is effectively inert / election UI
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_other_broker_flat_fee` — Page 2 — Lease Other Broker Flat Fee
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `0` on `other_broker_flat_fee`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — transaction-specific amount (former schema `0` was a surrogate, not an approved scoped default)
  - Confidence: High
  - Class: **D1** · Group F
  - Note: Former schema default 0; creating Personal 0 would assert 'none' on future packets
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_no_coop_one_month_percent` — Page 2 — Lease No Coop One Month Percent
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: (column unknown / null path)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — transaction-specific amount
  - Confidence: Medium
  - Class: **D1** · Group F
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_no_coop_one_month_selected` — Page 2 — Lease No Coop One Month Selected
  - Current Filled from: Custom form data
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual election checkbox — keep unchecked (no scoped default); mutually exclusive or transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: custom_resolver lease_no_coop_one_month_selected is effectively inert / election UI
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_no_coop_all_rents_selected` — Page 2 — Lease No Coop All Rents Selected
  - Current Filled from: Custom form data
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual election checkbox — keep unchecked (no scoped default); mutually exclusive or transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: custom_resolver lease_no_coop_all_rents_selected is effectively inert / election UI
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_no_coop_all_rents_percent` — Page 2 — Lease No Coop All Rents Percent
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: (column unknown / null path)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — transaction-specific amount
  - Confidence: Medium
  - Class: **D1** · Group F
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_no_coop_other` — Page 2 — Lease No Coop Other
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: (column unknown / null path)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — N3/N4 Other alternative in no-coop compensation branch
  - Confidence: High
  - Class: **D1** · Group F
  - Note: Former schema NA
  - N-class: **N3** → recommended default: **blank**
  - N-reason: Tied to lease_no_coop_other_selected; only complete if that exclusive branch and Other are chosen
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_no_coop_other_selected` — Page 2 — Lease No Coop Other Selected
  - Current Filled from: Custom form data
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual election checkbox — keep unchecked (no scoped default); mutually exclusive or transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: custom_resolver lease_no_coop_other_selected is effectively inert / election UI
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

### Page 3

- [ ] `LEASE_LISTING_CONCERNING` — Page 3 — Lease Listing Concerning
  - Current Filled from: Property
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (property×2)
  - Recommendation: Keep automatic source (packet_property → full_address); no preference default
  - Confidence: High
  - Class: **D6** · Group G
  - Note: Genuine upstream object already configured
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_renewal_one_month_selected` — Page 3 — Lease Renewal One Month Selected
  - Current Filled from: Custom form data
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual election checkbox — keep unchecked (no scoped default); mutually exclusive or transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: custom_resolver lease_renewal_one_month_selected is effectively inert / election UI
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_renewal_one_month_percent` — Page 3 — Lease Renewal One Month Percent
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `0` on `renewal_one_month_percent`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — transaction-specific amount (former schema `0` was a surrogate, not an approved scoped default)
  - Confidence: High
  - Class: **D1** · Group F
  - Note: Former schema default 0; creating Personal 0 would assert 'none' on future packets
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_renewal_all_rents_selected` — Page 3 — Lease Renewal All Rents Selected
  - Current Filled from: Custom form data
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual election checkbox — keep unchecked (no scoped default); mutually exclusive or transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: custom_resolver lease_renewal_all_rents_selected is effectively inert / election UI
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_renewal_all_rents_percent` — Page 3 — Lease Renewal All Rents Percent
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `0` on `renewal_all_rents_percent`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — transaction-specific amount (former schema `0` was a surrogate, not an approved scoped default)
  - Confidence: High
  - Class: **D1** · Group F
  - Note: Former schema default 0; creating Personal 0 would assert 'none' on future packets
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_renewal_other_selected` — Page 3 — Lease Renewal Other Selected
  - Current Filled from: Custom form data
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual election checkbox — keep unchecked (no scoped default); mutually exclusive or transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: custom_resolver lease_renewal_other_selected is effectively inert / election UI
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_renewal_other` — Page 3 — Lease Renewal Other
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `NA` on `renewal_other`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — N3/N4 renewal compensation alternative (c)
  - Confidence: High
  - Class: **D1** · Group F
  - Note: Former schema NA
  - N-class: **N3** → recommended default: **blank**
  - N-reason: Mutually exclusive with renewal % of one month / all rents; Other description only if selected
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_sale_comp_percent_selected` — Page 3 — Lease Sale Comp Percent Selected
  - Current Filled from: Custom form data
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual election checkbox — keep unchecked (no scoped default); mutually exclusive or transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: custom_resolver lease_sale_comp_percent_selected is effectively inert / election UI
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_sale_comp_percent` — Page 3 — Lease Sale Comp Percent
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `0` on `sale_compensation_percent`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — transaction-specific amount (former schema `0` was a surrogate, not an approved scoped default)
  - Confidence: High
  - Class: **D1** · Group F
  - Note: Former schema default 0; creating Personal 0 would assert 'none' on future packets
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_sale_comp_other` — Page 3 — Lease Sale Comp Other
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `NA` on `sale_compensation_other`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — N3/N4 sale compensation alternative (ii)
  - Confidence: High
  - Class: **D1** · Group F
  - Note: Former schema NA
  - N-class: **N3** → recommended default: **blank**
  - N-reason: Mutually exclusive with sale %; Other description only if selected
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_sale_comp_other_selected` — Page 3 — Lease Sale Comp Other Selected
  - Current Filled from: Custom form data
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual election checkbox — keep unchecked (no scoped default); mutually exclusive or transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: custom_resolver lease_sale_comp_other_selected is effectively inert / election UI
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_reimbursable_expenses` — Page 3 — Lease Reimbursable Expenses
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `NA` on `reimbursable_expenses`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Lee Personal, form-specific `NA` (N6 standalone provision)
  - Confidence: High
  - Class: **D2** · Group A
  - Note: Former schema NA
  - N-class: **N6** → recommended default: **NA**
  - N-reason: Standalone reimbursable-expenses narrative; NA means none
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_protection_period_days` — Page 3 — Lease Protection Period Days
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `30` on `lease_protection_period_days`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Former schema 30; Lee has all-forms Personal 30 on PROTECTION_PERIOD_DAYS (different field key) — form-specific 30, blank, or discuss?
  - Confidence: Medium
  - Class: **U** · Group H
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_payment_county` — Page 3 — Lease Payment County
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `Dallas/Tarrant` on `lease_payment_county`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Former schema Dallas/Tarrant; Lee has all-forms Personal on PAYMENT_COUNTY (different field key) — create form-specific Personal Dallas/Tarrant, keep blank, or discuss?
  - Confidence: Medium
  - Class: **U** · Group H
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

### Page 4

- [ ] `LEASE_LISTING_CONCERNING` — Page 4 — Lease Listing Concerning
  - Current Filled from: Property
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (property×2)
  - Recommendation: Keep automatic source (packet_property → full_address); no preference default
  - Confidence: High
  - Class: **D6** · Group G
  - Note: Genuine upstream object already configured
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_mls_file_listing` — Page 4 — Lease MLS File Listing
  - Current Filled from: Custom form data
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Lee has all-forms checked defaults on analogous TXR-1101 MLS fields — create TXR-1102 Personal checked defaults, reuse all-forms, or keep unchecked?
  - Confidence: Medium
  - Class: **U** · Group H
  - Note: resolver_key=lease_mls_file_listing
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_mls_file_immediately` — Page 4 — Lease MLS File Immediately
  - Current Filled from: Custom form data
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Lee has all-forms checked defaults on analogous TXR-1101 MLS fields — create TXR-1102 Personal checked defaults, reuse all-forms, or keep unchecked?
  - Confidence: Medium
  - Class: **U** · Group H
  - Note: resolver_key=lease_mls_file_immediately
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_mls_delayed_days` — Page 4 — Lease MLS Delayed Days
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `0` on `lease_mls_delayed_days`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — transaction-specific amount
  - Confidence: Medium
  - Class: **D1** · Group F
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_mls_delay_filing` — Page 4 — Lease MLS Delay Filing
  - Current Filled from: Custom form data
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual election checkbox — keep unchecked (no scoped default); mutually exclusive or transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: custom_resolver lease_mls_delay_filing is effectively inert / election UI
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_mls_delayed_purpose` — Page 4 — Lease MLS Delayed Purpose
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `NA` on `lease_mls_delayed_purpose`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank / conditional — N2 only when delayed MLS filing is selected
  - Confidence: High
  - Class: **D1** · Group F
  - Note: Former schema NA
  - N-class: **N2** → recommended default: **conditional**
  - N-reason: Completing purpose while File Immediately or No MLS is chosen partially fills an unselected alternative
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_mls_no_filing` — Page 4 — Lease MLS No Filing
  - Current Filled from: Custom form data
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual election checkbox — keep unchecked (no scoped default); mutually exclusive or transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: custom_resolver lease_mls_no_filing is effectively inert / election UI
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

### Page 5

- [ ] `LEASE_LISTING_CONCERNING` — Page 5 — Lease Listing Concerning
  - Current Filled from: Property
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (property×2)
  - Recommendation: Keep automatic source (packet_property → full_address); no preference default
  - Confidence: High
  - Class: **D6** · Group G
  - Note: Genuine upstream object already configured
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `LEASE_SCHEDULING_COMPANY` — Page 5 — Lease Scheduling Company
  - Current Filled from: Not connected
  - Current default: Broker Bay (Organization — applies to all forms)
  - Former schema default: `BrokerBay` on `lease_scheduling_company`
  - Historical packet use: 2 (field_default×1, manual_override+ovr×1)
  - Recommendation: Keep existing Organization all-forms default (Broker Bay)
  - Confidence: High
  - Class: **D5** · Group E
  - Note: Scoped default already present — do not duplicate
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_keybox_authorized_yes` — Page 5 — Lease Keybox Authorized Yes
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `true` on `lease_keybox_authorized`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Mirrors TXR-1101 KEYBOX_AUTHORIZED_YES (Lee all-forms checked), but TXR-1102 packets are currently unchecked — Approve Personal checked, keep blank, or discuss?
  - Confidence: Medium
  - Class: **U** · Group H
  - Note: Former schema default true
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_keybox_authorized_no` — Page 5 — Lease Keybox Authorized No
  - Current Filled from: Custom form data
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual election checkbox — keep unchecked (no scoped default); mutually exclusive or transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: custom_resolver lease_keybox_authorized_no is effectively inert / election UI
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_intermediary_yes` — Page 5 — Lease Intermediary Yes
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: TXR-1101 LISTING_INTERMEDIARY_YES has Lee all-forms checked — create analogous lease Personal checked, leave unchecked, or discuss?
  - Confidence: Medium
  - Class: **U** · Group H
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

### Page 6

- [ ] `LEASE_LISTING_CONCERNING` — Page 6 — Lease Listing Concerning
  - Current Filled from: Property
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (property×2)
  - Recommendation: Keep automatic source (packet_property → full_address); no preference default
  - Confidence: High
  - Class: **D6** · Group G
  - Note: Genuine upstream object already configured
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_intermediary_no` — Page 6 — Lease Intermediary No
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual checkbox, unchecked — mutually exclusive / transaction-specific election
  - Confidence: High
  - Class: **D7** · Group C
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_internet_no_display` — Page 6 — Lease Internet No Display
  - Current Filled from: Custom form data
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual election checkbox — keep unchecked (no scoped default); mutually exclusive or transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: custom_resolver lease_internet_no_display is effectively inert / election UI
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_internet_no_address_display` — Page 6 — Lease Internet No Address Display
  - Current Filled from: Custom form data
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual election checkbox — keep unchecked (no scoped default); mutually exclusive or transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: custom_resolver lease_internet_no_address_display is effectively inert / election UI
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

### Page 7

- [ ] `LEASE_LISTING_CONCERNING` — Page 7 — Lease Listing Concerning
  - Current Filled from: Property
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (property×2)
  - Recommendation: Keep automatic source (packet_property → full_address); no preference default
  - Confidence: High
  - Class: **D6** · Group G
  - Note: Genuine upstream object already configured
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_make_ready_not_authorized` — Page 7 — Lease Make Ready Not Authorized
  - Current Filled from: Custom form data
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual election checkbox — keep unchecked (no scoped default); mutually exclusive or transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: custom_resolver lease_make_ready_not_authorized is effectively inert / election UI
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_make_ready_authorized` — Page 7 — Lease Make Ready Authorized
  - Current Filled from: Custom form data
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual election checkbox — keep unchecked (no scoped default); mutually exclusive or transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: custom_resolver lease_make_ready_authorized is effectively inert / election UI
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_make_ready_cost_cap` — Page 7 — Lease Make Ready Cost Cap
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `0` on `make_ready_cost_cap`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — transaction-specific amount (former schema `0` was a surrogate, not an approved scoped default)
  - Confidence: High
  - Class: **D1** · Group F
  - Note: Former schema default 0; creating Personal 0 would assert 'none' on future packets
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_make_ready_direct_service_fee` — Page 7 — Lease Make Ready Direct Service Fee
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `NA` on `make_ready_service_fee`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — N2/N4 service fee under Make Ready landlord-pays branch (a)
  - Confidence: High
  - Class: **D1** · Group F
  - Note: Former schema NA
  - N-class: **N2** → recommended default: **blank**
  - N-reason: Only applies if Make Ready authorized AND landlord-pays contractors selected
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_make_ready_landlord_pays_contractors` — Page 7 — Lease Make Ready Landlord Pays Contractors
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `false` on `make_ready_landlord_pays_contractors`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual checkbox, unchecked — mutually exclusive / transaction-specific election
  - Confidence: High
  - Class: **D7** · Group C
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_make_ready_broker_reimbursed` — Page 7 — Lease Make Ready Broker Reimbursed
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `false` on `make_ready_broker_reimbursed`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual checkbox, unchecked — mutually exclusive / transaction-specific election
  - Confidence: High
  - Class: **D7** · Group C
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_make_ready_reimbursement_service_fee` — Page 7 — Lease Make Ready Reimbursement Service Fee
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `NA` on `make_ready_service_fee`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — N2/N4 service fee under Make Ready broker-reimbursed branch (b)
  - Confidence: High
  - Class: **D1** · Group F
  - Note: Former schema NA
  - N-class: **N2** → recommended default: **blank**
  - N-reason: Only applies if Make Ready authorized AND broker-reimbursed selected; exclusive of (a)
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_known_financial_obligations_exception` — Page 7 — Lease Known Financial Obligations Exception
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `NA` on `lease_known_financial_obligations_exception`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Lee Personal, form-specific `NA` (N6 standalone exception)
  - Confidence: High
  - Class: **D2** · Group A
  - Note: Former schema NA
  - N-class: **N6** → recommended default: **NA**
  - N-reason: Landlord representation except-blank; NA means no exception
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_known_liens_exception` — Page 7 — Lease Known Liens Exception
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `NA` on `lease_known_liens_exception`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Lee Personal, form-specific `NA` (N6 standalone exception)
  - Confidence: High
  - Class: **D2** · Group A
  - Note: Former schema NA
  - N-class: **N6** → recommended default: **NA**
  - N-reason: Landlord representation except-blank; NA means no exception
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_optional_common_area_fees_exception` — Page 7 — Lease Optional Common Area Fees Exception
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `NA` on `optional_common_area_fees_exception`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Lee Personal, form-specific `NA` (N6 standalone exception)
  - Confidence: High
  - Class: **D2** · Group A
  - Note: Former schema NA
  - N-class: **N6** → recommended default: **NA**
  - N-reason: Landlord representation except-blank; NA means no exception
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_health_safety_condition_exception` — Page 7 — Lease Health Safety Condition Exception
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `NA` on `health_safety_condition_exception`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Lee Personal, form-specific `NA` (N6 standalone exception)
  - Confidence: High
  - Class: **D2** · Group A
  - Note: Former schema NA
  - N-class: **N6** → recommended default: **NA**
  - N-reason: Landlord representation except-blank; NA means no exception
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

### Page 8

- [ ] `LEASE_LISTING_CONCERNING` — Page 8 — Lease Listing Concerning
  - Current Filled from: Property
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (property×2)
  - Recommendation: Keep automatic source (packet_property → full_address); no preference default
  - Confidence: High
  - Class: **D6** · Group G
  - Note: Genuine upstream object already configured
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_special_provisions` — Page 8 — Lease Special Provisions
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `NA` on `lease_special_provisions`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Lee Personal, form-specific `NA` (N6 standalone provision)
  - Confidence: High
  - Class: **D2** · Group A
  - Note: Former schema NA
  - N-class: **N6** → recommended default: **NA**
  - N-reason: Standalone Special Provisions narrative; NA means none
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

### Page 9

- [ ] `LEASE_LISTING_CONCERNING` — Page 9 — Lease Listing Concerning
  - Current Filled from: Property
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (property×2)
  - Recommendation: Keep automatic source (packet_property → full_address); no preference default
  - Confidence: High
  - Class: **D6** · Group G
  - Note: Genuine upstream object already configured
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_add_iabs` — Page 9 — Lease Add IABS
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `true` on `lease_add_iabs`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Mirrors ADD_IABS practice (Lee often checks IABS), but TXR-1102 packets are unchecked and former schema was true — Approve Personal checked, keep blank, or discuss?
  - Confidence: Medium
  - Class: **U** · Group H
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_add_rental_flood_disclosure` — Page 9 — Lease Add Rental Flood Disclosure
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `false` on `lease_add_rental_flood_disclosure`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual checkbox, unchecked (no default) — asserting an addendum attachment is transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: Former schema false/absent
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_add_lead_paint` — Page 9 — Lease Add Lead Paint
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `false` on `lease_add_lead_paint`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual checkbox, unchecked (no default) — asserting an addendum attachment is transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: Former schema false/absent
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_add_hoa_request` — Page 9 — Lease Add HOA Request
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `false` on `lease_add_hoa_request`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual checkbox, unchecked (no default) — asserting an addendum attachment is transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: Former schema false/absent
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_add_flood_hazard` — Page 9 — Lease Add Flood Hazard
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `false` on `lease_add_flood_hazard`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual checkbox, unchecked (no default) — asserting an addendum attachment is transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: Former schema false/absent
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_add_condo_addendum` — Page 9 — Lease Add Condo Addendum
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `false` on `lease_add_condo_addendum`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual checkbox, unchecked (no default) — asserting an addendum attachment is transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: Former schema false/absent
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_add_keybox_tenant` — Page 9 — Lease Add Keybox Tenant
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `false` on `lease_add_keybox_tenant`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual checkbox, unchecked (no default) — asserting an addendum attachment is transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: Former schema false/absent
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_add_onsite_sewer` — Page 9 — Lease Add Onsite Sewer
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `false` on `lease_add_onsite_sewer`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual checkbox, unchecked (no default) — asserting an addendum attachment is transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: Former schema false/absent
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_add_irs_forms` — Page 9 — Lease Add IRS Forms
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `false` on `lease_add_irs_forms`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual checkbox, unchecked (no default) — asserting an addendum attachment is transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: Former schema false/absent
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_add_unescorted_access` — Page 9 — Lease Add Unescorted Access
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `false` on `lease_add_unescorted_access`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual checkbox, unchecked (no default) — asserting an addendum attachment is transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: Former schema false/absent
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_add_assistance_animals` — Page 9 — Lease Add Assistance Animals
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `false` on `lease_add_assistance_animals`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual checkbox, unchecked (no default) — asserting an addendum attachment is transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: Former schema false/absent
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_add_other_document` — Page 9 — Lease Add Other Document
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `false` on `lease_add_other_document`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual checkbox, unchecked (no default) — asserting an addendum attachment is transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: Former schema false/absent
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_add_other_document_description` — Page 9 — Lease Add Other Document Description
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `NA` on `lease_add_other_document_description`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — N3 Other-document description
  - Confidence: High
  - Class: **D1** · Group F
  - Note: Former schema NA
  - N-class: **N3** → recommended default: **blank**
  - N-reason: Only when lease_add_other_document is checked; if checked require real description, not NA
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_rent_due_other` — Page 9 — Lease Rent Due Other
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `NA` on `rent_due_other`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — N3/N4 rent-due Other vs first-day election
  - Confidence: High
  - Class: **D1** · Group F
  - Note: Former schema NA
  - N-class: **N3** → recommended default: **blank**
  - N-reason: Tied to lease_rent_due_other_selected; exclusive of rent due first day
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_rent_due_first_day` — Page 9 — Lease Rent Due First Day
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `true` on `rent_due_first_day`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Former schema true, packets unchecked — Approve Personal checked, keep blank, or discuss?
  - Confidence: Low
  - Class: **U** · Group H
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_rent_due_other_selected` — Page 9 — Lease Rent Due Other Selected
  - Current Filled from: Custom form data
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual election checkbox — keep unchecked (no scoped default); mutually exclusive or transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: custom_resolver lease_rent_due_other_selected is effectively inert / election UI
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_late_charges_incurred_day` — Page 9 — Lease Late Charges Incurred Day
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `2` on `late_charges_incurred_day`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Former schema default 2 — office practice (Personal/Organization 2) or keep blank as transaction-specific?
  - Confidence: Low
  - Class: **U** · Group H
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_initial_late_charge_percent` — Page 9 — Lease Initial Late Charge Percent
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `0` on `initial_late_charge_percent`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — transaction-specific amount (former schema `0` was a surrogate, not an approved scoped default)
  - Confidence: High
  - Class: **D1** · Group F
  - Note: Former schema default 0; creating Personal 0 would assert 'none' on future packets
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_initial_late_charge_amount` — Page 9 — Lease Initial Late Charge Amount
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `0` on `initial_late_charge_amount`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — transaction-specific amount (former schema `0` was a surrogate, not an approved scoped default)
  - Confidence: High
  - Class: **D1** · Group F
  - Note: Former schema default 0; creating Personal 0 would assert 'none' on future packets
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_initial_late_charge_percent_selected` — Page 9 — Lease Initial Late Charge Percent Selected
  - Current Filled from: Custom form data
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual election checkbox — keep unchecked (no scoped default); mutually exclusive or transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: custom_resolver lease_initial_late_charge_percent_selected is effectively inert / election UI
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_initial_late_charge_amount_selected` — Page 9 — Lease Initial Late Charge Amount Selected
  - Current Filled from: Custom form data
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual election checkbox — keep unchecked (no scoped default); mutually exclusive or transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: custom_resolver lease_initial_late_charge_amount_selected is effectively inert / election UI
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_additional_late_charge_daily_amount` — Page 9 — Lease Additional Late Charge Daily Amount
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `0` on `additional_late_charge_daily_amount`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — transaction-specific amount (former schema `0` was a surrogate, not an approved scoped default)
  - Confidence: High
  - Class: **D1** · Group F
  - Note: Former schema default 0; creating Personal 0 would assert 'none' on future packets
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_animals_permitted` — Page 9 — Lease Animals Permitted
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `false` on `animals_permitted`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual checkbox, unchecked (no default) — asserting an addendum attachment is transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: Former schema false/absent
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_animals_not_permitted` — Page 9 — Lease Animals Not Permitted
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `false` on `animals_not_permitted`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual checkbox, unchecked (no default) — asserting an addendum attachment is transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: Former schema false/absent
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_animal_restrictions` — Page 9 — Lease Animal Restrictions
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `NA` on `animal_restrictions`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank / conditional — N2 only when animals permitted
  - Confidence: High
  - Class: **D1** · Group F
  - Note: Former schema NA
  - N-class: **N2** → recommended default: **conditional**
  - N-reason: Restrictions text belongs under Pets permitted; blank if not permitted
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_animal_deposit` — Page 9 — Lease Animal Deposit
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `0` on `animal_deposit`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — transaction-specific amount (former schema `0` was a surrogate, not an approved scoped default)
  - Confidence: High
  - Class: **D1** · Group F
  - Note: Former schema default 0; creating Personal 0 would assert 'none' on future packets
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_animal_monthly_rent_increase` — Page 9 — Lease Animal Monthly Rent Increase
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `0` on `animal_monthly_rent_increase`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — core transaction economics / terms
  - Confidence: High
  - Class: **D1** · Group F
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_animal_nonrefundable_fee` — Page 9 — Lease Animal Nonrefundable Fee
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `0` on `animal_nonrefundable_fee`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — transaction-specific amount (former schema `0` was a surrogate, not an approved scoped default)
  - Confidence: High
  - Class: **D1** · Group F
  - Note: Former schema default 0; creating Personal 0 would assert 'none' on future packets
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_animal_violation_initial_charge` — Page 9 — Lease Animal Violation Initial Charge
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `0` on `animal_violation_initial_charge`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — transaction-specific amount (former schema `0` was a surrogate, not an approved scoped default)
  - Confidence: High
  - Class: **D1** · Group F
  - Note: Former schema default 0; creating Personal 0 would assert 'none' on future packets
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_animal_violation_daily_charge` — Page 9 — Lease Animal Violation Daily Charge
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `0` on `animal_violation_daily_charge`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — transaction-specific amount (former schema `0` was a surrogate, not an approved scoped default)
  - Confidence: High
  - Class: **D1** · Group F
  - Note: Former schema default 0; creating Personal 0 would assert 'none' on future packets
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_security_deposit` — Page 9 — Lease Security Deposit
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `0` on `security_deposit`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — core transaction economics / terms
  - Confidence: High
  - Class: **D1** · Group F
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_tenant_utilities_except` — Page 9 — Lease Tenant Utilities Except
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `NA` on `tenant_utilities_except`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Lee Personal, form-specific `NA` (N6 standalone exception)
  - Confidence: High
  - Class: **D2** · Group A
  - Note: Former schema NA
  - N-class: **N6** → recommended default: **NA**
  - N-reason: Utilities paid by Tenant except: — NA means no exceptions
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

### Page 10

- [ ] `LEASE_LISTING_CONCERNING` — Page 10 — Lease Listing Concerning
  - Current Filled from: Property
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (property×2)
  - Recommendation: Keep automatic source (packet_property → full_address); no preference default
  - Confidence: High
  - Class: **D6** · Group G
  - Note: Genuine upstream object already configured
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_guest_days` — Page 10 — Lease Guest Days
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `0` on `guest_days`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — transaction-specific amount (former schema `0` was a surrogate, not an approved scoped default)
  - Confidence: High
  - Class: **D1** · Group F
  - Note: Former schema default 0; creating Personal 0 would assert 'none' on future packets
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_vehicle_count` — Page 10 — Lease Vehicle Count
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `0` on `vehicle_count`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — transaction-specific amount (former schema `0` was a surrogate, not an approved scoped default)
  - Confidence: High
  - Class: **D1** · Group F
  - Note: Former schema default 0; creating Personal 0 would assert 'none' on future packets
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_trip_charge` — Page 10 — Lease Trip Charge
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `0` on `trip_charge`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — transaction-specific amount (former schema `0` was a surrogate, not an approved scoped default)
  - Confidence: High
  - Class: **D1** · Group F
  - Note: Former schema default 0; creating Personal 0 would assert 'none' on future packets
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_keybox_last_days` — Page 10 — Lease Keybox Last Days
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `0` on `keybox_last_days`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — transaction-specific amount (former schema `0` was a surrogate, not an approved scoped default)
  - Confidence: High
  - Class: **D1** · Group F
  - Note: Former schema default 0; creating Personal 0 would assert 'none' on future packets
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_early_withdrawal_fee` — Page 10 — Lease Early Withdrawal Fee
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `0` on `early_withdrawal_fee`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — transaction-specific amount (former schema `0` was a surrogate, not an approved scoped default)
  - Confidence: High
  - Class: **D1** · Group F
  - Note: Former schema default 0; creating Personal 0 would assert 'none' on future packets
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_inventory_condition_form_days` — Page 10 — Lease Inventory Condition Form Days
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `0` on `inventory_condition_form_days`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — transaction-specific amount (former schema `0` was a surrogate, not an approved scoped default)
  - Confidence: High
  - Class: **D1** · Group F
  - Note: Former schema default 0; creating Personal 0 would assert 'none' on future packets
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_yard_landlord` — Page 10 — Lease Yard Landlord
  - Current Filled from: Custom form data
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual election checkbox — keep unchecked (no scoped default); mutually exclusive or transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: custom_resolver lease_yard_maintained_by_landlord is effectively inert / election UI
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_yard_contractor_tenant_paid` — Page 10 — Lease Yard Contractor Tenant Paid
  - Current Filled from: Custom form data
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual election checkbox — keep unchecked (no scoped default); mutually exclusive or transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: custom_resolver lease_yard_maintained_by_contractor is effectively inert / election UI
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_yard_tenant` — Page 10 — Lease Yard Tenant
  - Current Filled from: Custom form data
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual election checkbox — keep unchecked (no scoped default); mutually exclusive or transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: custom_resolver lease_yard_maintained_by_tenant is effectively inert / election UI
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_yard_contractor_name` — Page 10 — Lease Yard Contractor Name
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — free text without clear NA pattern
  - Confidence: Medium
  - Class: **D1** · Group F
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_pool_tenant` — Page 10 — Lease Pool Tenant
  - Current Filled from: Custom form data
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual election checkbox — keep unchecked (no scoped default); mutually exclusive or transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: custom_resolver lease_pool_maintained_by_tenant is effectively inert / election UI
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_pool_contractor_tenant_paid` — Page 10 — Lease Pool Contractor Tenant Paid
  - Current Filled from: Custom form data
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual election checkbox — keep unchecked (no scoped default); mutually exclusive or transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: custom_resolver lease_pool_maintained_by_contractor is effectively inert / election UI
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_pool_landlord` — Page 10 — Lease Pool Landlord
  - Current Filled from: Custom form data
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual election checkbox — keep unchecked (no scoped default); mutually exclusive or transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: custom_resolver lease_pool_maintained_by_landlord is effectively inert / election UI
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_pool_contractor_name` — Page 10 — Lease Pool Contractor Name
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — free text without clear NA pattern
  - Confidence: Medium
  - Class: **D1** · Group F
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_pool_other` — Page 10 — Lease Pool Other
  - Current Filled from: Custom form data
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual election checkbox — keep unchecked (no scoped default); mutually exclusive or transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: custom_resolver lease_pool_maintained_by_other is effectively inert / election UI
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_pool_other_text` — Page 10 — Lease Pool Other Text
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — free text without clear NA pattern
  - Confidence: Medium
  - Class: **D1** · Group F
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_emergency_repair_phone` — Page 10 — Lease Emergency Repair Phone
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `NA` on `emergency_repair_phone`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — phone number is property/transaction-specific (former schema `NA` would assert a fake contact value)
  - Confidence: High
  - Class: **D1** · Group F
  - Note: Do not prefill NA into a phone field
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_items_not_repaired` — Page 10 — Lease Items Not Repaired
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `NA` on `items_not_repaired`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Lee Personal, form-specific `NA` (N6 standalone exception)
  - Confidence: High
  - Class: **D2** · Group A
  - Note: Former schema NA
  - N-class: **N6** → recommended default: **NA**
  - N-reason: Appliances/items that will not be repaired — NA means none
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_tenant_liability_insurance_amount` — Page 10 — Lease Tenant Liability Insurance Amount
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `0` on `tenant_liability_insurance_amount`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — transaction-specific amount (former schema `0` was a surrogate, not an approved scoped default)
  - Confidence: High
  - Class: **D1** · Group F
  - Note: Former schema default 0; creating Personal 0 would assert 'none' on future packets
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_replacement_tenant_by_tenant_amount_selected` — Page 10 — Lease Replacement Tenant By Tenant Amount Selected
  - Current Filled from: Custom form data
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual election checkbox — keep unchecked (no scoped default); mutually exclusive or transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: custom_resolver lease_replacement_tenant_by_tenant_amount_selected is effectively inert / election UI
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_replacement_tenant_by_tenant_amount` — Page 10 — Lease Replacement Tenant By Tenant Amount
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `0` on `replacement_tenant_by_tenant_amount`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — transaction-specific amount (former schema `0` was a surrogate, not an approved scoped default)
  - Confidence: High
  - Class: **D1** · Group F
  - Note: Former schema default 0; creating Personal 0 would assert 'none' on future packets
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_replacement_tenant_by_tenant_percent` — Page 10 — Lease Replacement Tenant By Tenant Percent
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `0` on `replacement_tenant_by_tenant_percent`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — transaction-specific amount (former schema `0` was a surrogate, not an approved scoped default)
  - Confidence: High
  - Class: **D1** · Group F
  - Note: Former schema default 0; creating Personal 0 would assert 'none' on future packets
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_replacement_tenant_by_tenant_percent_selected` — Page 10 — Lease Replacement Tenant By Tenant Percent Selected
  - Current Filled from: Custom form data
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual election checkbox — keep unchecked (no scoped default); mutually exclusive or transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: custom_resolver lease_replacement_tenant_by_tenant_percent_selected is effectively inert / election UI
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_replacement_tenant_by_landlord_amount_selected` — Page 10 — Lease Replacement Tenant By Landlord Amount Selected
  - Current Filled from: Custom form data
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual election checkbox — keep unchecked (no scoped default); mutually exclusive or transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: custom_resolver lease_replacement_tenant_by_landlord_amount_selected is effectively inert / election UI
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_replacement_tenant_by_landlord_amount` — Page 10 — Lease Replacement Tenant By Landlord Amount
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `0` on `replacement_tenant_by_landlord_amount`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — transaction-specific amount (former schema `0` was a surrogate, not an approved scoped default)
  - Confidence: High
  - Class: **D1** · Group F
  - Note: Former schema default 0; creating Personal 0 would assert 'none' on future packets
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_replacement_tenant_by_landlord_percent_selected` — Page 10 — Lease Replacement Tenant By Landlord Percent Selected
  - Current Filled from: Custom form data
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Manual election checkbox — keep unchecked (no scoped default); mutually exclusive or transaction-specific
  - Confidence: High
  - Class: **D7** · Group C
  - Note: custom_resolver lease_replacement_tenant_by_landlord_percent_selected is effectively inert / election UI
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_replacement_tenant_by_landlord_percent` — Page 10 — Lease Replacement Tenant By Landlord Percent
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `0` on `replacement_tenant_by_landlord_percent`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — transaction-specific amount (former schema `0` was a surrogate, not an approved scoped default)
  - Confidence: High
  - Class: **D1** · Group F
  - Note: Former schema default 0; creating Personal 0 would assert 'none' on future packets
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_requirements_special_provisions` — Page 10 — Lease Requirements Special Provisions
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `NA` on `lease_requirements_special_provisions`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Lee Personal, form-specific `NA` (N6 standalone provision)
  - Confidence: High
  - Class: **D2** · Group A
  - Note: Former schema NA
  - N-class: **N6** → recommended default: **NA**
  - N-reason: Lease Requirements Special Provisions narrative; NA means none
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_requirements_other` — Page 10 — Lease Requirements Other
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: `NA` on `lease_requirements_other`
  - Historical packet use: 2 (empty×2)
  - Recommendation: Lee Personal, form-specific `NA` (N6/N1 standalone Other line)
  - Confidence: High
  - Class: **D2** · Group A
  - Note: Former schema NA
  - N-class: **N6** → recommended default: **NA**
  - N-reason: ¶ Other: catch-all with no checkbox trigger; NA means none
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

### Page 11

- [ ] `LEASE_LISTING_CONCERNING` — Page 11 — Lease Listing Concerning
  - Current Filled from: Property
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (property×2)
  - Recommendation: Keep automatic source (packet_property → full_address); no preference default
  - Confidence: High
  - Class: **D6** · Group G
  - Note: Genuine upstream object already configured
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `broker_full_name` — Page 11 — Broker Full Name
  - Current Filled from: Brokerage
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (settings×2)
  - Recommendation: Keep automatic source (settings_brokerage → broker_full_name); no preference default
  - Confidence: High
  - Class: **D6** · Group G
  - Note: Genuine upstream object already configured
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `broker_license_number` — Page 11 — Broker License Number
  - Current Filled from: Brokerage
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (settings×2)
  - Recommendation: Keep automatic source (settings_brokerage → broker_license_number); no preference default
  - Confidence: High
  - Class: **D6** · Group G
  - Note: Genuine upstream object already configured
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_broker_signature_checkbox` — Page 11 — Lease Broker Signature Checkbox
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — signature/initial controls
  - Confidence: High
  - Class: **D1** · Group F
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `lease_broker_associate_signature_checkbox` — Page 11 — Lease Broker Associate Signature Checkbox
  - Current Filled from: Not connected
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (empty×2)
  - Recommendation: Keep blank — signature/initial controls
  - Confidence: High
  - Class: **D1** · Group F
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `agent_full_name` — Page 11 — Agent Full Name
  - Current Filled from: Agent
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (settings×2)
  - Recommendation: Keep automatic source (settings_agent → agent_full_name); no preference default
  - Confidence: High
  - Class: **D6** · Group G
  - Note: Genuine upstream object already configured
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

- [ ] `AGENT_LICENSE_NUMBER` — Page 11 — Agent License Number
  - Current Filled from: Agent
  - Current default: None
  - Former schema default: n/a (not a former listing-details source)
  - Historical packet use: 2 (settings×2)
  - Recommendation: Keep automatic source (settings_agent → agent_license_number); no preference default
  - Confidence: High
  - Class: **D6** · Group G
  - Note: Genuine upstream object already configured
  - Lee decision: Approve / Change value / Change scope / Keep blank / Discuss

---

## Recommended Personal Defaults

### Revised high-confidence Lee Personal, form-specific `NA` (N6/N1 only — 12 fields)

- `lease_non_real_estate_items` (p1) — ¶2B Non-Real Estate Items
- `lease_listing_exclusions` (p1) — ¶2C Exclusions
- `lease_reimbursable_expenses` (p3) — ¶5 Reimbursable Expenses
- `lease_known_financial_obligations_exception` (p7) — ¶12 financial except
- `lease_known_liens_exception` (p7) — ¶12 liens except
- `lease_optional_common_area_fees_exception` (p7) — ¶12 common-area fees except
- `lease_health_safety_condition_exception` (p7) — ¶12 health/safety except
- `lease_special_provisions` (p8) — Special Provisions
- `lease_tenant_utilities_except` (p9) — ¶20E Utilities except
- `lease_items_not_repaired` (p10) — ¶20M items not repaired
- `lease_requirements_special_provisions` (p10) — ¶20N Special Provisions
- `lease_requirements_other` (p10) — ¶20P Other (standalone; no checkbox)

### Former NA candidates revised to **blank / conditional** (do not create `NA` defaults)

| Field | N-class | Recommendation |
|---|---|---|
| `lease_broker_fee_other` | N3/N4 | blank |
| `lease_no_coop_other` | N3/N4 | blank |
| `lease_renewal_other` | N3/N4 | blank |
| `lease_sale_comp_other` | N3/N4 | blank |
| `lease_mls_delayed_purpose` | N2 | conditional / blank |
| `lease_make_ready_direct_service_fee` | N2/N4 | blank |
| `lease_make_ready_reimbursement_service_fee` | N2/N4 | blank |
| `lease_add_other_document_description` | N3 | blank |
| `lease_rent_due_other` | N3/N4 | blank |
| `lease_animal_restrictions` | N2 | conditional / blank |

### Possible Personal checked (in Lee Decisions / Group H — not pre-approved)

- `lease_keybox_authorized_yes`, `lease_add_iabs`, `lease_rent_due_first_day`, `lease_intermediary_yes`, MLS file listing/immediately — see U section

## Recommended Organization Defaults

- **Keep** existing Organization all-forms **Broker Bay** on `LEASE_SCHEDULING_COMPANY` (D5 / Group E)
- **Do not** create a form-specific Organization duplicate
- **No other** Organization defaults are recommended without Lee explicitly choosing an office-wide rule (county, late-charge day, protection period)

---

## Keep Blank

High-confidence D1 / Group F (transaction-specific amounts/dates; former `0` was a surrogate only; **plus** N2/N3/N4 text fields that must not receive `NA`):

- `lease_monthly_rent` (p1) — Lease Monthly Rent
- `lease_term_max_months` (p1) — Lease Term Max Months
- `lease_term_min_months` (p1) — Lease Term Min Months
- `lease_listing_end_date` (p1) — Lease Listing End Date
- `lease_listing_begin_date` (p1) — Lease Listing Begin Date
- `lease_broker_fee_one_month_percent` (p2) — Lease Broker Fee One Month Percent
- `lease_broker_fee_all_rents_percent` (p2) — Lease Broker Fee All Rents Percent
- `lease_broker_fee_other` (p2) — Lease Broker Fee Other (**N3/N4** — was medium NA)
- `lease_other_broker_one_month_percent` (p2) — Lease Other Broker One Month Percent
- `lease_other_broker_all_rents_percent` (p2) — Lease Other Broker All Rents Percent
- `lease_other_broker_flat_fee` (p2) — Lease Other Broker Flat Fee
- `lease_no_coop_one_month_percent` (p2) — Lease No Coop One Month Percent
- `lease_no_coop_all_rents_percent` (p2) — Lease No Coop All Rents Percent
- `lease_no_coop_other` (p2) — Lease No Coop Other (**N3/N4** — was medium NA)
- `lease_renewal_one_month_percent` (p3) — Lease Renewal One Month Percent
- `lease_renewal_all_rents_percent` (p3) — Lease Renewal All Rents Percent
- `lease_renewal_other` (p3) — Lease Renewal Other (**N3/N4** — was medium NA)
- `lease_sale_comp_percent` (p3) — Lease Sale Comp Percent
- `lease_sale_comp_other` (p3) — Lease Sale Comp Other (**N3/N4** — was medium NA)
- `lease_mls_delayed_days` (p4) — Lease MLS Delayed Days
- `lease_mls_delayed_purpose` (p4) — Lease MLS Delayed Purpose (**N2** — was high NA)
- `lease_make_ready_cost_cap` (p7) — Lease Make Ready Cost Cap
- `lease_make_ready_direct_service_fee` (p7) — Lease Make Ready Direct Service Fee (**N2/N4** — was medium NA)
- `lease_make_ready_reimbursement_service_fee` (p7) — Lease Make Ready Reimbursement Service Fee (**N2/N4** — was medium NA)
- `lease_add_other_document_description` (p9) — Lease Add Other Document Description (**N3** — was high NA)
- `lease_rent_due_other` (p9) — Lease Rent Due Other (**N3/N4** — was medium NA)
- `lease_animal_restrictions` (p9) — Lease Animal Restrictions (**N2** — was high NA)
- `lease_initial_late_charge_percent` (p9) — Lease Initial Late Charge Percent
- `lease_initial_late_charge_amount` (p9) — Lease Initial Late Charge Amount
- `lease_additional_late_charge_daily_amount` (p9) — Lease Additional Late Charge Daily Amount
- `lease_animal_deposit` (p9) — Lease Animal Deposit
- `lease_animal_monthly_rent_increase` (p9) — Lease Animal Monthly Rent Increase
- `lease_animal_nonrefundable_fee` (p9) — Lease Animal Nonrefundable Fee
- `lease_animal_violation_initial_charge` (p9) — Lease Animal Violation Initial Charge
- `lease_animal_violation_daily_charge` (p9) — Lease Animal Violation Daily Charge
- `lease_security_deposit` (p9) — Lease Security Deposit
- `lease_guest_days` (p10) — Lease Guest Days
- `lease_vehicle_count` (p10) — Lease Vehicle Count
- `lease_trip_charge` (p10) — Lease Trip Charge
- `lease_keybox_last_days` (p10) — Lease Keybox Last Days
- `lease_early_withdrawal_fee` (p10) — Lease Early Withdrawal Fee
- `lease_inventory_condition_form_days` (p10) — Lease Inventory Condition Form Days
- `lease_yard_contractor_name` (p10) — Lease Yard Contractor Name
- `lease_pool_contractor_name` (p10) — Lease Pool Contractor Name
- `lease_pool_other_text` (p10) — Lease Pool Other Text
- `lease_emergency_repair_phone` (p10) — Lease Emergency Repair Phone
- `lease_tenant_liability_insurance_amount` (p10) — Lease Tenant Liability Insurance Amount
- `lease_replacement_tenant_by_tenant_amount` (p10) — Lease Replacement Tenant By Tenant Amount
- `lease_replacement_tenant_by_tenant_percent` (p10) — Lease Replacement Tenant By Tenant Percent
- `lease_replacement_tenant_by_landlord_amount` (p10) — Lease Replacement Tenant By Landlord Amount
- `lease_replacement_tenant_by_landlord_percent` (p10) — Lease Replacement Tenant By Landlord Percent
- `lease_broker_signature_checkbox` (p11) — Lease Broker Signature Checkbox
- `lease_broker_associate_signature_checkbox` (p11) — Lease Broker Associate Signature Checkbox

---

## Automatic Source Candidates

Already configured genuine sources (D6 — keep; no preference default):

- `landlord_name_1` (p1) — packet_contact → landlord_1.full_name
- `landlord_name_2` (p1) — packet_contact → landlord_2.full_name
- `landlord_phone` (p1) — packet_contact → landlord_1.phone
- `landlord_email` (p1) — packet_contact → landlord_1.email
- `BROKERAGE_NAME` (p1) — settings_brokerage → brokerage_name
- `brokerage_address` (p1) — settings_brokerage → brokerage_address
- `BROKERAGE_CITY_STATE_ZIP` (p1) — settings_brokerage → brokerage_city_state_zip
- `brokerage_office_phone` (p1) — settings_brokerage → brokerage_office_phone
- `brokerage_email` (p1) — settings_brokerage → brokerage_email
- `PROPERTY_BLOCK` (p1) — packet_property → block
- `PROPERTY_LOT` (p1) — packet_property → lot
- `PROPERTY_ADDITION` (p1) — packet_property → subdivision
- `PROPERTY_CITY` (p1) — packet_property → city
- `property_county` (p1) — packet_property → county
- `PROPERTY_ADDRESS_ZIP` (p1) — packet_property → address_city_state_zip
- `LEASE_LISTING_CONCERNING` (p2) — packet_property → full_address
- `LEASE_LISTING_CONCERNING` (p3) — packet_property → full_address
- `LEASE_LISTING_CONCERNING` (p4) — packet_property → full_address
- `LEASE_LISTING_CONCERNING` (p5) — packet_property → full_address
- `LEASE_LISTING_CONCERNING` (p6) — packet_property → full_address
- `LEASE_LISTING_CONCERNING` (p7) — packet_property → full_address
- `LEASE_LISTING_CONCERNING` (p8) — packet_property → full_address
- `LEASE_LISTING_CONCERNING` (p9) — packet_property → full_address
- `LEASE_LISTING_CONCERNING` (p10) — packet_property → full_address
- `LEASE_LISTING_CONCERNING` (p11) — packet_property → full_address
- `broker_full_name` (p11) — settings_brokerage → broker_full_name
- `broker_license_number` (p11) — settings_brokerage → broker_license_number
- `agent_full_name` (p11) — settings_agent → agent_full_name
- `AGENT_LICENSE_NUMBER` (p11) — settings_agent → agent_license_number

Future automatic-source candidates (currently Not connected / custom / blank):

- `landlord_address` (p1) — Automatic-source candidate — landlord address should come from Client/contact, not a preference default; keep blank until resolver/source is fixed
- `landlord_city_state_zip` (p1) — Automatic-source candidate — landlord address should come from Client/contact, not a preference default; keep blank until resolver/source is fixed
- `lease_hoa_is_subject` (p1) — Automatic-source candidate (property HOA) — keep blank for now (no property_hoas remapping this wave)
- `lease_hoa_is_not_subject` (p1) — Automatic-source / inverse-HOA candidate — keep blank until Property HOA review; do not create a preference default

---

## Lee Decisions Required

### `lease_protection_period_days` — Page 3
- Label: Lease Protection Period Days
- Question: Former schema 30; Lee has all-forms Personal 30 on PROTECTION_PERIOD_DAYS (different field key) — form-specific 30, blank, or discuss?
- Former schema: 30
- Packet use: 2 (empty×2)
- Suggested options: Approve recommended value / Keep blank / Change scope / Discuss

### `lease_payment_county` — Page 3
- Label: Lease Payment County
- Question: Former schema Dallas/Tarrant; Lee has all-forms Personal on PAYMENT_COUNTY (different field key) — create form-specific Personal Dallas/Tarrant, keep blank, or discuss?
- Former schema: Dallas/Tarrant
- Packet use: 2 (empty×2)
- Suggested options: Approve recommended value / Keep blank / Change scope / Discuss

### `lease_mls_file_listing` — Page 4
- Label: Lease MLS File Listing
- Question: Lee has all-forms checked defaults on analogous TXR-1101 MLS fields — create TXR-1102 Personal checked defaults, reuse all-forms, or keep unchecked?
- Former schema: n/a
- Packet use: 2 (empty×2)
- Suggested options: Approve recommended value / Keep blank / Change scope / Discuss

### `lease_mls_file_immediately` — Page 4
- Label: Lease MLS File Immediately
- Question: Lee has all-forms checked defaults on analogous TXR-1101 MLS fields — create TXR-1102 Personal checked defaults, reuse all-forms, or keep unchecked?
- Former schema: n/a
- Packet use: 2 (empty×2)
- Suggested options: Approve recommended value / Keep blank / Change scope / Discuss

### `lease_keybox_authorized_yes` — Page 5
- Label: Lease Keybox Authorized Yes
- Question: Mirrors TXR-1101 KEYBOX_AUTHORIZED_YES (Lee all-forms checked), but TXR-1102 packets are currently unchecked — Approve Personal checked, keep blank, or discuss?
- Former schema: true
- Packet use: 2 (empty×2)
- Suggested options: Approve recommended value / Keep blank / Change scope / Discuss

### `lease_intermediary_yes` — Page 5
- Label: Lease Intermediary Yes
- Question: TXR-1101 LISTING_INTERMEDIARY_YES has Lee all-forms checked — create analogous lease Personal checked, leave unchecked, or discuss?
- Former schema: n/a
- Packet use: 2 (empty×2)
- Suggested options: Approve recommended value / Keep blank / Change scope / Discuss

### `lease_add_iabs` — Page 9
- Label: Lease Add IABS
- Question: Mirrors ADD_IABS practice (Lee often checks IABS), but TXR-1102 packets are unchecked and former schema was true — Approve Personal checked, keep blank, or discuss?
- Former schema: true
- Packet use: 2 (empty×2)
- Suggested options: Approve recommended value / Keep blank / Change scope / Discuss

### `lease_rent_due_first_day` — Page 9
- Label: Lease Rent Due First Day
- Question: Former schema true, packets unchecked — Approve Personal checked, keep blank, or discuss?
- Former schema: true
- Packet use: 2 (empty×2)
- Suggested options: Approve recommended value / Keep blank / Change scope / Discuss

### `lease_late_charges_incurred_day` — Page 9
- Label: Lease Late Charges Incurred Day
- Question: Former schema default 2 — office practice (Personal/Organization 2) or keep blank as transaction-specific?
- Former schema: 2
- Packet use: 2 (empty×2)
- Suggested options: Approve recommended value / Keep blank / Change scope / Discuss

---

## Packet Evidence

| Metric | Value |
|---|---|
| Packets with TXR-1102 | 2 (#19 ACTIVE, #15 DELETED) |
| Packet forms | 2 (pf #53 ACTIVE DRAFT, pf #52 DELETED DRAFT) |
| Linked to listing_agreement_details | **0** |
| Field instances (all statuses on these packet forms) | **318** across inventory rows |
| Provenance mix | empty=267, contact_role=2, settings=18, property=29, field_default=1, manual_override+ovr=1 |
| Manual overrides | 1 |
| Instances sourced from listing details (`packet`) | **0** |

**Safety:**
- Creating future scoped defaults would **not** rewrite historical instances on ordinary open (`ensure_missing` insert-only)
- New defaults apply only to eligible **new** instance creation or explicit Refresh
- No packet currently depends on former schema defaults

---

## Concise Review Groups

### Group A — High-confidence `NA` (12 — N6/N1 only)
`lease_non_real_estate_items`, `lease_listing_exclusions`, `lease_reimbursable_expenses`, `lease_known_financial_obligations_exception`, `lease_known_liens_exception`, `lease_optional_common_area_fees_exception`, `lease_health_safety_condition_exception`, `lease_special_provisions`, `lease_tenant_utilities_except`, `lease_items_not_repaired`, `lease_requirements_special_provisions`, `lease_requirements_other`

### Group B — High-confidence `0` (0)
_none recommended in this review — prefer blank over asserting zero_

### Group C — Manual unchecked checkboxes (51)
`lease_broker_fee_one_month_selected`, `lease_broker_fee_all_rents_selected`, `lease_broker_fee_other_selected`, `lease_other_broker_one_month_selected`, `lease_other_broker_all_rents_selected`, `lease_other_broker_flat_fee_selected`, `lease_no_coop_one_month_selected`, `lease_no_coop_all_rents_selected`, `lease_no_coop_other_selected`, `lease_renewal_one_month_selected`, `lease_renewal_all_rents_selected`, `lease_renewal_other_selected`, `lease_sale_comp_percent_selected`, `lease_sale_comp_other_selected`, `lease_mls_delay_filing`, `lease_mls_no_filing`, `lease_keybox_authorized_no`, `lease_intermediary_no`, `lease_internet_no_display`, `lease_internet_no_address_display`, `lease_make_ready_not_authorized`, `lease_make_ready_authorized`, `lease_make_ready_landlord_pays_contractors`, `lease_make_ready_broker_reimbursed`, `lease_add_rental_flood_disclosure`, `lease_add_lead_paint`, `lease_add_hoa_request`, `lease_add_flood_hazard`, `lease_add_condo_addendum`, `lease_add_keybox_tenant`, `lease_add_onsite_sewer`, `lease_add_irs_forms`, `lease_add_unescorted_access`, `lease_add_assistance_animals`, `lease_add_other_document`, `lease_rent_due_other_selected`, `lease_initial_late_charge_percent_selected`, `lease_initial_late_charge_amount_selected`, `lease_animals_permitted`, `lease_animals_not_permitted`, `lease_yard_landlord`, `lease_yard_contractor_tenant_paid`, `lease_yard_tenant`, `lease_pool_tenant`, `lease_pool_contractor_tenant_paid`, `lease_pool_landlord`, `lease_pool_other`, `lease_replacement_tenant_by_tenant_amount_selected`, `lease_replacement_tenant_by_tenant_percent_selected`, `lease_replacement_tenant_by_landlord_amount_selected`, `lease_replacement_tenant_by_landlord_percent_selected`

### Group D — Manual checked checkboxes (0)
_none pre-approved; see Group H_

### Group E — Organization candidates (1)
`LEASE_SCHEDULING_COMPANY` (Keep existing Organization all-forms default (Broker Bay))

### Group F — Keep blank (53 — includes 10 former NA candidates reclassified N2/N3/N4)
`lease_monthly_rent`, `lease_term_max_months`, `lease_term_min_months`, `lease_listing_end_date`, `lease_listing_begin_date`, `lease_broker_fee_one_month_percent`, `lease_broker_fee_all_rents_percent`, `lease_other_broker_one_month_percent`, `lease_other_broker_all_rents_percent`, `lease_other_broker_flat_fee`, `lease_no_coop_one_month_percent`, `lease_no_coop_all_rents_percent`, `lease_renewal_one_month_percent`, `lease_renewal_all_rents_percent`, `lease_sale_comp_percent`, `lease_mls_delayed_days`, `lease_make_ready_cost_cap`, `lease_initial_late_charge_percent`, `lease_initial_late_charge_amount`, `lease_additional_late_charge_daily_amount`, `lease_animal_deposit`, `lease_animal_monthly_rent_increase`, `lease_animal_nonrefundable_fee`, `lease_animal_violation_initial_charge`, `lease_animal_violation_daily_charge`, `lease_security_deposit`, `lease_guest_days`, `lease_vehicle_count`, `lease_trip_charge`, `lease_keybox_last_days`, `lease_early_withdrawal_fee`, `lease_inventory_condition_form_days`, `lease_yard_contractor_name`, `lease_pool_contractor_name`, `lease_pool_other_text`, `lease_emergency_repair_phone`, `lease_tenant_liability_insurance_amount`, `lease_replacement_tenant_by_tenant_amount`, `lease_replacement_tenant_by_tenant_percent`, `lease_replacement_tenant_by_landlord_amount`, `lease_replacement_tenant_by_landlord_percent`, `lease_broker_signature_checkbox`, `lease_broker_associate_signature_checkbox`, `lease_broker_fee_other`, `lease_no_coop_other`, `lease_renewal_other`, `lease_sale_comp_other`, `lease_mls_delayed_purpose`, `lease_make_ready_direct_service_fee`, `lease_make_ready_reimbursement_service_fee`, `lease_add_other_document_description`, `lease_rent_due_other`, `lease_animal_restrictions`

### Group G — Automatic-source candidates (33)
`landlord_name_1`, `landlord_name_2`, `landlord_address`, `landlord_city_state_zip`, `landlord_phone`, `landlord_email`, `BROKERAGE_NAME`, `brokerage_address`, `BROKERAGE_CITY_STATE_ZIP`, `brokerage_office_phone`, `brokerage_email`, `PROPERTY_BLOCK`, `PROPERTY_LOT`, `PROPERTY_ADDITION`, `PROPERTY_CITY`, `property_county`, `PROPERTY_ADDRESS_ZIP`, `lease_hoa_is_subject`, `lease_hoa_is_not_subject`, `LEASE_LISTING_CONCERNING`, `LEASE_LISTING_CONCERNING`, `LEASE_LISTING_CONCERNING`, `LEASE_LISTING_CONCERNING`, `LEASE_LISTING_CONCERNING`, `LEASE_LISTING_CONCERNING`, `LEASE_LISTING_CONCERNING`, `LEASE_LISTING_CONCERNING`, `LEASE_LISTING_CONCERNING`, `LEASE_LISTING_CONCERNING`, `broker_full_name`, `broker_license_number`, `agent_full_name`, `AGENT_LICENSE_NUMBER`

### Group H — Uncertain (9)
`lease_protection_period_days` p3, `lease_payment_county` p3, `lease_mls_file_listing` p4, `lease_mls_file_immediately` p4, `lease_keybox_authorized_yes` p5, `lease_intermediary_yes` p5, `lease_add_iabs` p9, `lease_rent_due_first_day` p9, `lease_late_charges_incurred_day` p9

---

## Missing Scoped-Default Counts

| Metric | Count |
|---|---:|
| Mapped fields with source `manual_only` | 90 |
| Of those with **no** Lee default | 90 |
| Of those with Lee legacy all-forms default | 0 |
| Of those with Lee form-specific default | 0 |
| Of those with an Organization default | 1 |
| Former listing-details fields with **no** scoped replacement | 82 |
| Checkbox fields with no explicit true/false default | 23 |
| Numeric fields with no Lee/Org default | 37 |
| Text fields with no Lee/Org default | 27 |

---

## Proposed Implementation Order

1. **Lee marks this checklist** (Approve / Change / Keep blank / Discuss) — no DB writes until then
2. **Create only approved N6/N1 `NA` defaults** (12 fields) via Forms → Map Fields → Edit default (Lee session, Private, form-specific TXR-1102)
3. **Create any approved checked / county / day defaults** the same way
4. **Do not** create `NA` for N2/N3/N4 election fields; **do not** bulk-create Personal `0` for compensation amounts
5. **Leave** Organization Broker Bay as-is; defer HOA remapping and landlord-address resolver cleanup
6. Optional later: focused tests for new defaults + owner isolation (Yahoo must not see Lee Private)

---

## Data Integrity Statement

This review made **no** changes to: defaults, fields, mappings, coordinates, packet instances, PDFs, schema, source code, or migrations. All database access was SELECT-only.
