---
name: Finance timestamp timezone
description: Database timezone and interpretation rules for finance TIMESTAMP WITHOUT TIME ZONE fields.
---

Finance timestamps without timezone are stored as Vietnam wall-clock time. The database session timezone is `Asia/Ho_Chi_Minh`; the PostgreSQL parser currently appends a synthetic `Z` to these values, so their serialized UTC-looking components are not necessarily UTC instants.

For invoice history, convert the naive timestamp to a real instant with `AT TIME ZONE 'Asia/Ho_Chi_Minh'` once, then format/filter the resulting instant in Vietnam time. SQL date filters over the original naive columns must use literal Vietnam midnight boundaries. Invoice API values that still pass through the synthetic-Z parser must keep their original clock components rather than receiving another +07:00 shift.

**Why:** A recent audit row was stored at 10:18 Vietnam time while the page showed 17:18; the database reported `Asia/Ho_Chi_Minh`, confirming a double conversion.

**How to apply:** Whenever handling finance timestamps, first identify whether a value is a naive Vietnam wall-clock or an actual instant. Do not change the global PostgreSQL parser without auditing all consumers.