---
name: Class Excel import parity
description: Keep Excel bulk class creation behavior aligned with the standard class creation form.
---

Excel class import must preserve selected teacher roles and the holiday-skipping choice when submitting the class. Blank holiday choice means false, matching the normal create form's default.

**Why:** A workbook value that is displayed but not passed to class creation has no effect; staff need imported schedules to use the same role and holiday rules as manually created classes.

**How to apply:** When adding class-creation options to the workbook, provide system-backed choices, resolve them to IDs, and pass them through the same class creation fields used by the normal form. If a template is scoped to one facility, prefill it and filter its shifts, eligible teacher-role assignments, and applicable fee packages.
