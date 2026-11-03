---
name: Student-session review publication
description: Default publication and blocked-role behavior for learner comments attached to individual lessons.
---

**Rule:** The center-level default publication state applies only when creating a new per-session student review. Roles on the deny list may create or edit and save review content, but cannot toggle publication. When editing existing reviews, preserve their current publication state for blocked roles.

**Why:** The user requested a center-configurable default without changing behavior for unconfigured centers, and explicitly said blocked roles must still be able to save comments.

**How to apply:** Keep unconfigured defaults unpublished with no denied roles so existing behavior remains. Enforce blocked-role publication immutability on the server as well as disabling the UI control. Do not apply this setting to grade-book comments.
