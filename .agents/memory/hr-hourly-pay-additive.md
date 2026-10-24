---
name: Hourly staff pay stays additive
description: Preserve fixed-pay behavior when adding hourly staff compensation.
---

Hourly compensation is an additional pay mode, not a replacement for existing fixed-pay rules. Existing staff configurations default to fixed pay, and their attendance display and salary calculation must continue to use the current work-unit formula.

**Why:** The user explicitly required adding hourly pay without affecting existing behavior.

**How to apply:** When changing HR attendance, salary configuration, or payroll generation, branch hourly-specific behavior by pay type and keep the fixed-pay path unchanged.
