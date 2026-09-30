---
name: Score conversion mapping boundaries
description: Inclusive/exclusive endpoint behavior for displayed raw-score conversion ranges.
---

Displayed “Từ–Đến” mapping ranges include both endpoints when the next range starts strictly above the current upper bound (for example, 17–20 followed by 21–24). When the next range starts exactly at the current upper bound, the shared boundary belongs to the next range. Exact-point mappings should continue to match their precise value.

**Why:** Staff expect a score equal to the displayed “Đến” value to map to that band; treating every range as half-open incorrectly leaves values such as 20 unmapped from 17–20. Shared boundaries still need deterministic ownership.

**How to apply:** Preserve these semantics in any scoring implementation and regression tests. Validate examples with inclusive adjacent integers as well as shared endpoints such as 0–5 and 5–10.