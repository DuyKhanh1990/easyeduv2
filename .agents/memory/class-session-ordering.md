---
name: Class session ordering
description: Canonical ordering and identity rules for class sessions when dates can be edited.
---

`class_sessions.id` identifies the record, while `sessionIndex` identifies its business lesson number. `sessionDate` must never determine lesson numbering or array order because staff can move a lesson to another date.

**Why:** Sorting by date made one lesson appear as another number, causing dialogs and range operations to refer to different records even though the API request succeeded.

**How to apply:** Return and render class sessions by `sessionIndex ASC`; display `session.sessionIndex`; send session IDs for record selection and range endpoints; only resequence during explicit insert/delete/exclusion operations.