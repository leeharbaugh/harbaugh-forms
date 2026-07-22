# Listing Legacy Workflow Cleanup Audit

**Branch:** `remove-listing-legacy-workflow`  
**Base HEAD:** `8055a1dd0d69f741a45a3c22b458eb75afbdf828`  
**Database:** `harbaugh-forms-dev` (project `ewxsxwzezhkeawnjvigx`)  
**Audit date:** 2026-07-22  
**Implementation:** Completed 2026-07-22

Related prior work:

- `LISTING_AGREEMENT_DETAILS_REVIEW.md` — selective source conversion (132 fields → `manual_only`)
- `SOURCE_OBJECT_ARCHITECTURE_AUDIT.md` — original B2/B4 classification
- `decisions.md` — “Legacy Listing Agreement Workflow Removed”
- PR #7 — `contract_details` architecture removed

---

## Implementation Update (2026-07-22)

Lee confirmed the single details row was disposable development data (no export/archive). Cleanup applied:

* Hard-deleted `listing_agreement_details` id=`1`
* Soft-deleted LISTING `representation_agreements` id=`2` and client links ids=`3`,`4`
* Dropped `public.listing_agreement_details` (no CASCADE)
* Normalized 8 DELETED catalog fields → `manual_only` / null path (status remains DELETED)
* Removed `/listing-agreements`, Listing types/resolver helpers, Listing legacy wizard branch
* Preserved Buyer Rep + collection Listing packets; `generatePacketFromAgreement` is Buyer Rep only
* Migration: `20260722190000_remove_listing_legacy_workflow.sql`
* Fingerprints unchanged: field_instances `527cf0d3…` (1501); packets `c26604e2…` (17)

---

## Executive Summary (pre-implementation audit)

The Listing Agreement **details table and `/listing-agreements` workflow were obsolete for current product behavior** and were removed before production after Lee decided the historical development row was disposable.

Current collection-based Listing packets (5 total: 3 ACTIVE, 2 DELETED) all have `representation_agreement_id = null`. **Zero packets** linked to LISTING representation agreement `#2`. **Zero** `field_instances` used `source = 'listing_agreement_details'`. **Zero ACTIVE** catalog fields used that source type (only **8 DELETED** historical fields still carried the text before normalization).

**Implemented approach:** Option L6 (remove Listing agreement workflow; preserve Buyer Rep) with hard-delete of the disposable details row (no export) and soft-delete of LISTING parent `#2`.

---

## Database Inventory

### `public.listing_agreement_details`

| Attribute | Finding |
|---|---|
| Columns | **152** (5 structural + **147** business) |
| Rows | **1** ACTIVE (`id = 1`); 0 INACTIVE/DELETED |
| PK | `id` bigint identity |
| FK | `representation_agreement_id` → `representation_agreements(id)` ON DELETE RESTRICT |
| Unique | Partial unique index `listing_agreement_details_agreement_active_uidx` (one ACTIVE details row per agreement) |
| Indexes | `listing_agreement_details_status_idx`; partial unique above |
| Checks | status; representation_kind SALE/LEASE; service_contract_amount ≥ 0 |
| Triggers | `listing_agreement_details_set_update_date` → shared `set_update_date()`; `listing_agreement_details_validate_agreement_type` → shared `validate_representation_agreement_detail()` |
| RLS | `listing_agreement_details_select/insert/update` via `owns_agreement(...)`; no DELETE policy (soft-delete only) |
| Views / matviews | None depend on this table |
| Incoming FKs | **None** (packets do not FK to details; only to parent agreements) |

### Related `representation_agreements`

| id | type | status | lifecycle | property_id | owner | packets linked |
|---:|---|---|---|---:|---|---:|
| 1 | BUYER_REP | ACTIVE | ACTIVE | null | Lee | **4** (1 ACTIVE, 3 DELETED) |
| 2 | LISTING | ACTIVE | ACTIVE | 1 | Lee | **0** |

### `buyer_rep_details`

| Attribute | Finding |
|---|---|
| Rows | **1** ACTIVE (`representation_agreement_id = 1`) |
| Classification | **R3** — retain with Buyer Rep workflow |

### `representation_agreement_clients`

