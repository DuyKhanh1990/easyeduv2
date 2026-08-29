---
name: queryClient null-return bug
description: Root cause of widespread null.map/null.find crashes — queryClient returned null instead of undefined, bypassing = [] defaults.
---

## The Rule
Never return `null` from the default `queryFn` — it bypasses destructuring defaults like `= []`.
TanStack Query v5 destructuring `{ data: x = [] }` only substitutes `[]` when `data` is `undefined`, not when it is `null`.

**Why:** `queryClient.ts` had `if (!getAuthToken()) return null as T` as an early-return guard. This fired when the JWT token was absent from localStorage — even for users authenticated via session cookies. The result was that every query using the default queryFn returned `null`, and any `.map()`, `.find()`, `.filter()` call on the destructured data crashed with "Cannot read properties of null".

**How to apply:** 
- The fix was to remove the early-return line entirely. Session cookie auth (`credentials: "include"`) works without a JWT header, so removing the guard is safe.
- Defense-in-depth: also add `?? []` guards before `.map()/.find()` on all query data that uses the default queryFn without a custom queryFn, especially for config queries like `/api/task-statuses`, `/api/task-levels`, `/api/locations`, `/api/departments`.
- Any new query that uses the default queryFn and calls array methods on the result should use `(data ?? []).map(...)` pattern.
