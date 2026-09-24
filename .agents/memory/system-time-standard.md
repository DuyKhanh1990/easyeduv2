---
name: EasyEdu system time standard
description: Target policy for timestamps, center timezones, and legacy migration.
---

## Rule

EasyEdu stores event instants as UTC-backed `TIMESTAMPTZ`. Each center's `center_config` owns an IANA timezone, defaulting to `Asia/Ho_Chi_Minh`. Backend/server time is authoritative; business-day boundaries are calculated in the center timezone, and clients format instants explicitly in that timezone. Date-only values and recurring local schedules remain local calendar dates/times rather than being converted into UTC instants.

Legacy `TIMESTAMP WITHOUT TIME ZONE` values mix Vietnam wall-clock and UTC-naive writes, sometimes within the same table: database `defaultNow()` follows the database session zone, while explicit JavaScript `Date` writes can persist UTC clock components. Keep the compatibility parser until each field and its consumers are classified. Do not blanket-convert columns, assume all values are Vietnam wall time, or treat them all as UTC. Ambiguous historical rows have no intrinsic provenance; their exact instant cannot be recovered from the stored timestamp alone.

**Why:** Centers must not inherit a user's device timezone. An unsafe bulk conversion would shift some historical instants, and neither a database snapshot nor a naive timestamp alone identifies the original writer's timezone convention. A controlled create/edit test also confirmed that a browser can add seven hours solely while rendering a legacy timestamp; a screen's displayed hour is not reliable provenance by itself.

**How to apply:** For each field and write path, establish whether it is an instant, local date/time, or external value; classify legacy rows by independent evidence. Controlled tests should compare the operation's real time, the raw DB value, the actual write path, and the UI formatter before drawing conclusions. Leave unresolved historical values untouched until a source or an explicit user-approved policy exists. Migrate verified instants with their actual source zone, update schema and consumers together, verify on a safe database copy, and only then remove legacy parsing. Production changes require per-center rollout and verification.

## Test-data history exception

When the user explicitly authorizes changing a database whose contents are test data, canonical future behavior may take priority over proving every historical row's writer. If a legacy value is interpreted from an audited application writer rather than independent row-level evidence, keep a per-row copy of the original wall-clock value and report the assumption and uncertain rows plainly. An exact round-trip check proves that the conversion was applied as intended, **not** that the inferred source timezone was historically correct.

**Why:** Some test attendance values could not be paired to independent action logs even though the known application writers use the same UTC-naive convention; a blanket claim of proven historical instants would overstate the evidence.

**How to apply:** Make this an explicit, reversible exception for authorized test data only. Do not generalize it to production or mixed-writer columns, and never erase the distinction between transformation verification and provenance verification.

## Delivery order

Complete one user-visible business flow end to end as a reusable example before moving to the next page. Group fields that share a writer rule, but verify the whole flow (storage, filtering, display, and reversible test data) rather than turning every column into a separate user-facing milestone.

**Why:** The user preferred an immediately usable Invoices example over a multi-day estimate for changing the entire application at once; a long per-column cadence had not answered whether the standard could work in practice.

**How to apply:** Reuse the invoice approach for later pages on development, with source-aware backups and explicit historical assumptions. Keep calendar-only fields distinct and do not imply that a working example proves every legacy row or an authenticated UI path.