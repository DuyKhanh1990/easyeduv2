---
name: ZBS system variables and visual blocks
description: Product rules for predefined variables, center logos, QR blocks, and starter templates in ZBS drafts.
---

In the ZBS template editor, users only write text and insert predefined system variables from a picker in the text block. The picker shows each variable's meaning and example; do not expose controls to create or edit variable keys. Center logo comes from the current center's main location. QR payloads use a separate QR block, not an ordinary image or text variable.

Keep starter draft frames for tuition/payment QR and ticket-style notices so users can fill in their content. Do not claim that QR or image blocks are supported by ZBS sending until verified.

**Why:** The user clarified that variables are supplied by the system and a manual variable editor is confusing.

**How to apply:** Keep variable metadata internal. Insert text tokens at the cursor, resolve center logo from the main location, and render QR from the QR block's entered payload in local preview only.
