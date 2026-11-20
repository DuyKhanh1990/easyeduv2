---
name: Customer import location names
description: Keep location names intact in student import templates and safely accept values from older templates.
---

**Rule:** Customer import dropdowns must preserve the exact location names, including commas. When importing older files that removed commas, resolve the normalized value only if it matches exactly one location; reject ambiguous matches rather than assigning the wrong location.

**Why:** Location names in this project include commas, while older import templates removed those commas and the importer previously required an exact string match.

**How to apply:** Store canonical names in hidden dropdown lists. For legacy values, compare trimmed, case-insensitive names with commas and repeated whitespace normalized, then use the unique matching location ID.
