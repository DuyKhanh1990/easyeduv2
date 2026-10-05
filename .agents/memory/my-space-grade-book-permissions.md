---
name: My Space grade-book permissions
description: Keep My Space score-book actions separate from Education schedule permissions.
---

**Rule:** My Space grade-book create, edit, and delete actions use the `/my-space/score-sheet` permission resource. Education routes keep their existing `/schedule` and `/classes` checks. The server must determine the permission resource from the route, not a client-supplied flag, and class visibility/assignment scope must remain enforced.

**Why:** The same grade-book data is used by multiple pages, but staff can have different action rights on My Space and Education.

**How to apply:** Keep My Space dialogs on the My Space grade-book API route and gate their controls with the matching page permission. Do not repoint Education callers or weaken existing class-scope checks.