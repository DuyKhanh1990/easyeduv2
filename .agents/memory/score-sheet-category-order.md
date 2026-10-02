---
name: Score-sheet category order snapshots
description: Preserve each existing gradebook's category display order independently from shared score-sheet changes.
---

**Rule:** Reordering categories in a shared score sheet must not change the displayed order in gradebooks that already exist. New gradebooks use the current shared order. Changing an existing gradebook to a different score sheet clears its old order snapshot.

**Why:** Grade values are keyed by category ID, but gradebook views derive their column order from the shared score-sheet configuration. A shared reorder must not silently rearrange historical records.

**How to apply:** Before saving a changed category order, snapshot the prior category-ID sequence for gradebooks without a snapshot. Use that sequence in teacher, student, mobile, and export views; fall back to live order for new books.