---
name: Student-session review publication
description: Default publication and blocked-role behavior for learner comments attached to individual lessons.
---

**Rule:** The center-level default publication state applies only when creating a new per-session student review. Roles on the deny list may create or edit and save review content, but cannot toggle publication. When editing existing reviews, preserve their current publication state for blocked roles.

**Why:** The user requested a center-configurable default without changing behavior for unconfigured centers, and explicitly said blocked roles must still be able to save comments.

**How to apply:** Keep unconfigured defaults unpublished with no denied roles so existing behavior remains. Enforce blocked-role publication immutability on the server as well as disabling the UI control. Do not apply this setting to grade-book comments.

For `/attendance`, show one filled review indicator per learner/session only when the saved review has meaningful content. Gray means unpublished; green means published. Clicking opens the same editable per-session review dialog used in class details; review edits save through the existing regular/free review endpoints, and publication remains controlled by the configured role policy. Editing existing reviews follows the `/classes` edit permission used by ClassDetail; the separate publication policy only controls who can toggle publish state.

**Rule:** In student-facing My Space session feedback, show only checked checkbox criteria and omit the derived “Đạt/Chưa đạt” labels. Keep non-checkbox review comments visible.

**Why:** The user wants students to receive only the criteria selected by the teacher, without exposing unchecked criteria or redundant result labels.

**How to apply:** Filter checkbox rows in the student feedback dialog only; do not change the teacher editing or review-entry experience.
