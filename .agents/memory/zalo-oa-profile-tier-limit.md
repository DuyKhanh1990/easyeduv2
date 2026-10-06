---
name: Zalo OA profile tier limits
description: Missing follower names can be caused by Zalo refusing User Info API access for the OA's tier.
---

Zalo follower names may come from webhook `display_name` or the User Info API. Error `-224` means the OA tier does not include the requested profile feature; missing names in that case are not a frontend rendering defect. Permission/plan denials should be treated as unavailable profile lookup, not retried for every message.

**Why:** Production logs reported `-224` with Zalo's message that the OA needs to upgrade its tier package; some webhook records still carried names while others did not.

**How to apply:** Confirm User Info API entitlement with Zalo for the OA. Until enabled, retain a clear fallback such as the follower ID or a locally linked student name; do not claim the app can recover a Zalo display name without an allowed source.