| Agreement | Links |
|---|---|
| `#1` BUYER_REP | 2 ACTIVE (PRIMARY, CO_CLIENT) |
| `#2` LISTING | 2 ACTIVE (SELLER, CO_CLIENT) |

### Catalog / packet provenance

| Check | Count |
|---:|
| ACTIVE fields `source_type = 'listing_agreement_details'` | **0** |
| DELETED fields still typed `listing_agreement_details` | **8** |
| `field_instances` with `source = 'listing_agreement_details'` | **0** |
| Packets with `representation_agreement_id` set | **4** (all BUYER_REP `#1`) |
| Listing-typed packets with agreement link | **0** |

Deleted fields still typed (must normalize before shrinking check constraint):

- `listing_add_flood_hazard`, `listing_add_iabs`, `listing_add_other_document`, `listing_add_other_document_description`, `listing_add_property_insurance`, `listing_payment_county`, `listing_protection_period_days`, `listing_special_provisions`

### `fields_source_type_check`

Still includes `'listing_agreement_details'` (text CHECK, not an enum). Application `FIELD_SOURCE_TYPES` still lists it. `sourcePathsForType('listing_agreement_details')` returns `[]` (no path registry).

---

## Historical Listing Row

| Field | Value (non-sensitive) |
|---|---|
| Details `id` | `1` |
| Parent agreement | `representation_agreements.id = 2` (LISTING) |
| Status | ACTIVE |
| Created / updated | 2026-06-09 (identical — **never edited after create**) |
| Owner | Lee (`e26c8f57-…`) via parent agreement |
| Property | `property_id = 1` on parent |
| Sellers | 2 client links on parent (SELLER + CO_CLIENT) |
| Packet linkage | **None** |

### Populated original core (UI) columns

Meaningful non-default values observed:

- `representation_kind = SALE`
- `list_price = 350000`
- `seller_broker_fee_percent = 3`
- `buyer_broker_fee_percent = 3`
- `preferred_title_company = 'Byers and Taylor - Mansfield'`
- `occupancy_status = 'Occupied'`
- `hoa_exists = false`
- `seller_disclosure_required = true`
- `lead_based_paint_required = false`
- Showing / exclusions / included personal property / access notes present (UI defaults or entered text)

### Expansion columns

~133 TXR-1101 / TXR-1102 expansion columns hold **schema defaults only** (`NA`, `0`, booleans, `BrokerBay`, `Dallas/Tarrant`, enum defaults, null term dates). Never maintained independently; never applied into packet instances.

### Historical value assessment

| Question | Answer |
|---|---|
| Looks like real vs test data? | **Dev-era sample** with a few plausible commercial values; not a production transaction record |
| Ever linked to a packet? | **No** |
| Audit / external document dependency? | **None found** |
| Needed for collection Listing packets? | **No** |

**Disposition options for Lee:**

1. **Export JSON/CSV of core + parent metadata, then delete** (recommended default)
2. Retain in an archive table (heavier; little benefit with one row)
3. Keep table indefinitely (defeats production-schema cleanliness)
4. Delete without export if Lee confirms disposable test data

---

## Representation Agreement Relationship

`representation_agreements` is a **shared parent** for both BUYER_REP and LISTING, distinguished by `agreement_type`.

| Concern | Finding |
|---|---|
| Shared with Buyer Rep? | **Yes** — same table |
| Buyer Rep details child | `buyer_rep_details` (retain) |
| Listing details child | `listing_agreement_details` (removable) |
| Shared validation function | `validate_representation_agreement_detail()` — keep; Listing trigger goes away with table |
| Packets FK | `packets.representation_agreement_id` → agreements (Buyer Rep historical packets depend on `#1`) |
| Can LISTING `#2` be archived independently? | **Yes**, after details row handled; does not affect BUYER_REP `#1` or its 4 packets |

**Do not drop `representation_agreements` wholesale.**

---

## Route Reachability

### `/listing-agreements`

| Aspect | Finding |
|---|---|
| App navigation (`components/app-nav.tsx`) | **Not listed** |
| Direct URL | **Reachable** (layout wraps `AppNav` with `active="packets"`) |
| Create | **Yes** — inserts LISTING `representation_agreements` + details + clients |
| Edit historical row | **Yes** — updates the 14 UI columns |
| Soft-delete / reactivate | Soft-delete supported (`status='DELETED'`); show-deleted pattern present |
| Other screens linking in | Packet wizard legacy empty-state text only |
| Packet generation from route | **No** direct; wizard can use legacy agreement anchor separately |
| Auth / owner isolation | RLS `owns_agreement` / owner_user_id (post multi-user) |
| Tests | No dedicated UI route test; types covered indirectly via listing source-removal tests |

