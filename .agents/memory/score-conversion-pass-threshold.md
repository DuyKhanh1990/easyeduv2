---
name: Score conversion pass threshold
description: Pass/fail classification semantics for configurable overall-score thresholds.
---

The selected overall score passes when it is greater than or equal to the configured “Từ” score. Scores below it are “Chưa đạt”; scores above the configured “Đến” value still pass. If the selected score is incomplete, leave the result unclassified.

**Why:** The user clarified that the threshold is a minimum: for example, with 100–100 configured, a score of 100 or higher passes, while 90 does not.

**How to apply:** Preserve this lower-bound comparison for both Điểm Tổng and Điểm đã quy đổi. Do not treat “Đến” as a maximum passing score.