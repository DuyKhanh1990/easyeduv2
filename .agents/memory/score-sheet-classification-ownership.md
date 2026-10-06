---
name: Score-sheet classification ownership
description: Ownership and compatibility rules for pass thresholds and grade bands on score sheet templates.
---

Each score sheet template owns its pass threshold and grade bands. Existing assessment snapshots that lack these fields must keep using their linked conversion snapshot's settings. Grade bands use the converted total when a conversion is linked and the raw total for a manual score sheet.

**Why:** Moving classification controls off shared conversion templates must not change historical assessment results, while each new score sheet still needs independent classification settings.

**How to apply:** Prefer classification fields on the score sheet template; only fall back to conversion settings when those fields are absent. Preserve the snapshot used by an already assigned assessment.
