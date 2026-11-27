---
name: Schedule registration tab visibility
description: Product scope for hiding the My Space schedule-registration tab.
---

The schedule-registration tab under MY SPACE → Lịch cá nhân is controlled by a system-wide visibility toggle in Settings → System → Module Management. Hiding the tab also makes a direct `?tab=schedule-registration` visit fall back to the personal calendar, but does not disable booking APIs or change existing registrations.

**Why:** The user approved this as a UI visibility control, separate from permission/security or operationally disabling the booking flow.

**How to apply:** Keep this visibility key separate from the calendar page's role permissions. Do not reinterpret hiding the tab as stopping backend registration or deleting data.
