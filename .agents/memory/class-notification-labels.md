---
name: Class name presentation
description: Consistent user-facing display rules for class names and codes.
---

Show a class as `Class name (class code)` in notifications. If the name is blank, show the code by itself; if the code is blank, show the name.

On `/schedule`, keep the Ngày and Danh sách views unchanged. In the remaining calendar views, show only the class name on compact session cards and show `Class name (class code)` in the hover detail. On `/my-space/calendar`, show the class name on calendar cards and retain the class code as secondary detail. Fall back to the code if the name is missing.

**Why:** Users often cannot identify a class from its generated code alone, while the code remains useful for cross-referencing. The schedule-card adjustment is presentation-only; session identity and schedule behavior remain unchanged.

**How to apply:** For notifications, use the name-first format and avoid empty parentheses or duplicate labels. For `/schedule`, keep list views unchanged and apply the concise-card/full-hover treatment only to the other calendar views. For `/my-space/calendar`, use the name-first label in month and session cards; show a nonduplicate code in detail and suppress the `TEST` sentinel.
