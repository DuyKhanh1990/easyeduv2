---
name: Class split at future session
description: Safely split a class by moving its future lesson suffix into a new class.
---

When splitting a class, allow only a scheduled session that has not started and has no attendance recorded. Move the original lesson and student-session records rather than deleting and recreating them. Keep their IDs so linked lesson content, gradebook data, and invoice-session allocations remain attached. Preserve the old class's completed prefix and create a normal new class for the moved suffix. Do not reuse the ordinary student-transfer flow or create a difference invoice for this operation.

**Why:** A split is a shortcut for moving the remaining class schedule, not a tuition package transfer; changing the existing transfer accounting risks charging or crediting twice.

**How to apply:** Implement it as a dedicated, transactional class operation. Require code/name for the new class, preview the moved sessions read-only, and keep existing copy/transfer flows unchanged.
