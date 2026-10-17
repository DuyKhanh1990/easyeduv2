---
name: ZBS internal template library
description: Product boundary for EasyEdu's internal ZBS message-template authoring library.
---

Keep the internal ZBS template library separate from the legacy `notification_templates` catalog, OA template mappings, all existing message-sending services, and payment flows. Its drafts may model text, variables, image resources, and action buttons, but image/button compatibility and preview rendering remain unverified until validated for the relevant ZBS template type.

The product roadmap is to maintain exact, canonical definitions of approved ZBS templates in EasyEdu, then later create those templates automatically on each connected center's OA. Keep the canonical approved content and parameter schema separate from per-OA Zalo template IDs/mappings. Do not start automatic OA creation until explicitly requested.

For payment templates, bank code, account name, and bank account are fixed template content, not send-time parameters. The future per-center creation flow should populate those fixed fields from that center's bank settings when creating its own OA template; each new template is submitted to Zalo review and gets an OA-specific ID. Saving the source template definition in EasyEdu does not alter the already-approved source template.

The editor's three main cards are: template information (name, code, notification type, title), content (text, variable insertion, media, QR, and preview), and button assignment. Variables belong in the content workflow, not in the first card.

**Why:** The user said ZNS was never used, OA automation is active, and EasyEdu is moving toward ZBS templates; the user also explicitly requires this work to leave current OA, automated-message, and payment flows unchanged. The user later clarified that the future system should seed approved canonical templates onto each center's connected OA, after the exact approved definitions are stored centrally, and asked about populating center-specific bank information. Current Zalo documentation identifies the payment account fields as fixed content and says created templates require Zalo review.

**How to apply:** Keep editable drafts center-scoped and in draft/unverified state. Store exact approved ZBS definitions as canonical templates distinct from drafts and OA-specific IDs/mappings. When later provisioning payment templates, inject the center's fixed bank fields before submission; expect each created template to require review. Use the three-card editor structure above when changing the authoring form. Preserve existing OA sending, automated messages, payment flows, and ZBS mappings. Do not create templates on OAs, send messages, or connect the library to NotificationService/ChannelResolver without a separate explicit request and verified compatibility. Do not drop legacy ZNS-named shared tables or columns as part of retiring the sender.
