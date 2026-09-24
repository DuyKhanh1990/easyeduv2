---
name: EasyEdu system time standard
description: Target policy for timestamps, center timezones, and legacy migration.
---

## Rule

EasyEdu stores event instants as UTC-backed `TIMESTAMPTZ`. Each center's `center_config` owns an IANA timezone, defaulting to `Asia/Ho_Chi_Minh`. Backend/server time is authoritative; business-day boundaries are calculated in the center timezone, and clients format instants explicitly in that timezone. Date-only values and recurring local schedules remain local calendar dates/times rather than being converted into UTC instants.

Legacy `TIMESTAMP WITHOUT TIME ZONE` values currently represent Vietnam wall-clock time in many fields. Keep the compatibility parser until each column is classified and migrated explicitly. Do not blanket-convert columns or treat existing values as UTC; ambiguous deadlines and external-provider timestamps need field-level decisions.

**Why:** Centers must not inherit a user's device timezone, while an unsafe bulk conversion could shift historical timestamps or change date-only schedule semantics.

**How to apply:** For each field, establish whether it is an instant, a local date/time, or an external value; migrate actual instants using the legacy source zone, update schema and consumers together, verify on a safe database copy, and only then remove legacy parsing. Production changes require per-center rollout and verification.