# Source Registry and Resolver Cleanup Audit

**Base HEAD:** `de5d6420da1f2f80fcfb7edee97926d9f4e58212`  
**Database:** `harbaugh-forms-dev` (no production)  
**Audit date:** 2026-07-22  
**Mode:** Read-only gate → implement when all removals are S3 / proven S4

---

**Implementation:** Completed same day after S3/S4 gate passed (migration applied to `harbaugh-forms-dev`; packet fingerprint unchanged).

---

## Executive Summary

The application source registry still exposes two **unused selectable source types** (`packet`, `static_default`) and many **Listing/Lease inverse checkbox custom-resolver keys** that have **no runtime implementation** after `listing_agreement_details` removal. Genuine Buyer Rep, Property, Contact, Agent, Brokerage, HOA, and Collection workflows remain intact.

**Decision gate:** proposed removals are **S3** or **proven S4**. No material Lee product decisions block implementation.

**Exact removal / normalize set:**

1. **S3 — Remove source types** `packet` and `static_default` from registry, selector, validation, resolver dispatch, and `fields_source_type_check` (keep provenance display for instance `source = 'packet'`).
2. **S4 — Convert 53 ACTIVE fields** whose `custom_resolver` keys have no implementation (Listing/Lease remnants) → `manual_only` (clear path/resolver).
3. **S4 — Normalize** `PROPERTY_ADDRESS` (`27e50ce0-…`) to `packet_property` + `full_address` (clear dead `resolver_key`).
4. **S3 — Trim** unused `CUSTOM_RESOLVER_KEYS` / dead `resolveCustomResolverKey` branches with zero fields; **add** live keys already implemented (`landlord_*`, `seller_city_state_zip`).
5. **S3 — Soft-delete** orphan `field_resolvers` contract_* catalog rows; clear their `field_resolver_id` links on already-`manual_only` fields.
6. **Retain** all Buyer Rep sources, provenance labels for historical `source='packet'` instances, and live custom resolvers.

---

## Source-Type Matrix

| Source type | Label | DB constraint | Map Fields? | Path required? | Path registry | Resolver | ACTIVE | INACTIVE | DELETED | Active mappings | Provenance note | Class | Action | Confidence |
|---|---|---|---|---|---|---|---:|---:|---:|---:|---|---|---|---|
| `settings_agent` | Settings · Agent profile | Yes | Yes | Yes | `SETTINGS_AGENT_SOURCE_PATHS` | `resolveSettingsSourcePath` | 11 | 0 | 0 | 22 | instance `settings` | S1 | Retain | High |
| `settings_brokerage` | Settings · Brokerage profile | Yes | Yes | Yes | `SETTINGS_BROKERAGE_SOURCE_PATHS` | `resolveSettingsSourcePath` | 23 | 2 | 3 | 47 | instance `settings` | S1 | Retain | High |
| `packet_contact` | Packet contact | Yes | Yes | Yes | `PACKET_CONTACT_SOURCE_PATHS` | `resolvePacketContactSourcePath` | 20 | 0 | 2 | 22 | `contact_role` | S1 | Retain | High |
| `packet_property` | Packet property | Yes | Yes | Yes | `PACKET_PROPERTY_SOURCE_PATHS` | `resolvePropertySourcePath` (+ HOA/city specials) | 21 | 0 | 0 | 69 | `property` | S1 | Retain | High |
| `packet` | Packet metadata | Yes | Yes | Yes | `PACKET_SOURCE_PATHS` | `resolvePacketMetadataSourcePath` | **0** | 0 | 0 | 0 | N/A (type unused) | S3 | Remove from registry | High |
| `buyer_rep_details` | Buyer rep details | Yes | Yes | Yes | `BUYER_REP_DETAILS_SOURCE_PATHS` | `resolveBuyerRepDetailsSourcePath` | 17 | 0 | 0 | 17 | 19× instance `packet` | S1 | Retain | High |
| `representation_agreement` | Representation agreement | Yes | Yes | Yes | `effective_date`, `expiration_date` | `resolveRepresentationAgreementSourcePath` | 2 | 0 | 0 | 2 | 2× instance `packet` | S1 | Retain | High |
| `static_default` | Static default | Yes | Yes | Yes | `default_checked`, `default_value` | `resolveStaticDefaultSource` | **0** | 0 | 0 | 0 | N/A | S3 | Remove; prefs use `field_defaults` | High |
| `custom_resolver` | Custom resolver | Yes | Yes | Resolver key | `CUSTOM_RESOLVER_KEYS` | `resolveCustomResolverKey` | 68 | 1 | 0 | 68 | mixed | Mixed S1/S4 | Trim dead; keep live | High |
| `manual_only` | Manual entry only | Yes | Yes | No | — | none (defaults chain) | 609 | 2 | 8 | 599 | defaults / override | S1 | Retain | High |
| `packet_instance` | Packet/form instance value | Yes | Yes | No | — | instance / defaults | 1 | 0 | 0 | 1 | product | S1 | Retain | High |
| `(null)` | — | allowed | — | — | field-key fallbacks | 27 ACTIVE | 61 INACTIVE | 7 DELETED | 22 | fallbacks | S1/S5 | Retain; no broad refactor | High |

