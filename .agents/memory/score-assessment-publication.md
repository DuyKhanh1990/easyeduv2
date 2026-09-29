---
name: Score conversion publication
description: Scope and visibility rules for publishing converted assessment results to learners.
---

## Rule
Store publication state on the scheduled class session, not on the shared assessment configuration. Student and parent views must require both a published session and that student's enrollment, then use the assessment's configured highest/latest attempt policy.

**Why:** One assessment configuration can be reused across different class sessions, so a global flag could expose scores for a session that was not published. The result policy must also match what staff see.

**How to apply:** When adding learner-facing access or notifications, scope them to the class session, enrolled student, and saved attempt summary. Notify only scored learners on the transition from unpublished to published.