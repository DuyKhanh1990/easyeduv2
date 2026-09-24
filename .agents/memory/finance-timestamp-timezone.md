---
name: Finance timestamp timezone
description: Database timezone and interpretation rules for finance TIMESTAMP WITHOUT TIME ZONE fields.
---

Finance timestamps without timezone are stored as Vietnam wall-clock time. The database session timezone is `Asia/Ho_Chi_Minh`; the PostgreSQL parser currently appends a synthetic `Z` to these values, so their serialized UTC-looking components are not necessarily UTC instants.

For invoice history, convert the naive timestamp to a real instant with `AT TIME ZONE 'Asia/Ho_Chi_Minh'` once, then format/filter the resulting instant in Vietnam time. SQL date filters over the original naive columns must use literal Vietnam midnight boundaries. Invoice API values that still pass through the synthetic-Z parser must keep their original clock components rather than receiving another +07:00 shift.

Apply the same rule outside finance: persisted local database timestamps must be parsed as Vietnam wall-clock values before display, relative-time calculations, sorting, or comparisons. True instants supplied by external services remain normal ISO instants and must not use the wall-clock parser. Calendar-only values stay as `YYYY-MM-DD`.

**Why:** A recent audit row was stored at 10:18 Vietnam time while the page showed 17:18; the database reported `Asia/Ho_Chi_Minh`, confirming a double conversion.

**How to apply:** Use the shared Vietnam wall-clock helpers for local database timestamps and exclusive next-day SQL boundaries for date ranges. Identify external instants explicitly. Do not change the global PostgreSQL parser without auditing all consumers.