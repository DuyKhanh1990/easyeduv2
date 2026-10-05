---
name: My Space assignment permissions
description: Scope for permissions on the My Space assignments page versus Education's Learning Overview assignments.
---

My Space assignment Add/Edit permissions control staff feedback, grades, and exam comments on `/my-space/assignments`. Do not apply these flags to Education's Learning Overview assignment workflows.

**Why:** The user requested page-specific permissions and explicitly said Education assignment workflows must remain unchanged.

**How to apply:** Keep My Space controls and server authorization on My Space-specific paths. If changing shared assignment UI, preserve Education's existing authorization and behavior separately.