**Route status: hidden but fully reachable and writable — obsolete for current workflow.**

### `/representation-agreements`

Parallel Buyer Rep UI; also not in main nav; **retain for now** (out of scope to remove here). Referenced by the same legacy wizard path.

---

## Legacy Packet Workflow

### Current (active) creation — Collections

| Path | Function | `representation_agreement_id` | Reachability |
|---|---|---|---|
| Packets → Create wizard (standard) | `createPacketFromCollection` | **Always `null`** | Primary UI |
| Listing / Lease listing flows | Same | null | Active |

**Current packet creation exclusively uses Collections for new work.** Listing workflow type remains a first-class collection-based flow and must stay.

### Legacy agreement-anchored creation

| Path | Function | Marked | Reachability | Listing packets produced |
|---|---|---|---|---|
| Wizard “Advanced (legacy)” | `generatePacketFromAgreement` | `@legacy` | Hidden card inside create wizard | **0** |
| `create-packet-form.tsx` | Same | Legacy | Used by legacy wizard step | Buyer Rep historical only |

`workflowSupportsLegacyAgreement` returns true for **both** `buyer_rep` and `listing`.

| Packet set | Count | Agreement link |
|---|---:|---|
| `packet_type = listing` | 5 (3 ACTIVE / 2 DELETED) | All `representation_agreement_id` null |
| Any packet → LISTING agreement `#2` | 0 | — |
| Packets → BUYER_REP `#1` | 4 | Historical / mixed status |

**Removing Listing agreement workflow does not affect collection-based Listing packet creation.**

---

## Listing Versus Buyer Rep Shared Architecture

| Object | Serves | Action |
|---|---|---|
| `representation_agreements` | Both | **Retain** |
| `representation_agreement_clients` | Both | **Retain** (may soft-delete LISTING `#2` links only) |
| `buyer_rep_details` | Buyer Rep only | **Retain** |
| `listing_agreement_details` | Listing only | **Remove after archive/export** |
| `/representation-agreements` + Buyer Rep form/types | Buyer Rep | **Retain** |
| `/listing-agreements` + Listing form/types | Listing only | **Remove** |
| `generatePacketFromAgreement` | Both (legacy) | **Retain** for Buyer Rep; drop Listing agreement loading / wizard listing branch |
| `createPacketFromCollection` | All workflows | **Retain** |
| Contact helpers / property pickers | Shared UI primitives | **Retain** |
| `formatAgreementStatus` etc. | Duplicated in listing + buyer-rep type modules | Keep Buyer Rep copies; delete Listing module |
| `validate_representation_agreement_detail()` | Both child tables | **Retain** function; drop Listing-only trigger with table |
| `FIELD_SOURCE_TYPES` / resolver `listing_agreement_details` | Listing-only dead path | **Remove** after normalizing 8 DELETED fields |
| `buyer_rep_details` / `representation_agreement` sources | Buyer Rep | **Retain** |

---

## Column Usage

147 business columns grouped (aligned with prior `LISTING_AGREEMENT_DETAILS_REVIEW.md`; re-verified post source conversion):

### Original core columns (~14 UI-exposed)

`representation_kind`, `list_price`, `seller_broker_fee_percent`, `buyer_broker_fee_percent`, `showing_service`, `hoa_exists`, `lead_based_paint_required`, `seller_disclosure_required`, `exclusions`, `included_personal_property`, `service_contract_amount`, `preferred_title_company`, `occupancy_status`, `access_notes`

| Usage | Today |
|---|---|
| UI reads/writes | **Only** `/listing-agreements` |
| Resolver reads | Dead (no ACTIVE sourced fields; no linked listing packets) |
| Packet provenance | None |
| Recommendation | Preserve via **one-time export** of the single row; then drop with table |

### TXR-1101 expansion columns

Legacy form-prefill scaffolding (commission models, financing flags, MLS options, addendum flags, known districts, etc.).

