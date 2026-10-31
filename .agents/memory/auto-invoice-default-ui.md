---
name: Automatic invoice dialog defaults
description: Product rule for the automatic-invoice default and per-dialog overrides.
---

The education setting “automatic invoice default” initializes the switch in scheduling and renewal dialogs. It is not a forced setting: roles granted override permission may turn automatic invoicing on or off for the current operation. Keep this as a UI default change; do not alter invoice creation or enrollment business logic when aligning the initial switch state.

**Why:** The user explicitly requested that dialogs reflect the configured default while preserving authorized per-operation choice and existing system behavior.

**How to apply:** When adding or correcting scheduling/renewal dialogs, load the configured default for initial UI state, leave authorized switches editable, and keep backend invoice guards unchanged.
