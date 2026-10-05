---
name: Drizzle array filter parameters
description: Avoid malformed PostgreSQL array literals in filters that use runtime string arrays.
---

For runtime string-array filters, prefer Drizzle `inArray(column, values)` over interpolating a JavaScript array into raw SQL such as `= ANY(${values}::text[])`. In this app's query path, the raw interpolation bound `"cash"` as a scalar, causing PostgreSQL's `malformed array literal` error and a 500 response.

**Why:** The UI can hide a failed list query as an empty result while a separate summary request still succeeds, making a parameter-binding error look like incorrect filtering.

**How to apply:** Use `inArray` for dynamic payment method, payer, creator, and similar filters. Verify list results, tab counts, and pagination against the development database when changing these clauses.