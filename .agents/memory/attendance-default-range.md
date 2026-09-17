---
name: Attendance default range
description: Default date behavior for the staff attendance screen.
---

The attendance screen defaults to the full current calendar month rather than only the current day.

**Why:** A day with no scheduled sessions is a valid state and previously made the whole screen look broken even though attendance data existed on nearby dates.

**How to apply:** Keep the date picker available for narrower ranges, but do not silently replace an explicitly selected range with a fallback.