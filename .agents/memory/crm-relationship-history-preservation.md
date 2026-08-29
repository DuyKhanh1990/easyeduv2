---
name: CRM relationship history preservation
description: Rules for keeping deleted CRM relationship history from being silently reattached to new configuration records.
---

Do not derive or append `relationshipIds` from historical `pipelineStage` names during application startup. Historical labels must remain historical unless a user explicitly selects a current relationship.

**Why:** A relationship can be deleted and later recreated with the same name. Name-based reconciliation would silently attach old customers to the new record, making them appear in live filters and changing the meaning of their stored history.

**How to apply:** New-customer creation must resolve a live relationship ID (falling back to the protected system default), while existing customer records keep their saved IDs and labels until an explicit edit or bulk update replaces them.