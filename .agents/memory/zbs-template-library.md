---
name: ZBS internal template library
description: Product boundary for EasyEdu's internal ZBS message-template authoring library.
---

Keep the internal ZBS template library separate from the legacy `notification_templates` catalog, OA template mappings, all existing message-sending services, and payment flows. Its drafts may model text, variables, image resources, and action buttons, but image/button compatibility and preview rendering remain unverified until validated for the relevant ZBS template type.

The user wants a saved system-standard “Thông báo học phí” template to be automatically created on a center's Zalo OA when the center connects that OA. This provisioning flow is separate from the current logo editor and remains unfinished. Keep provisioning separate from message sending; do not call Zalo APIs unless implementing that flow.

For payment templates, bank code, account name, and bank account are fixed template content, not send-time parameters. The future per-center creation flow should populate those fixed fields from that center's bank settings when creating its own OA template; each new template is submitted to Zalo review and gets an OA-specific ID. Saving the source template definition in EasyEdu does not alter the already-approved source template.

The intended onboarding behavior is to prepare/create a center's OA templates when it connects its OA, pre-filling payment details from that center's settings. If bank details are missing, leave the EasyEdu setup pending for the center to complete; do not submit empty or dummy PAYMENT values. Current Zalo component docs require bank_code, account_name, and bank_account as fixed non-empty text.

Zalo's documented read APIs provide OA template IDs/names/status and a separate sample-data endpoint for parameter examples, but do not expose the full approved layout/components for retrieval. Exact replication therefore requires capturing the source layout from ZBS Account or receiving its original create/edit payload; do not claim a screenshot or sample-data response is the full canonical definition.

The editor's three main cards are: template information (name, code, notification type, title), content (text, variable insertion, media, QR, and preview), and button assignment. Variables belong in the content workflow, not in the first card.

**Why:** The user wants one saved system-standard tuition-notice template to provision a center-specific Zalo OA template at OA connection time; each OA needs its own template ID and review status.

**How to apply:** Keep the canonical system-standard tuition template distinct from each center's OA-specific template record. When implementing OA-connection provisioning, create the OA-specific template from the saved standard, populate fixed bank details from that center's settings, and track that OA's ID and review status. If required bank details are missing, leave provisioning pending rather than submitting empty or dummy values. Preserve existing message sending, payment flows, and OA mappings; do not connect the library to NotificationService/ChannelResolver without a separate explicit request and verified compatibility. Do not drop legacy ZNS-named shared tables or columns as part of retiring the sender.
