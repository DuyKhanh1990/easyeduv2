---
name: Zalo OA profile tier limits
description: Missing follower names can be caused by Zalo refusing User Info API access for the OA's tier.
---

Zalo follower names may come from webhook `display_name` or `GET /v3.0/oa/user/detail`, which returns `display_name`. The app must have the permission to manage user information, and the OA tier must include the feature. Error `-224` means the OA tier does not; missing names in that case are not a frontend rendering defect. `shared_info.name` is optional and exists only when the user shared their information. Permission/plan denials should be treated as unavailable profile lookup, not retried for every message.

**Why:** Production logs reported `-224` with Zalo's message that the OA needs to upgrade its tier package; some webhook records still carried names while others did not.

**How to apply:** Confirm both app permission and OA tier entitlement with Zalo. Until enabled, retain a clear fallback such as the follower ID or a locally linked student name; do not claim the app can recover a Zalo display name without an allowed source. Treat `shared_info.name` as an optional fallback, not a general replacement for `display_name`.
