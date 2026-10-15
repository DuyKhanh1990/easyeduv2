---
name: ZBS variable picker
description: Product rule for inserting predefined system variables into ZBS template text.
---

In the ZBS template editor, users only write text and insert predefined system variables from a picker in the text block. The picker shows each variable's meaning and example; do not expose controls to create or edit variable keys.

**Why:** The user clarified that variables are supplied by the system and a manual variable editor is confusing.

**How to apply:** Keep the variable catalog and preview metadata internal. Insert the selected token at the text cursor and show its example in preview.
