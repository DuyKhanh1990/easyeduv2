---
name: ZBS internal template library
description: Product boundary for EasyEdu's internal ZBS message-template authoring library.
---

Keep the internal ZBS template library separate from the legacy `notification_templates` catalog, OA template mappings, all existing message-sending services, and payment flows. Its drafts may model text, variables, image resources, and action buttons, but image/button compatibility and preview rendering remain unverified until validated for the relevant ZBS template type.

**Why:** The user said ZNS was never used, OA automation is active, and EasyEdu is moving toward ZBS templates; the user also explicitly requires this work to leave current OA, automated-message, and payment flows unchanged. The supported ZBS component structure is not verified; the library is for internal authoring only.

**How to apply:** Keep new templates center-scoped and in draft/unverified state. Preserve existing OA sending, automated messages, payment flows, and ZBS mappings. Do not publish templates, send messages, or connect the library to NotificationService/ChannelResolver without a separate explicit request and verified compatibility. Do not drop legacy ZNS-named shared tables or columns as part of retiring the sender.
