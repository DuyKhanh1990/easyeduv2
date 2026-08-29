---
name: Schedule popup responsiveness
description: Confirmed UX boundary for opening the class schedule popup.
---

The schedule popup should become visibly responsive before the heavy schedule component tree mounts. This responsiveness fix is separate from the existing per-session detail-loading behavior and should not change that behavior unless explicitly requested.

When the class-detail schedule is shown in its custom full-screen shell, keep that shell below the standard Radix dialog layer. Actions inside the schedule open dialogs through body portals, so a shell above the standard dialog layer hides every nested popup.

**Why:** The reported production issue was intermittent unresponsiveness when opening the schedule popup, not a request to redesign when session details are fetched.

**How to apply:** Keep the lightweight overlay/loading state and deferred component mount for this flow; treat changes to session selection or detail-query timing as a separate product decision. Preserve the layer ordering “page < schedule shell < nested dialog” rather than raising nested dialogs globally.