---
name: Draft matrix UI rollout
description: The student-session matrix is a deferred second interface, not a replacement for existing customer or class workflows.
---

The existing Customers table and class session student list must remain the default active interfaces. Keep the matrix prototypes in source but hide their entry points until the optimized rollout is approved.

**Why:** The prototype loads a large class-by-session dataset and was intended for later rollout; replacing the established views risks both performance and user workflow changes.

**How to apply:** When revisiting the matrix, add an explicit feature flag or controlled rollout and server-side pagination before exposing it again. Do not remove or alter the existing attendance page data path.