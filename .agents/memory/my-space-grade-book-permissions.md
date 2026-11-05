---
name: My Space grade-book permissions
description: Keep My Space score-book actions separate from Education schedule permissions.
---

**Rule:** On My Space Score Sheet, View is always enabled; View All and Delete are unsupported. Create and Edit are independent: creating a grade book requires Create, and updating one requires Edit. Education routes keep their existing `/schedule` and `/classes` checks. The server must determine the permission resource from the route, and class visibility/assignment scope must remain enforced.

**Why:** The user requested fixed View and no View All/Delete on this page, with Create and Edit controlling distinct actions. The same grade-book data is used by multiple pages, but staff can have different action rights on My Space and Education.

**How to apply:** Keep My Space dialogs on the My Space grade-book API route and gate Create/Edit controls and handlers with their matching flags. Do not repoint Education callers or weaken existing class-scope checks.

For conversion assessments attached to scheduled class sessions in My Space, access and visibility require the current assignment to that specific session. Class-level teacher membership or class-manager status alone does not grant access. Keep regular grade books and manually created assessments unchanged; retain explicit score-conversion administration permissions for authorized education administrators.

**Why:** The user confirmed that a conversion assessment belongs to its individual session, so class-manager status must not grant visibility when the user is not assigned to that session.

**How to apply:** Apply the session-assignment rule to session-bound conversion rows and their My Space view/edit APIs. Preserve explicit education-administrator permissions, score records, attempts, publication state, manual assessments, non-conversion sheets, and unrelated permission flows.