| Usage | Today |
|---|---|
| UI | None |
| Catalog sources | Converted to `manual_only` |
| Packet | Fill Form / scoped defaults only |
| Recommendation | Drop with table |

### TXR-1102 expansion columns

Lease-prefill scaffolding (~80+ columns). Resolver allowlist never covered most paths.

| Usage | Today |
|---|---|
| UI | None |
| Catalog | Converted; TXR-1102 uses reviewed Personal defaults |
| Recommendation | Drop with table |

### Orphan columns

No UI, no ACTIVE mapped field, no reader/writer beyond schema defaults on INSERT (~16+ including stranded DELETED-field columns).

| Recommendation | Drop with table |

### Summary usage matrix

| Group | Approx count | UI R/W | Server R/W | Resolver | Mapped ACTIVE | Packet provenance | Docs/tests |
|---|---:|---|---|---|---|---|---|
| Core UI | ~14 | Legacy route only | Same | Dead | 0 | 0 | Prior audits |
| TXR-1101 expansion | ~48 | No | Schema default on insert only | Dead | 0 | 0 | Prior audits |
| TXR-1102 expansion | ~80+ | No | Schema default on insert only | Dead | 0 | 0 | Prior audits |
| Orphans | ~16 | No | No | No | 0 | 0 | Named in prior review |

**Table reduction to a “historical core” is not worth it** for one row. Prefer export + full drop.

---

## Historical Preservation Options

| Option | Complexity | History safety | Prod cleanliness | Maintenance | Rollback | Buyer Rep | Packets | Migrations | Fit |
|---|---|---|---|---|---|---|---|---|---|
| **L1** Keep table + route | None | High | Poor | High | N/A | Unaffected | Unaffected | None | Poor — carries dead UX into prod |
| **L2** Read-only route | Low | High | Poor | Medium | Easy | Unaffected | Unaffected | Small | Weak — still ships 152-col table |
| **L3** Export row, remove route + table | Medium | High if export kept | Excellent | Low | Re-import export | Unaffected | Unaffected | Forward-only drop | **Strong** |
| **L4** Archive table for core row | Medium-High | High | Medium | Medium | Easy | Unaffected | Unaffected | New archive + drop | Overkill for 1 row |
| **L5** Keep agreements, remove only details | Medium | Medium | Good | Low | Medium | Unaffected | Unaffected | Drop details only | Incomplete — leaves orphan LISTING `#2` + dead route |
| **L6** Remove Listing workflow; preserve Buyer Rep | Medium | Depends on L3 | Excellent | Low | Medium | **Preserved** | Collection listing OK | Forward-only | **Recommended primary** |

### Recommended staged approach

1. **Lee decides** historical-row disposition (export vs discard).
2. **App PR:** remove `/listing-agreements`, Listing components/types, Listing legacy wizard branch; strip resolver/source registry for `listing_agreement_details`; normalize 8 DELETED fields → `manual_only`.
3. **DB migration (dev):** export snapshot (optional file in repo or ops note), soft-delete or delete LISTING agreement `#2` clients + agreement (only if no FK blockers), `DROP TABLE listing_agreement_details` **without CASCADE**, shrink `fields_source_type_check`, assert Buyer Rep objects intact.
4. **Do not** remove Buyer Rep route/table or collection Listing packet create.

---

## Recommended Cleanup

**Classification target:** Listing details + Listing route = **R1** after export; LISTING parent `#2` = **R2→R1** with Lee approval; Buyer Rep stack = **R3**.

**Confidence:** High for technical removal; Medium for whether Lee wants any archival copy of the sample row.

---

## Exact Code Deletion Scope

### Remove (Listing-only)

| Path | Symbols / notes |
|---|---|
| `app/listing-agreements/page.tsx` | Route entry |
| `app/listing-agreements/layout.tsx` | Layout |
| `components/listing-agreements/listing-agreements-page.tsx` | Only writer to `listing_agreement_details` |
| `components/listing-agreements/listing-agreement-form.tsx` | Form UI |
| `lib/types/listing-agreement.ts` | Types, validation, normalize helpers |
| `lib/types/listing-agreement-field-resolution.ts` | Resolver path allowlist / value helpers |
| `lib/field-resolver.ts` | `listingAgreementDetails` context, load join, `case "listing_agreement_details"`, normalize join helper |
| `lib/types/field-source.ts` | Remove `listing_agreement_details` from `FIELD_SOURCE_TYPES` + labels |
| `lib/types/field-provenance-labels.ts` | Listing details provenance branch |
| `components/packets/create-packet-wizard.tsx` | Listing imports; Listing branch of legacy agreement UI / copy mentioning `/listing-agreements` |
| Docs that list table as current | Update in implementation PR (`project_status.md`, `decisions.md`, audits) |

