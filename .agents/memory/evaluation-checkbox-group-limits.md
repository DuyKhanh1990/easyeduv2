---
name: Evaluation checkbox group limits
description: Behavior for optional minimum and maximum checkbox selections on evaluation groups.
---

Each evaluation group may have an optional minimum, maximum, or both. No bounds means unrestricted selection; when both are set, the allowed count is inclusive. Limits apply only to checkbox children, and a group without checkbox children must not block a review.

When editing a review, prevent adding unchecked boxes once the maximum is reached, but keep selected boxes enabled so teachers can swap choices. Temporary below-minimum state is allowed while editing; block saving until the minimum is met.

Review forms receiving criteria or teacher arrays derived inline from a parent must not reinitialize draft state just because those references changed. Compare semantic input content or initialize only when the reviewed target changes.

**Why:** the user confirmed that either bound may be entered alone and both together form a range.

**Why:** Parent rerenders can otherwise clear unsaved checkbox selections, so the save-time minimum check reports zero even when the teacher had selected an option.

**How to apply:** keep configuration, teacher UI, and server validation consistent across web, free-class, mobile, and score-sheet assessment flows; keep draft initialization stable across unrelated parent rerenders.
