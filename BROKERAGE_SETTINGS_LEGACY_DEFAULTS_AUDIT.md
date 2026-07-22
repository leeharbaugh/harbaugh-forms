# Brokerage Settings Legacy Defaults Audit

**Branch:** `remove-brokerage-legacy-default-columns`  
**Base HEAD:** `67a989f2313a9ca7b155ab4f3b3b8242884f5e3e`  
**Database:** `harbaugh-forms-dev`  
**Audit date:** 2026-07-22  
**Implementation:** Completed same day after D1 gate passed

---

## Executive Summary

`public.brokerage_settings` mixes **genuine brokerage/agent/broker identity profile fields** (keep) with **seven legacy `default_*` preference columns** created in the initial schema before scoped `field_defaults`.

Fresh verification:

* **0** TypeScript references to any `default_*` column name
* **0** catalog fields with a matching `source_path`
* Settings UI reads/writes only profile fields via `AgentProfileInput` / `BrokerageProfileInput`
* `SETTINGS_BROKERAGE_SOURCE_PATHS` lists only identity/contact paths
* Preferences such as market area, protection period, intermediary, payment county, and Broker Bay already live in Personal/Organization `field_defaults`

**Decision gate:** all seven columns are **D1 — Remove now**. No Lee product decisions required. No catalog field conversion (D2) required.

---

## Full Brokerage Settings Schema

Structural + profile columns (retain): `id`, `create_date`, `update_date`, `status`, agent name/address/license/phone/email, brokerage name/address/city/state/zip/office phone/license/email, broker name/license/phone/email, supervisor name/license/phone/email.

Legacy preference columns (remove): see table below.

One ACTIVE row (`id = 1`). Profile values are live; `default_*` values match schema defaults and have no application readers.

---

## Legacy Default Columns

| Column | Type | DB default | Current value | Readers | Writers | UI | Active Fields | Packet Use | Scoped Replacement | Classification | Action | Confidence |
|---|---|---|---|---|---|---|---:|---:|---|---|---|---|
| `default_market_area` | varchar | `'DFW'` | `DFW` | None | None | No | 0 | 0 | Personal `BUYER_REP_MARKET_AREA` = `DFW Metro` (approximate wording) | D1 / B3 | Drop | High |
| `default_buyer_rep_compensation_percent` | numeric(5,2) | `3.00` | `3.00` | None | None | No | 0 | 0 | No ACTIVE field_default for “3% buyer rep fee”; compensation prefs live on form fields via Fill Form / other defaults — column unused | D1 / B3 | Drop | High |
| `default_protection_period_days` | integer | `30` | `30` | None | None | No | 0 | 0 | Personal `PROTECTION_PERIOD_DAYS` = `30`; TXR-1102 `lease_protection_period_days` = `30` | D1 / B3 | Drop | High |
| `default_county_for_payment` | varchar | `'Dallas/Tarrant'` | `Dallas/Tarrant` | None | None | No | 0 | 0 | Personal `PAYMENT_COUNTY` = `Dallas/Tarrant`; TXR-1102 `lease_payment_county` = `Dallas/Tarrant` | D1 / B3 | Drop | High |
| `default_employer_relocation` | varchar | `'NA'` | `NA` | None | None | No | 0 | 0 | Personal `BUYER_REP_EMPLOYER_RELOCATION` / `EMPLOYER_RELOCATION_COMPANY` = `NA` | D1 / B3 | Drop | High |
| `default_special_provisions` | text | `'NA'` | `NA` | None | None | No | 0 | 0 | Personal `SPECIAL_PROVISIONS` / Contract / Lease special-provisions defaults = `NA` (and form-specific narrative defaults elsewhere) | D1 / B3 | Drop | High |
| `default_intermediary_allowed` | boolean | `true` | `true` | None | None | No | 0 | 0 | Personal checked defaults: `ALLOW_INTERMEDIARY`, `BUYER_REP_INTERMEDIARY_STATUS_YES`, `LISTING_INTERMEDIARY_YES`, `lease_intermediary_yes` | D1 / B3 | Drop | High |

Also drop check constraint `brokerage_settings_protection_period_non_negative` (depends on `default_protection_period_days`).

---

## Historical Intent

All seven columns were created in `20250608120000_initial_schema.sql` as hard-coded brokerage-wide form prefills. They predate scoped `field_defaults` (`20260715180000`). No later migration added UI or TypeScript usage. Profile expansion (`20250617120000_brokerage_settings_profile_fields.sql`) added agent/broker name/address fields and did not touch `default_*`.

Classification of original intent: unfinished / superseded preference architecture — not genuine brokerage identity.

---

## Current UI and Write Paths

| Surface | Reads | Writes |
|---|---|---|
| `/settings` (`settings-page.tsx`) | Profile fields via `fetchActiveBrokerageSettings` → agent/brokerage forms | Explicit profile column updates only |
| `lib/types/brokerage-settings.ts` | Typed `BrokerageSettings` **excludes** all `default_*` | `agentProfileInputToRow` / `brokerageProfileInputToRow` |
| Resolver | `settings_agent` / `settings_brokerage` paths from `SETTINGS_*_SOURCE_PATHS` | None for `default_*` |

`select('*')` would return `default_*` at runtime, but typed code never references them; `resolveBrokerageSettingsField` only returns string profile fields for registered paths.

---

## Resolver and Source-Path Usage

* ACTIVE `settings_brokerage` fields: **23**, all on genuine paths (`brokerage_name`, address, phones, licenses, broker identity, etc.).
* Fields with `source_path` in the seven `default_*` names: **0** (any status).
* Packet instances: **193** with `source = 'settings'` come from genuine profile resolution, not `default_*` columns.

---

## Scoped-Default Replacements

Preferences already live in `field_defaults` (examples above). Removing unused columns does not change resolution precedence: the columns were never in the resolver path allowlist.

No new defaults are created by this cleanup.

---

## Packet Evidence

No packet instance provenance depends on reading `brokerage_settings.default_*`. Existing snapshots store their own values. Ordinary open must remain immutable — verified by fingerprint after migration.

---

## Column Classifications / Exact Removal Set

**Remove (D1):** all seven columns listed above.  
**Retain:** every non-`default_*` brokerage_settings column.  
**D2/D3/D4/U:** none for this set.

---

## Lee Decisions Required

None for this removal set.

---

## Migration and Code Plan

* Migration: `20260722200000_remove_brokerage_legacy_default_columns.sql`
* Drop constraint then seven columns; no `CASCADE`; type/precondition checks; profile postconditions
* Application: no TypeScript property removals needed (already absent); add regression tests
* Docs: `project_status.md`, `decisions.md`, `SOURCE_OBJECT_ARCHITECTURE_AUDIT.md`