### Keep (Buyer Rep / shared / collection Listing)

| Path | Why |
|---|---|
| `app/representation-agreements/**` | Buyer Rep UI |
| `components/representation-agreements/**` | Buyer Rep UI |
| `lib/types/buyer-rep-agreement.ts` | Buyer Rep types |
| `lib/types/buyer-rep-field-resolution.ts` | Buyer Rep resolver helpers |
| `createPacketFromCollection` | Primary packet create |
| Listing **collection** workflow in `packet-workflow.ts` | Active product flow |
| `generatePacketFromAgreement` | Keep for Buyer Rep legacy until separately audited; remove Listing agreement queries only |
| `lib/types/listing-packet-kind.ts` (+ test) | Sale vs lease listing **packet** kind — not agreement details |
| `lib/listing-details-source-removal.test.ts` | Keep as historical regression for prior conversion; add new removal suite in implementation PR |

### Tests / fixtures

| Item | Action |
|---|---|
| New `lib/listing-legacy-workflow-removal.test.ts` (future) | Assert table gone, source type rejected, route files absent |
| `listing-details-source-removal.test.ts` | Retain |
| Storage tests mentioning `listing-agreement.pdf` | **Keep** — PDF filename, not details table |

---

## Database Migration Plan

Design only — **do not implement in this audit**.

Forward-only migration (approx name `YYYYMMDDHHMMSS_remove_listing_agreement_details_architecture.sql`):

1. **Precondition:** `listing_agreement_details` row count is 0 **or** exactly the approved historical set after export/archive step.
2. **Normalize** 8 DELETED fields: `source_type = 'manual_only'`, `source_path = null` where currently `listing_agreement_details`.
3. **Assert** no ACTIVE field uses `listing_agreement_details`; no `field_instances.source = 'listing_agreement_details'`.
4. **Assert** no packet has `representation_agreement_id` pointing at a LISTING agreement that still requires details (today: none).
5. Optionally soft-delete LISTING agreement `#2` and its client links **after** details drop, or delete details first then soft-delete parent.
6. Drop Listing-specific policies and triggers on `listing_agreement_details`.
7. `DROP TABLE public.listing_agreement_details;` — **no CASCADE**. If PostgreSQL reports dependencies, inspect explicitly.
8. Rebuild `fields_source_type_check` **without** `'listing_agreement_details'`.
9. **Postcondition:** table absent; Buyer Rep tables present; `set_update_date()` and `validate_representation_agreement_detail()` still exist; `buyer_rep_details` trigger intact; packet fingerprints unchanged.

Preserve all historical migrations that created/expanded the table.

---

## Production-Readiness Impact

| Artifact | Carry into first production? |
|---|---|
| `/listing-agreements` route | **No** |
| Historical details row | **No** (dev sample); optional export kept outside prod DB |
| 152-column `listing_agreement_details` | **No** |
| Listing-specific packet-linking via agreements | **No** |
| Collection-based Listing packets | **Yes** |
| `representation_agreements` + Buyer Rep details/UI | **Yes** (until separate Buyer Rep legacy audit) |
| Scoped defaults / Fill Form for TXR-1101/1102 | **Yes** |

Prefer not to ship dead Listing agreement architecture into production. Removing it now simplifies the first production baseline.

---

## Object Table