Code: `lib/types/field-source.ts`, `components/forms/field-source-form-fields.tsx`, `lib/field-resolver.ts`, constraint updated by `20260722190000_remove_listing_legacy_workflow.sql`.

---

## Source-Path Matrix

### Families retained (S1)

* **Agent / Brokerage** — all registered identity/contact paths remain; some agent address paths unused by catalog but backed by `brokerage_settings`.
* **Packet contact / property** — canonical + legacy aliases retained; HOA via `property_hoas` / HOA resolvers.
* **Buyer Rep details** — all column paths retained (even unused catalog paths still map to agreement UI columns).
* **Representation agreement** — `effective_date`, `expiration_date` in use.

### Families removed (S3)

| Path family | Paths | Active fields | Action |
|---|---|---:|---|
| `packet` | `packet_name`, `packet_type`, `effective_date`, `expiration_date`, `created_date` | 0 | Remove with source type |
| `static_default` | `default_checked`, `default_value` | 0 | Remove with source type |

### Flags

* No registered path still points at dropped `contract_details` / `listing_agreement_details` / `brokerage_settings.default_*` columns.
* `PROPERTY_ADDRESS` has `packet_property` + **null** path + stale `resolver_key=property_full_address` → unreachable automatic resolve (**normalize now**).

---

## Custom Resolver Matrix

### Registered `CUSTOM_RESOLVER_KEYS` vs live fields

| Resolver key | Implemented? | ACTIVE custom_resolver fields | Class | Action |
|---|---|---:|---|---|
| `property_hoa_name` / `property_hoa_phone` | Yes | 3 / 1 | S1 | Retain; keep in registry |
| `buyer_names`, `buyer_notice_phone`, `buyer_notice_email` | Yes | 1 each | S1 | Retain |
| `buyer_client_address`, `buyer_client_city_state_zip` | Yes | 1 each | S1 | Retain |
| `buyer_rep_agreement_between`, `buyer_rep_retainer_will_not_apply`, `buyer_rep_intermediary_status_no` | Yes | 1 each | S1 | Retain |
| `brokerage_city_state_zip` | Yes | 0 ACTIVE (1 INACTIVE) | S2 | Retain key + impl |
| `landlord_address`, `landlord_city_state_zip`, `seller_city_state_zip` | Yes | 1 each | S1 | **Add to registry** (implemented, missing from selector) |
| `agent_full_name`, `broker_full_name` | Yes | 0 | S3 | Remove from selector + dead branch (settings paths cover) |
| `property_address_city`, `property_address_street_zip` | Yes | 0 | S3 | Remove selector + dead branch (+ packet_property city special if unused) |
| `seller_names`, `buyer_notice_address`, `seller_notice_*` | Yes | 0 | S3 | Remove selector + dead branch |
| `seller_address` | Yes | 0 | S3 | Remove dead branch |

### Unimplemented ACTIVE keys (Listing/Lease remnants) — S4 convert → `manual_only`

53 ACTIVE fields (exact IDs in migration). Keys include `lease_*`, `listing_*`, `mls_*`, `internet_*`, `keybox_authorized_no`, `seller_authorizes_buyer_expense_disclosure_no`.  
**Proof:** `resolveCustomResolverKey` has no branches; upstream `listing_agreement_details` gone; resolve returns null → defaults chain already. Conversion makes metadata honest without changing packet snapshots.

### `field_resolvers` catalog (parallel UI catalog)

Runtime **does not** read `field_resolver_id`. Contract survey/effective-day catalog rows still linked from already-`manual_only` fields. Soft-delete those catalog rows and clear FKs (**S3**). Broader catalog vs `CUSTOM_RESOLVER_KEYS` unification is **S5 later**.

---

