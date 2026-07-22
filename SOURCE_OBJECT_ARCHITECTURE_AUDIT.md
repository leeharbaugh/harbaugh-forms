# Source Object Architecture Audit

**Branch:** `main`  
**HEAD:** `d9a9f0fa1e516608b515056ad2241eef5d537709`  
**Database:** `harbaugh-forms-dev`  
**Audit date:** 2026-07-21  
**Mode:** Read-only (no schema, row, mapping, default, packet, or source changes)

---

## Executive Summary

Yes — for most form-specific details objects, the architecture is a **vestige of the pre–scoped-defaults era**, amplified by TXR form expansions that added dozens of columns with baked-in `'NA'`, `0`, boolean, and brokerage literals.

The intended product model (templates → Personal/Organization defaults → packet field instances → Fill Form) already operates for the majority of packets. Current packet creation is **collection-based** and leaves `representation_agreement_id` null. The agreement-anchored path is explicitly marked `@legacy`.

| Object | Primary classification | One-line conclusion |
|---|---|---|
| `properties` / `contacts` / `packet_contacts` | **B1 / B2** | Genuine business sources; keep. |
| `brokerage_settings` (profile fields) | **B1** | Genuine agent/brokerage profile; keep. |
| `brokerage_settings.default_*` | **B4 / B5** | Orphaned preference columns; unused by TypeScript. |
| `representation_agreements` | **B2** (mixed) | Real agreement lifecycle; little current packet use. |
| `buyer_rep_details` | **Mixed B2 + B4** | Full edit UI exists; schema defaults are legacy; only legacy agreement-linked packets resolve from it. |
| `listing_agreement_details` | **Mixed B2 + B4** (mostly B4) | Thin UI (~14 original columns); ~100+ TXR expansion columns have **no UI** and exist mainly as default surrogates. **Zero** active packet instances currently sourced from this table. |
| `contract_details` | **Removed 2026-07-22** | Abandoned empty table dropped after source conversion; see decisions.md. |
| `property_hoas` | **B1 (resolved 2026-07-22)** | Authoritative HOA store; Property UI writes first ACTIVE row; redundant `properties` HOA columns retired. See `PROPERTY_HOA_CONSOLIDATION.md`. |
| `packet` / `static_default` source types | **B5** | Registered in code; **0** active catalog fields. |
| `manual_only` / `packet_instance` / `custom_resolver` | Product-aligned | Prefer these (plus scoped defaults) over expanding details tables. |

**Do not restore or expand broken `listing_agreement_details` source paths as the repair strategy.** That would preserve obsolete architecture. Prefer converting expansion-backed fields to `manual_only` + scoped `field_defaults`, after Lee review.

**Critical dual-storage risk:** Present but **not blocking** in the sense of uncontrolled live write-back. Fill Form writes **only** `field_instances`. Details tables are never updated from Fill Form. Divergence exists (193 observed instance/details mismatches on the single historical details rows), largely because ordinary open uses `ensure_missing` (snapshots are sticky) and most packets never link to an agreement. Classification: dual-storage **architecture risk**, not an active corruption loop.

**Active mappings → inactive fields (global scan):** **1** — `BUYER_REP_BROKER_SGN_CHECKBOX` on TXR-1501. No broader catalog-deduplication epidemic.

---

## Resolution Update (2026-07-21, branch `remove-abandoned-contract-details-sources`)

The contract and Buyer Rep findings above were implemented after this audit:

- Migration `20260721190000_remove_abandoned_contract_details_sources.sql` converted the **64** ACTIVE catalog fields with `source_type = 'contract_details'` (63 mapped on TXR-1601, plus unmapped `contract_effective_date`) to `source_type = 'manual_only'`, `source_path = null`. The migration targets explicit field IDs, requires the expected prior source type, asserts `contract_details` still has 0 rows, and touches no mappings, coordinates, defaults, or packet instances (verified by full before/after row diff — 0 non-field rows changed).
- The same migration **reactivated** `BUYER_REP_BROKER_SGN_CHECKBOX` (`2a32353f-0923-40ed-98f0-e60815ad4e96`) as ACTIVE `manual_only`, choosing option (b) from the Buyer Rep detail section below after visual/DB confirmation: the TXR-1501 page 6 broker-signature checkbox is a real, distinct PDF control (the adjacent `ASSOCIATE_SIGNATURE_BOX` at y 273 is the associate's separate checkbox, and all `*_broker_signature_checkbox` candidates are Listing/Lease-specific). Its inactivation matched the text heuristic of the `20260701200000` AcroForm-pollution sweep (all-caps key ≥ 18 chars, effectively manual, no path/resolver) while its hand-drawn mapping and 3 packet instances stayed ACTIVE — an accidental, incomplete inactivation, not a dedup with a replacement.
- **Schema removal (2026-07-22):** `20260722180000_remove_contract_details_architecture.sql` dropped the empty table (no CASCADE), removed `'contract_details'` from `fields_source_type_check`, and converted six table-only custom-resolver fields to `manual_only`. Application registries/resolver/UI no longer reference Contract Details. Historical migrations that created the table remain intact.
- Listing Agreement source family was cleaned up separately on 2026-07-22 (see Implementation Update below). Buyer Rep details and Lease-as-schema remain open review items; HOA/`property_hoas` consolidated 2026-07-22.

---

## Refinement Update (2026-07-21, `LISTING_AGREEMENT_DETAILS_REVIEW.md`)

The dedicated column-by-column listing review confirmed this audit's mixed-B2+B4 conclusion and refined several statements:

- **Allowlist gap is far larger than the example given here.** This audit noted the listing resolver allowlist was "incomplete; e.g. missing `lease_scheduling_company`". The full check found **80 of 111** ACTIVE non-null `source_path` values are absent from the allowlist — the entire TXR-1102 lease path family plus `hoa_exists` — so most listing sources have **never** been resolvable at any point in history, independent of packet linkage.
- **Exact counts.** Columns: **152** (was "~152"). ACTIVE fields: 129 (46 TXR-1101 / 83 TXR-1102 mappings) — confirmed. Null-path ACTIVE fields: **18** — confirmed. DELETED listing-source fields: 8.
- **Packet-sourced instances: 0, both current and historical** (this audit had verified 0 active; the review also verified 0 non-active instances exist on these fields at all).
- **Dual-storage divergence, listing-only:** 160 of 222 instance-vs-details comparisons diverge on the single historical row (the 193 figure here combined listing + buyer-rep). Divergence remains an architecture risk only; instances win, no sync exists, and 18 manual overrides are additionally protected.
- **Column-level classification (147 business columns):** L1 14 (original UI core), L2 0, L3 4 (term dates), L4 111 (expansion surrogates), L5 16 (no field, no UI, no reader), U 2 (the disputed `known_districts` / `other_fees_reimbursable_expenses`).
- **Active-mapping→inactive-field scan re-run: 0 anomalies** (Buyer Rep checkbox repair holds).
- **Recommended disposition** (pending Lee at review time): convert **123** of 129 fields to `manual_only` (S2), 6 Lee decisions (S3), **0** unconditional S1 preservals. Table itself: Option A.

---

## Implementation Update (2026-07-22, branch `remove-listing-details-sources`)

Lee approved the selective cleanup. Applied to `harbaugh-forms-dev`:

- Migration `20260722010000_remove_obsolete_listing_details_sources.sql` converted **132** fields to `manual_only` (129 `listing_agreement_details` + 3 Listing compensation custom-resolvers that read dormant details columns). Explicit ID allowlist; strict source-type/resolver preconditions; rerun-safe; updates only `public.fields`.
- Verified: 0 ACTIVE `listing_agreement_details` sources remain; mappings/coords/instances unchanged (869 / 1497); historical details row untouched; Organization defaults remain 4; Lee legacy all-forms Private remain 56; form-specific Private rose 19→21 for the two approved disputed-field defaults.
- Lee Personal form-specific `NA` defaults created via Map Fields UI for `KNOWN_DISTRICTS` and `OTHER_FEES_REIMBURSABLE_EXPENSES` (form 7).
- Table, historical row, legacy `/listing-agreements` route, and resolver code retained for compatibility. TXR-1102 scoped defaults require a separate review (not inferred from schema defaults). HOA fields are `manual_only` for now — no `property_hoas` remapping.

---

## Product Model Used for Classification

1. Global form templates define PDF structure, canonical fields, and placement.
2. Personal and Organization defaults provide initial preference values.
3. Packet form creation may initialize `field_instances` from resolvers + scoped defaults.
4. Users edit actual values through Packets → Fill Form.
5. Automatic business-data mappings are legitimate only when a distinct upstream object/workflow owns the value independently of the form instance.

**Rule applied:** If the only user-facing place to edit a value is Fill Form, it is not an independent automatic business source.

**Classification codes:**

- **B1** Genuine business object  
- **B2** Legitimate shared packet/transaction data  
- **B3** Form-instance data stored redundantly  
- **B4** Legacy default surrogate  
- **B5** Abandoned / unused architecture  
- **U** Unresolved  

---

## Source-Type Matrix

Counts are ACTIVE fields / ACTIVE mappings on ACTIVE forms / ACTIVE field_instances, from `harbaugh-forms-dev` dump 2026-07-21.

| Source type | Label | Path required? | Allowed paths / keys | Resolver | DB object read | UI that maintains it | Independent of Fill Form? | Active fields | Active mappings | Active instances | Initial class |
|---|---|---|---|---|---|---|---|---:|---:|---:|---|
| `settings_agent` | Settings · Agent profile | Yes (code) | `SETTINGS_AGENT_SOURCE_PATHS` | `resolveSettingsSourcePath` | `brokerage_settings` | `/settings` | Yes | 11 | 22 | 64 | **B1** |
| `settings_brokerage` | Settings · Brokerage profile | Yes | `SETTINGS_BROKERAGE_SOURCE_PATHS` | same | `brokerage_settings` | `/settings` | Yes | 23 | 47 | 130 | **B1** |
| `packet_contact` | Packet contact | Yes | `PACKET_CONTACT_SOURCE_PATHS` | `resolvePacketContactSourcePath` | `packet_contacts` + `contacts` | Contacts + packet edit | Yes | 20 | 22 | 41 | **B1/B2** |
| `packet_property` | Packet property | Yes | `PACKET_PROPERTY_SOURCE_PATHS` | `resolvePropertySourcePath` | `properties` | Properties + pickers | Yes | 23 | 71 | 66 | **B1** |
| `packet` | Packet metadata | Yes | `PACKET_SOURCE_PATHS` | `resolvePacketMetadataSourcePath` | `packets` (+ agreement dates) | Packet create/edit | Partial | **0** | 0 | 0 | **B5** |
| `buyer_rep_details` | Buyer rep details | Yes | `BUYER_REP_DETAILS_SOURCE_PATHS` | `resolveBuyerRepDetailsSourcePath` | `buyer_rep_details` via agreement | `/representation-agreements` | Yes (when agreement linked) | 17 | 17 | 68 | **Mixed B2+B4** |
| `listing_agreement_details` | Listing agreement details | **No** (`sourceTypeRequiresPath` omits it — bug) | Listing allowlist in `listing-agreement-field-resolution.ts` (incomplete; e.g. missing `lease_scheduling_company`) | `resolveListingAgreementDetailsSourcePath` | `listing_agreement_details` | `/listing-agreements` (partial columns only) | Partial / mostly no for expansion cols | 129 | 129 | 258 | **Mixed B2+B4** (mostly B4) |
| `contract_details` | Contract details | **Removed** | — | — | — | — | — | 0 | 0 | — | **Removed 2026-07-22** |
| `representation_agreement` | Representation agreement | Yes | `effective_date`, `expiration_date` | `resolveRepresentationAgreementSourcePath` | `representation_agreements` | Listing / Buyer Rep agreement screens | Yes | 2 | 2 | 8 | **B2** |
| `static_default` | Static default | Yes | `default_checked`, `default_value` | `resolveStaticDefaultSource` | catalog field | Map Fields (catalog) | N/A | **0** | 0 | 0 | **B5** |
| `custom_resolver` | Custom resolver | Resolver key | `CUSTOM_RESOLVER_KEYS` + HOA keys | `resolveCustomResolverKey` | mixed | N/A (computed) | Depends on inputs | 75 | 71 | 154 | **Mixed** (mostly B1 composites) |
| `manual_only` | Manual entry only | No | — | none (defaults chain) | — | Fill Form + scoped defaults | N/A | 406 | 401 | 378 | Product-aligned |
| `packet_instance` | Packet/form instance value | No | — | none | `field_instances` | Fill Form | N/A | 1 | 1 | 0 | Product-aligned |
| `(null)` unmapped | — | — | — | field-key heuristics / defaults | — | Fill Form | — | 27 | 23 | 78 | Review individually |

**Important code defects (read-only findings):**

1. `sourceTypeRequiresPath` does **not** include `listing_agreement_details`, so `normalizeFieldSourceInput` nulls `source_path` on UI save. Explains 18 ACTIVE listing fields with `source_type=listing_agreement_details` and `source_path=null`.
2. Listing resolver allowlist omits some seeded columns (e.g. `lease_scheduling_company`).
3. Seeded path `intermediary_allowed` for listing has **no matching column** on `listing_agreement_details` (column exists only on `buyer_rep_details`).

---

## Details-Table Inventory

### `representation_agreements`

| Attribute | Finding |
|---|---|
| Created | `20250608120000_initial_schema.sql` |
| PK | `id` bigint identity |
| Cardinality | One agreement; packets may optionally link via `packets.representation_agreement_id` |
| Current rows | 2 ACTIVE (1 BUYER_REP, 1 LISTING) |
| Auto-create | Only when user creates agreement on dedicated screens |
| Writers | `listing-agreements-page.tsx`, `representation-agreements-page.tsx` |
| UI | `/listing-agreements`, `/representation-agreements` |
| Resolver | Dates via `representation_agreement` / `packet` paths |
| Predates scoped defaults | Yes |
| Likely original purpose | Anchor for client representation matters |
| Classification | **B2** (lifecycle + dates). Packet linkage is now **legacy optional**. |

### `buyer_rep_details`

| Attribute | Finding |
|---|---|
| Created | `20250608120000` (+ expansions `20250622120000`, `20250622130000`) |
| Relationship | 1:1 with `representation_agreements` (`representation_agreement_id`) |
| Current rows | **1** (created 2026-06-08; `update_date` never changed) |
| Columns | 32; many defaults (`'NA'`, `0`, `true`/`false`, `'DFW'`, `3`, `30`, `'Dallas/Tarrant'`) |
| Writers | Representation agreements page only |
| UI | `BuyerRepAgreementForm` edits **all** business columns |
| Forms | TXR-1501 (17 active mappings) |
| Dual storage | Yes — instances exist; Fill Form does not write back |
| Predates scoped defaults | Yes |
| Classification | **Mixed:** B2 for agreement terms with real UI; **B4** for schema defaults that simulate preferences. Current collection-based buyer-rep packets usually have **no** agreement link → resolver returns null → scoped defaults / empty win. |

### `listing_agreement_details`

| Attribute | Finding |
|---|---|
| Created | `20250608120000`; major expansions `20250622200000` (TXR-1101), `20260630180000` (TXR-1102 lease), `20260701150000` |
| Relationship | 1:1 with listing `representation_agreements` |
| Current rows | **1** (2026-06-09; never updated) |
| Columns | ~152; ~100+ expansion columns with surrogate defaults |
| Writers | Listing agreements page only |
| UI | `ListingAgreementForm` edits **only original ~14 columns** (price, fees, showing service, exclusions, etc.). **No UI** for scheduling company, MLS options, financing checkboxes, addenda flags, lease block, late charges, animals, etc. |
| Forms | TXR-1101 (46 mappings), TXR-1102 (83 mappings) |
| Dual storage | Catalog points here; **0** active instances have `source=packet` from this table. Instances use empty / manual_override / private_default / field_default. |
| Predates scoped defaults | Yes |
| Classification | **Mixed, predominantly B4.** Thin B2 core (UI-backed columns). Expansion columns are legacy default surrogates without independent ownership. |

### `contract_details`

| Attribute | Finding |
|---|---|
| Created | `20250629140000_contract_details.sql` |
| Relationship | Intended 1 per packet (`packet_id`) |
| Current rows | **0** |
| Columns | 76; heavy `'NA'` / `0` / boolean defaults |
| Writers | **None in application code** |
| UI | **None** |
| Forms | TXR-1601 (63 mappings) |
| Instances | 252 active instances on contract-sourced fields; sources are empty / manual_override / defaults — **never** `packet` from contract_details |
| Predates scoped defaults | Yes |
| Classification | **B5** abandoned write architecture; schema defaults are **B4** surrogates that never fire because no rows are inserted. |

### `property_hoas`

| Attribute | Finding |
|---|---|
| Created | `20250620120000_property_hoas.sql` |
| Relationship | Many HOAs per property |
| Current rows | **0** |
| Writers | **None** |
| UI | **None** for this table. Property form writes HOA fields onto **`properties`** (`hoa_name`, `hoa_phone`, `hoa_management_company`, …). |
| Resolver | `property_hoa_name` / `property_hoa_phone` custom resolvers read `property_hoas` only |
| Parallel model | `packet_property` paths like `hoa_name` read `properties` |
| Classification | **B5** (table unused). HOA attributes on `properties` are **B1**. |

### Other analogous objects

- No separate `lease_details`, addendum-details, or transaction-details tables.
- Lease listing fields live on `listing_agreement_details`.
- `representation_agreement_clients` is a real join table (**B2**).

---

## Schema Defaults Inventory

All details tables predate `20260715180000_field_defaults_scoped.sql` and `20260717180000_clear_all_global_catalog_defaults.sql`. Catalog clears **did not** remove details-table column defaults.

Approximate surrogate counts across details tables (~292 columns):

| Kind | Approx count |
|---|---:|
| `'NA'` text defaults | 47 |
| Numeric / amount `0` | 65 |
| Boolean true/false | 91 |
| Standard text / enums (`BrokerBay`, `Dallas/Tarrant`, `WITH_OTHER_BROKER`, …) | ~17 |
| Structural (`status`, timestamps) | ~21 |

### Explicit high-interest surrogates

| Table | Column | Default | Class | Notes |
|---|---|---|---|---|
| `listing_agreement_details` | `scheduling_company` / `lease_scheduling_company` / `showing_service` | `'BrokerBay'` | B4 | Org default already covers Broker Bay for some lease fields |
| `listing_agreement_details` | `payment_county` / `lease_payment_county` | `'Dallas/Tarrant'` | B4 | Preference |
| `listing_agreement_details` | `known_districts`, `other_fees_reimbursable_expenses`, many exceptions | `'NA'` | B4 | No listing-form UI |
| `listing_agreement_details` | financing / addenda booleans | true/false | B4 | No listing-form UI |
| `buyer_rep_details` | `market_area` | `'DFW'` | B4 | UI exists; still preference-shaped |
| `buyer_rep_details` | `compensation_percent` | `3` | B4/B2 | Preference + agreement term |
| `buyer_rep_details` | `employer_relocation`, compensations | `'NA'` / `0` | B4 | Lee already restored Personal defaults for several |
| `contract_details` | escrow/title/special provisions | `'NA'` | B4 | Never applied (0 rows) |
| `brokerage_settings` | `default_market_area`, `default_buyer_rep_compensation_percent`, `default_protection_period_days`, `default_county_for_payment`, `default_employer_relocation`, `default_special_provisions`, `default_intermediary_allowed` | various | **B4/B5** | **No TypeScript references** |

**Should potentially move entirely to scoped `field_defaults`:** all preference-shaped details-column defaults listed above, especially listing expansion and contract_details defaults, once source types are converted away from details tables.

---

## Current Write Paths

| Object | Packet create | Agreement UI | Fill Form | Refresh | Background sync | Migrations only |
|---|---|---|---|---|---|---|
| `listing_agreement_details` | No | Insert/update/soft-delete | No | No | No | Schema only |
| `buyer_rep_details` | No | Insert/update/soft-delete | No | No | No | Schema only |
| `contract_details` | No | No | No | No | No | Schema only |
| `representation_agreements` | Link only (legacy) | Insert/update/soft-delete | No | No | No | — |
| `property_hoas` | No | No | No | No | No | Schema only |
| `properties` / `contacts` | May create/link | Via pickers | No write-back | No | No | — |
| `field_instances` | Ensure missing | — | **Yes (only)** | Optional refresh non-overrides | — | — |

**Fill Form behavior:** writes **only** `field_instances`. Never writes details tables. Never derives details from instances.

Ordinary open: `ensure_missing` — does not overwrite existing snapshots (including blank/false/zero).  
Explicit Refresh: `refresh_non_overrides` — may re-resolve from details if present and linked.

---

## Current Resolution Paths

Documented product precedence (after override / mapped transaction data) matches `decisions.md` and `resolveFieldValueFromContext`:

1. Manual override on `field_instances` (`is_override`)
2. Mapped source (`listing_agreement_details`, `buyer_rep_details`, `contract_details`, property, contact, settings, custom resolvers, …) when path resolves
3. Scoped Personal defaults (mapping → form → legacy all-forms)
4. Scoped Organization defaults (same tiers)
5. Structural catalog fallback / mapping override / catalog default / default_checked
6. Empty

**When details are read:** during instance ensure/refresh and resolution diagnostics — not as a live bind on every keystroke. Ordinary Fill Form open does **not** re-source existing non-override rows.

**Missing detail rows:** resolver returns null for that source → falls through to scoped defaults / empty. Schema defaults on details tables **only apply when a details row is INSERTed** (agreement create). They do **not** inject into packets that never create those rows.

**Mapped sources vs scoped defaults:** if a details value resolves, it precedes Personal defaults. For current listing/contract packets with no details row / no agreement link, mapped sources effectively do nothing.

---

## Dual-Storage Risks

| Field family | Details store | Instance store | Which wins | Sync | Divergence risk | Observed |
|---|---|---|---|---|---|---|
| Buyer Rep details-sourced | `buyer_rep_details` | `field_instances` | Instance snapshot / override; Refresh can re-pull details for non-overrides | One-way details → instances | High if agreement edited after fill | Yes — e.g. market area `DFW` vs instance `DFW Metro`; checkbox mismatches |
| Listing details-sourced | `listing_agreement_details` | `field_instances` | Same | One-way | High in theory; low in practice (packets unlinked; 0 packet-sourced instances) | Many empty instances vs non-empty details defaults on the lone historical row |
| Contract details-sourced | `contract_details` | `field_instances` | Instances only (no details rows) | N/A | Low today | N/A |
| Property / contact / settings | entity tables | `field_instances` | Same sticky snapshot model | One-way on ensure/refresh | Accepted product model | Present by design |

**193** divergent instance/details comparisons against the single historical listing + buyer-rep rows (includes formatting differences like dates and sticky empties). **Do not modify** these rows in this audit.

---

## Listing Agreement Findings

**Conclusion: mixed architecture, predominantly a legacy default surrogate for TXR-1101/1102 expansion fields; not an actively maintained fill source for current packets.**

Evidence:

- Active fields: **129**; mappings: **129** (46 on TXR-1101, 83 on TXR-1102).
- UI-owned source paths among those fields: **3** (`list_price`, `hoa_exists` ×2). Remainder map to columns with **no listing-form editor**.
- Null `source_path` ACTIVE fields: **18** (including disputed `OTHER_FEES_REIMBURSABLE_EXPENSES`, `KNOWN_DISTRICTS`) — broken by UI normalize bug / historical saves.
- Instance sources for listing-details fields: empty 211, manual 20, private_default 9, field_default/checked 17, organization_default 1, **packet 0**.
- Active listing packets (ids 5, 13, 19, …) have `representation_agreement_id = null`.
- Expansion migrations intentionally baked BrokerBay / Dallas-Tarrant / NA / 0 / checkbox defaults into the table before scoped defaults existed.

**Actively maintained?** Agreement header + thin original details: yes. Expansion block: no UI, no packet linkage → effectively dormant as a source.

---

## Buyer Representation Findings

**Conclusion: mixed — closest to a legitimate shared agreement object, but preference defaults are B4 and current packets often bypass it.**

| Concern | Finding |
|---|---|
| Compensation / retainer / lease fees | Stored on `buyer_rep_details`; editable in Buyer Rep agreement UI; also have Personal defaults for several keys |
| Employer relocation / other compensation / special provisions | Schema `'NA'` / `'0'`; Lee Personal defaults restored for several |
| Intermediary | Column + UI; schema default `true`; dual checkbox fields via paths/custom resolvers |
| Market area | UI + schema `'DFW'`; instances sometimes `'DFW Metro'` from defaults |
| Addenda checkboxes | UI + schema booleans |
| Genuine packet data vs preferences | Agreement term fields can be B2 when agreement-anchored; many values are still preference defaults (B4) |
| Current usage | Only packet 2 still links to agreement 1; newer buyer_rep packets use collection flow without agreement |

---

## Contract Findings

**Conclusion: `contract_details` is abandoned as a write model (B5). Mapped fields behave as Fill Form / scoped-default fields despite `source_type=contract_details`.**

| Topic | Finding |
|---|---|
| Property exclusions | Catalog often `manual_only`; Lee Personal `NA` restored for `CONTRACT_PROPERTY_EXCLUSIONS` |
| Title objection use/activity | Mapped `contract_details.title_objection_use_activity`; no rows → Personal default / empty |
| Special provisions / broker disclosure | Same pattern |
| Service-contract reimbursement / seller expense | Same; Personal `"0"` restored |
| Independent maintenance? | **No** — no UI, no writers, 0 rows |

---

## Lease Findings

Lease listing (TXR-1102) columns live on `listing_agreement_details` (scheduling company, landlord conditions-adjacent flags, utilities exceptions, fees, management/make-ready). Residential Lease (TXR-2001) fields are largely `manual_only` with Lee Personal `NA` defaults for several.

`lease_scheduling_company` default `'BrokerBay'` is a classic B4 surrogate; Organization defaults already encode Broker Bay for some related fields. Restoring listing `source_path` alone would not fully resolve because the listing allowlist omits that path.

---

## HOA Findings

| Store | Status |
|---|---|
| `properties.hoa_*` | **B1** — editable on property form; used by `packet_property` paths |
| `property_hoas` | **B5** — 0 rows, no UI, resolver-only |
| `HOA_ASSOCIATION_ADDRESS` | Active field with `source_type=packet_instance`, null path. Seeded historically as `manual_only`. **No genuine upstream HOA address source today** beyond free-text Fill Form / defaults. |

---

## Active Mappings to Inactive Fields

Global scan of ACTIVE `form_field_mappings` → non-ACTIVE `fields`:

| Mapping ID | Form | Page | Field key | Field status |
|---|---|---:|---|---|
| `d2d51f3e-a4a2-44b9-8ea1-6ec1cc0089f9` | TXR-1501 | 6 | `BUYER_REP_BROKER_SGN_CHECKBOX` | INACTIVE |

**Only this one.** No broader epidemic.

Also: 3 ACTIVE `field_instances` still reference that inactive field (values `"false"`).

---

## Classification Summary

### By object / family

| Item | Class |
|---|---|
| `properties`, `contacts` | B1 |
| `packet_contacts`, packet property link | B2 |
| `brokerage_settings` profile columns | B1 |
| `brokerage_settings.default_*` | B4/B5 |
| `user_agent_settings` | B1 (admin) but unused by resolver |
| `representation_agreements` | B2 |
| `buyer_rep_details` UI-backed terms | B2 |
| `buyer_rep_details` schema preference defaults | B4 |
| `listing_agreement_details` UI-backed core | B2 (thin) |
| `listing_agreement_details` TXR expansion columns | **B4** |
| `contract_details` table / source type | **B5** |
| `contract_details` column defaults | B4 (inert) |
| `property_hoas` | **B5** |
| `packet` / `static_default` source types | B5 |
| `manual_only` / `packet_instance` | Product-aligned |
| `custom_resolver` (names, notices, survey options) | Mixed B1 composites / B3 when only for PDF |

### Totals (primary classifications assigned in this audit)

| Class | Count (objects / families / major column groups) |
|---|---:|
| B1 | 5 |
| B2 | 4 |
| B3 | 2 (redundant instance copies of details-sourced values; sticky snapshots) |
| B4 | 6 (listing expansion, buyer-rep defaults, contract defaults, brokerage default_*, scheduling/county literals, NA/0 surrogates) |
| B5 | 5 (`contract_details`, `property_hoas`, unused source types, unused brokerage defaults, unused HOA table) |
| U | 1 (`BUYER_REP_BROKER_SGN_CHECKBOX` repair identity — history clear, safe remapping target still U) |

---

## Candidate Simplifications

| Source object | Field / column | Current purpose | Actual UI owner | Class | Packet usage | Scoped-default replacement | Risk if → manual-only | Migration implications | Recommended action | Confidence |
|---|---|---|---|---|---|---|---|---|---|---|
| `listing_agreement_details` | TXR-1101/1102 expansion columns / fields | Auto-fill listing/lease listing PDFs | Fill Form only | B4 | Instances exist; not sourced from table | Move preferences to Personal/Org defaults (many already) | Low–medium | Change `source_type` to `manual_only`; leave table for history | Convert expansion-backed catalog fields to `manual_only`; stop treating table as fill source | High |
| `listing_agreement_details` | 18 null-`source_path` fields | Broken mapped source | Fill Form / defaults | B4 + defect | Yes | Prefer defaults over restoring paths | Low | Do **not** mass-restore paths | Leave unrestored until architecture decision; fix normalize bug separately | High |
| `contract_details` | All mapped fields | Intended contract object | Fill Form only | B5 | High instance count | Already largely defaults/manual | Low | Flip `source_type` → `manual_only`; retain empty table | Deprecate source type; do not start writing rows | High |
| `buyer_rep_details` | Preference-shaped columns | Agreement + defaults | Agreement UI + Fill Form | B2+B4 | Legacy linked packet only | Already partially in Personal defaults | Medium if agreement workflow still desired | Keep table if agreement UI stays; stop requiring it for packet fill | Decide whether agreement-anchored packets remain supported | Medium |
| `property_hoas` | entire table | Multi-HOA entity | None | B5 | None | N/A | None | Eventually drop after resolver switch to `properties` | Point HOA resolvers at `properties`; deprecate table | High |
| `brokerage_settings` | `default_*` | Old global prefs | None (unused) | B4/B5 | None | `field_defaults` | None | Ignore or later drop columns | Do not revive; document obsolete | High |
| `listing_agreement_details` | UI core (`list_price`, …) | Shared listing terms | Listing Agreements | B2 | Only if agreement linked | N/A | N/A | Keep | Keep for agreement screen; optional future packet link | Medium |

---

## Items Requiring Lee’s Decision

1. **Is the Listing / Buyer Rep agreement workflow still a first-class product path**, or is collection-based packet create the only supported path going forward?
2. **Should TXR-1101/1102 expansion fields become `manual_only` + scoped defaults**, abandoning `listing_agreement_details` as an automatic source?
3. **Should `contract_details` source type be deprecated** without ever creating rows?
4. **HOA model:** keep editing on `properties` and retire `property_hoas`, or build a real multi-HOA UI?
5. **Disputed listing fields** (`OTHER_FEES_REIMBURSABLE_EXPENSES`, `KNOWN_DISTRICTS`): mapping-integrity audit found visible blanks; default-transition audit left unrestored. Align those decisions with this architecture conclusion (do not restore via details `source_path`).
6. **`BUYER_REP_BROKER_SGN_CHECKBOX`:** approve a safe repair approach (see below) separately from architecture cleanup.
7. **Whether to fix** `sourceTypeRequiresPath` for `listing_agreement_details` at all — fixing it without converting fields would re-enable an obsolete source family.

---

## Recommended Implementation Order

1. **Lee reviews this audit** — no code/data changes yet.
2. **Smallest safe phase:** deprecate / convert `contract_details`-sourced fields to `manual_only` (behavior already matches; 0 rows).
3. Convert listing expansion fields (especially null-path and no-UI columns) to `manual_only`; rely on existing scoped defaults; **do not** restore listing `source_path`s en masse.
4. Fix or quarantine the `normalizeFieldSourceInput` / `sourceTypeRequiresPath` listing omission **only after** deciding the source family is retired or retained.
5. Point HOA custom resolvers at `properties`; mark `property_hoas` deprecated.
6. Separate ticket: Buyer Rep inactive checkbox mapping repair.
7. Long-term: staged deprecation of unused tables/columns; retain for historical packets as needed.

**Explicitly out of scope until Lee decides:** deleting tables, removing schema defaults in place, reactivating inactive fields, resuming the blocked source-path repair migration.

---

## Historical Intent Answers (per Phase 4)

For `listing_agreement_details`, `buyer_rep_details`, `contract_details`:

1. Introduced before scoped defaults? **Yes.**
2. Created with Global catalog defaults era? **Yes** (same early product wave).
3. DB column defaults used to prefill forms? **Yes** (via INSERT on agreement create + resolver).
4. User-facing details screen? Buyer Rep **yes (full)**; Listing **partial**; Contract **no**.
5. One object populate several forms? **Intended** for listing sale+lease and buyer-rep; contract per packet.
6. Superseded by `field_defaults` / `field_instances`? **De facto yes** for current collection packets.
7. Current docs describe as active? Resolver/types still active; packet wizard marks agreement path **legacy**.
8. Covered by tests? Resolver/defaults tests exist; not a dedicated “details still authoritative” suite for listing expansion.
9. Real usage beyond seeded defaults? Buyer Rep: some `source=packet` on legacy linked packet. Listing/Contract: **no** meaningful packet-sourced usage.
10. Safe to call legacy default surrogate? **Listing expansion + contract_details: yes. Buyer Rep: partially. Listing UI core: no (still a real agreement form).**

---

## Buyer Rep Inactive Checkbox (Phase 10 detail)

| Item | Finding |
|---|---|
| Field | `BUYER_REP_BROKER_SGN_CHECKBOX` id `2a32353f-0923-40ed-98f0-e60815ad4e96` |
| Status | INACTIVE; `source_type` null; GLOBAL |
| Created | 2026-06-22 |
| Updated | 2026-07-13 (multi-user foundation wave timestamp) |
| Mapping | ACTIVE on TXR-1501 p.6 |
| Instances | 3 ACTIVE, value `"false"` |
| Active-key collisions | No other ACTIVE field with this exact key found |
| Suspected cause | Incomplete inactivation / failed dedup — mapping & instances not inactivated with field |
| Broader defect? | **No** — global scan found only this mapping |
| Likely safe repair (not implemented) | Either (a) soft-inactivate the orphan mapping + leave historical instances, or (b) reactivate the field as `manual_only` if the checkbox is still required on the PDF. Do **not** invent a “canonical replacement” without visual confirmation of the PDF control. |
| **Resolution (2026-07-21)** | Option (b) implemented in `20260721190000_remove_abandoned_contract_details_sources.sql`: field reactivated as ACTIVE `manual_only` with strict ID/key/status preconditions and a unique-key guard. Mapping, coordinates, and the 3 historical instances (value `"false"`, source `empty`, non-override) untouched. Key `BUYER_REP_BROKER_SGN_CHECKBOX` ("SGN") is not Authentisign-excluded, so signing behavior is unchanged. |

---

## Data Integrity Statement

This audit made **no** changes to:

- database schema or rows  
- mappings, defaults, packets, or field instances  
- application source or migrations  

Temporary read-only dump directory `_arch_tmp/` was used and should be removed after validation.

---

## Appendix — Instance Source Provenance (active)

| Instance `source` | Count |
|---|---:|
| empty | 942 |
| settings | 192 |
| manual_override | 134 |
| property | 55 |
| contact_role | 48 |
| field_default | 40 |
| field_default_checked | 31 |
| packet | 21 |
| private_default | 20 |
| mapping_override | 13 |
| organization_default | 1 |

Only **21** instances are tagged `packet` (mostly buyer-rep details / agreement dates from the legacy linked packet). Listing and contract details contribute **zero** `packet`-sourced instances.
