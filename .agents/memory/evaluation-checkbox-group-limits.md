---
name: Evaluation checkbox group limits
description: Behavior for optional minimum and maximum checkbox selections on evaluation groups.
---

Each evaluation group may have an optional minimum, maximum, or both. No bounds means unrestricted selection; when both are set, the allowed count is inclusive. Limits apply only to checkbox children, and a group without checkbox children must not block a review.

When editing a review, prevent adding unchecked boxes once the maximum is reached, but keep selected boxes enabled so teachers can swap choices. Temporary below-minimum state is allowed while editing; block saving until the minimum is met.

**Why:** the user confirmed that either bound may be entered alone and both together form a range.

**How to apply:** keep configuration, teacher UI, and server validation consistent across web, free-class, and mobile review flows.
