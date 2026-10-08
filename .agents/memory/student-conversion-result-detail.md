---
name: Student conversion result detail
description: Learner-facing conversion result details must match the selected attempt and include scores and saved feedback.
---

**Rule:** Show each skill's raw score/max and converted international score/max from the same highest/latest attempt used for the result summary. Include that attempt's saved part scores, notes, and entered evaluation criteria. Preserve the existing publication, enrollment, and exclusion scope.

**Why:** A published summary without its selected attempt's detail did not match the staff conversion view and left students and parents unable to see score breakdowns or evaluations.

**How to apply:** Keep score selection on the server; return detail only for results already eligible for the student/parent view, and render stored scores and responses rather than recalculating them in the client.