## Packet Source-Type Review

* Fields any status with `source_type='packet'`: **0**
* Selector currently exposes “Packet metadata”
* Resolver + `PACKET_SOURCE_PATHS` exist but unused
* **21** field_instances have provenance `source='packet'` — all from `buyer_rep_details` / `representation_agreement` / Buyer Rep custom resolvers on the legacy linked agreement packet — **not** from source type `packet`
* Classification: **S3** remove selectable type; **retain** provenance label mapping for instance `source='packet'` → “From packet”

---

## Static Default Review

* Selectable; paths `default_checked` / `default_value`; **0** fields any status
* Overlap with structural `fallback_value` / `default_checked` on fields and scoped `field_defaults`
* Classification: **S3** remove source type; do **not** remove structural fallback/default_checked column behavior

---

## Buyer Rep and Representation Sources

* **17** ACTIVE `buyer_rep_details` fields + **2** `representation_agreement` date fields — **retain**
* Custom resolvers `buyer_rep_agreement_between`, retainer/intermediary **no** variants — **retain**
* Field-key checkbox fallbacks for yes/no retainer/intermediary — **retain**
* Preference-shaped details columns vs scoped defaults: architecture risk already documented; **out of scope** (do not strip Buyer Rep)

---

## Provenance Compatibility

| Instance `source` | Count | Display label | Needs source-type registry? |
|---|---:|---|---|
| `empty` | 945 | Blank | No |
| `settings` | 193 | Agent/Brokerage (refined) | No |
| `manual_override` | 134 | Entered manually | No |
| `property` | 55 | From property | No |
| `contact_role` | 48 | From client | No |
| `field_default` / `field_default_checked` | 71 | Default | No |
| `packet` | 21 | From packet | **Display only** — keep |
| `private_default` | 20 | From your default | No |
| `mapping_override` | 13 | From form mapping | No |
| `organization_default` | 1 | From organization default | No |

Removing selectable `packet` / `static_default` does **not** change these labels.

---

## Field-Key Fallbacks

`CONTEXT_FIELD_KEY_HANDLERS` (only when `source_type` is null): Buyer Rep checkbox keys, buyer-client helpers, contact-role patterns, HOA keys, `property_*` strip, settings field names.

Classification: **S1/S5** — retain; no broad refactor in this cleanup.

---

## Invalid or Unreachable Metadata

| Item | Classification | Action |
|---|---|---|
| 53 Listing/Lease `custom_resolver` fields, no impl | active defect → S4 | → `manual_only` |
| `PROPERTY_ADDRESS` null path + `property_full_address` key | active defect → S4 | set `full_address`, clear key |
| `packet_property` rows with redundant resolver_key while path set | harmless | clear resolver_key optional |
| Contract `field_resolvers` links on `manual_only` fields | historical residue | clear FK; soft-delete catalog |
| `manual_only` with leftover path/resolver | none material beyond above | — |

---

## Exact Removal Set

* Source types: `packet`, `static_default`
* Paths: `PACKET_SOURCE_PATHS`, `STATIC_DEFAULT_SOURCE_PATHS`
* Resolver functions: `resolvePacketMetadataSourcePath` (if only used by `packet`), `resolveStaticDefaultSource`
* Unused custom-resolver registry keys / branches listed above
* DB: shrink `fields_source_type_check`; soft-delete contract `field_resolvers`

## Exact Retention Set

* All other source types; Buyer Rep + representation paths; live custom resolvers; HOA; settings; contacts; property; `manual_only`; `packet_instance`
* Provenance display for `source='packet'`
* Structural fallback / default_checked / scoped defaults

## Conversion Candidates

* 53 Listing/Lease unreachable custom_resolver fields → `manual_only`
* `PROPERTY_ADDRESS` path repair

## Lee Decisions Required

**None for this removal set.**

Deferred (not blocking):

* Unify `field_resolvers` catalog with `CUSTOM_RESOLVER_KEYS` (S5)
* Rebuild Listing inverse-checkbox automatic sources if product wants agreement-linked Listing again (S5)
* Move Buyer Rep preference columns entirely onto scoped defaults (product)

## Recommended Implementation Plan

1. Branch `remove-unused-source-registry-code`
2. Migration: normalize 53 fields + PROPERTY_ADDRESS; soft-delete contract resolvers; shrink source-type check; verify zero rows use removed types
3. Code: registry/UI/resolver/tests/docs
4. Fingerprint packets/defaults; run suites; PR; squash-merge
