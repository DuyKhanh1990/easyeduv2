---
name: My Space grade-book permissions
description: Keep My Space score-book actions separate from Education schedule permissions.
---

**Rule:** On My Space Score Sheet, View is always enabled; View All and Delete are unsupported. Create and Edit are independent: creating a grade book requires Create, and updating one requires Edit. Education routes keep their existing `/schedule` and `/classes` checks. The server must determine the permission resource from the route, and class visibility/assignment scope must remain enforced.

**Why:** The user requested fixed View and no View All/Delete on this page, with Create and Edit controlling distinct actions. The same grade-book data is used by multiple pages, but staff can have different action rights on My Space and Education.

**How to apply:** Keep My Space dialogs on the My Space grade-book API route and gate Create/Edit controls and handlers with their matching flags. Do not repoint Education callers or weaken existing class-scope checks.

For conversion assessments attached to scheduled class sessions, a teacher's visibility must follow the current assignment to that specific session; class-level teacher membership alone is too broad. Preserve class-manager access and do not change regular grade books or manually created assessments.

**Why:** The user clarified that teachers may teach only some sessions in a class, and a replaced teacher should not keep seeing the conversion assessment for a session they no longer teach.

**How to apply:** Apply the session-assignment rule only to session-bound conversion rows in the My Space staff assessment list. Keep score records, attempts, publication state, manual assessments, non-conversion sheets, and unrelated permission flows unchanged.