| Object | Kind | Rows/Usage | Readers | Writers | Historical Value | Shared with Buyer Rep? | Classification | Recommended Action | Risk | Confidence |
|---|---|---:|---|---|---|---|---|---|---|---|
| `listing_agreement_details` | Table | 1 row / 152 cols | Legacy UI; dead resolver | Legacy UI only | Low–medium (dev sample) | No | R2→R1 | Export then drop | Low | High |
| LISTING `representation_agreements` `#2` | Row | 1 | Legacy UI; unused by packets | Legacy UI | Low | Table shared; row Listing-only | R2→R1 | Soft-delete/archive with cleanup | Low | High |
| BUYER_REP `representation_agreements` `#1` | Row | 1 | Buyer Rep UI; 4 packets | Buyer Rep UI | Medium | Yes | R3 | Retain | High if removed | High |
| `representation_agreements` table | Table | 2 | Both workflows | Both UIs | High | Yes | R3 | Retain table | High if dropped | High |
| `buyer_rep_details` | Table | 1 | Resolver / Buyer Rep UI | Buyer Rep UI | Medium | No (Buyer only) | R3 | Retain | High if removed | High |
| `representation_agreement_clients` | Table | 4 links | Agreement UIs | Agreement UIs | Medium | Yes | R3 | Retain; drop Listing `#2` links only | Low | High |
| `/listing-agreements` | Route/UI | Hidden URL | Authenticated owner | Full CRUD | None for product | No | R1 | Delete route + components | Low | High |
| `/representation-agreements` | Route/UI | Hidden URL | Authenticated owner | Full CRUD | Buyer Rep ops | Buyer only | R3 / R5 | Retain for now | Medium if removed early | High |
| `generatePacketFromAgreement` | Code | Legacy | Wizard | Inserts packets | Buyer history | Both | R3 (Buyer) / R1 (Listing branch) | Keep Buyer; remove Listing branch | Low | High |
| `createPacketFromCollection` | Code | Primary | Packets UI | Inserts packets | N/A | All workflows | R3 | Retain | High if removed | High |
| Listing collection workflow | Product flow | Active | Packets UI | Packets UI | N/A | N/A | R3 | Retain | High if removed | High |
| Source type `listing_agreement_details` | Registry + CHECK | 0 ACTIVE / 8 DELETED | Map Fields option | Validation | None | No | R1 | Normalize DELETED fields; remove type | Low | High |
| Resolver Listing details load | Code | Dead | field-resolver | None | None | No | R1 | Remove | Low | High |
| `listing-agreement.ts` / field-resolution | Types | Listing UI + resolver | App | App | None | Partial name overlap only | R1 | Delete modules | Low | High |
| 8 DELETED catalog fields | Metadata | 8 | None active | None | Catalog history | No | R4 | Set `manual_only` / null path before CHECK shrink | Low | High |
| TXR-1101/1102 `manual_only` fields | Catalog | 132 converted | Fill Form / defaults | Map Fields defaults | High (forms) | No | R3 | Retain | High if altered | High |
| Packet field instances | Data | Unchanged | Fill Form | Fill Form | High | N/A | R3 | Do not rewrite | High if touched | High |

---

## Lee Decisions Required

1. **Historical details row `id=1`:** export then delete, delete without export, or keep an archive table?
2. **LISTING parent agreement `#2` (+ seller client links):** soft-delete/remove with the details cleanup, or leave the orphan LISTING agreement row?
3. **Timing:** remove Listing route/code in the same PR as the DB drop, or route-first then migration?
4. **Buyer Rep legacy route** `/representation-agreements`: confirm **out of scope** for this cleanup (recommended: leave for a separate audit).
5. **Legacy wizard Listing branch:** remove now with Listing cleanup (recommended) even if Buyer Rep legacy path remains?

Decisions **not** required (safe to infer):

- Collection Listing packet create stays.
- Buyer Rep tables/UI stay.
- No packet instances depend on Listing details.
- Table should not ship to production as an active write model.
- Historical migrations stay; use forward-only drop.

---

## Data Integrity (this audit)

- No code, schema, rows, packets, defaults, mappings, or migrations modified.
- Only new untracked artifact: this file.

---

## Appendix — Key evidence queries (2026-07-22)

```text
listing_agreement_details rows = 1
representation_agreements = 1 BUYER_REP + 1 LISTING
buyer_rep_details rows = 1
packets with representation_agreement_id → LISTING = 0
packets with representation_agreement_id → BUYER_REP = 4
ACTIVE fields source_type listing_agreement_details = 0
DELETED fields source_type listing_agreement_details = 8
field_instances source listing_agreement_details = 0
listing packets (ids 5,11,13,15,19) all representation_agreement_id IS NULL
```
