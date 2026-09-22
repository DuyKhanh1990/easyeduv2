---
name: Grade book roster snapshot
description: Grade books keep a creation-time student roster and require explicit additions for later active enrollments.
---

## Rule
Store the student IDs that were active when a grade book was created. Editing a grade book must submit that roster explicitly; students who become active later are candidates for manual addition, while excluded roster members remain distinguishable and restorable.

**Why:** A live query of current active enrollments silently changes the meaning of an existing grade book and can add students who were not part of the original assessment.

**How to apply:** Keep the roster separate from scores/comments and excluded IDs. For legacy rows without a snapshot, infer a best-effort roster from enrollments created no later than the grade book and existing grade data, then persist it on the next edit.