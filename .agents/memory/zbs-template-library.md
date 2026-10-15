---
name: ZBS internal template library
description: Product boundary for EasyEdu's internal ZBS message-template authoring library.
---

Keep the internal ZBS template library separate from the legacy `notification_templates` catalog, OA template mappings, and all existing message-sending services. Its drafts may model text, variables, image resources, and action buttons, but image/button compatibility and preview rendering remain unverified until validated for the relevant ZBS template type.

**Why:** The user said existing templates are not suitable for ZBS and requested a dedicated EasyEdu library. The supported ZBS component structure is not verified; the library is for internal authoring only.

**How to apply:** Keep new templates center-scoped and in draft/unverified state. Do not publish them to Zalo, send messages, auto-map them, or connect them to NotificationService/ChannelResolver without a separate explicit request and verified compatibility.
