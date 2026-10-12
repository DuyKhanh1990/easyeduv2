---
name: Course catalog code and name requirements
description: Course and course-program records require both a nonblank code and a nonblank display name.
---

For both courses and course programs, code and name are mandatory, and whitespace-only values are invalid. Enforce the rule in the forms and on the server for create and update requests.

**Why:** A catalog item with a valid ID and code but an empty name can be saved and selected later, leaving a blank label in class forms.

**How to apply:** Trim and reject empty code/name values in all course and course-program create/update paths; do not infer a missing name from the code without explicit approval.
