---
name: Reserved attendance makeup eligibility
description: Product rule for scheduling makeups from an individual lesson's attendance status
---

An individual lesson marked `Bảo lưu` is eligible for makeup, alongside `Nghỉ chờ bù`. Scheduling either status follows the same existing makeup process; the original lesson transitions to `Đã xếp bù`, then to `Đã học bù` after attendance.

**Why:** The user explicitly requested that reserved lesson attendance be eligible without changing the established makeup flow for students waiting for makeup.

**How to apply:** Keep both statuses eligible in every makeup entry point and server validation. Do not generalize eligibility to unrelated attendance states or alter target-session selection, accounting, or completion behavior.
