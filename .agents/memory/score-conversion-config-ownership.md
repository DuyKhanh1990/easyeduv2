---
name: Score conversion config ownership
description: Ownership and permission scope for score-conversion settings and score-sheet templates.
---

**Rule:** Keep permissions separate for the “Cấu hình điểm Quy đổi” and “Bảng điểm mẫu” tabs. View shows records created by the current user; View All shows every record, including legacy records with no recorded creator. Create records the creator's user ID. Edit and Delete actions apply only to records within the user's visible scope and still require their respective permissions. The assessment-list tab remains a separate scope.

**Why:** The user wants staff to manage their own configurations by default while allowing selected roles to see and manage all records. Existing records lack creator identity, so assigning a guessed owner would be inaccurate.

**How to apply:** Preserve creator IDs on update. Do not expose ownerless legacy records to View-only users. Enforce ownership and action permissions in both API responses and mutations, not only by hiding UI controls.
