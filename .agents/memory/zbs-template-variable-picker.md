---
name: ZBS system variables and visual blocks
description: Product rules for predefined variables, center logos, QR blocks, and starter templates in ZBS drafts.
---

In the ZBS template editor, users only write text and insert predefined system variables from a picker in the text block. The picker shows each variable's meaning and example; do not expose controls to create or edit variable keys. Center logo comes from the current center's main location. QR payloads use a separate QR block, not an ordinary image or text variable.

Keep starter draft frames as editable text in ordinary text blocks. A generic text block may use a selectable pale-blue card background for framing selected content; do not create fixed ticket fields or a ticket-specific preview layout. QR remains a separate QR block and the center logo remains an image system source. Do not claim that QR or image blocks are supported by ZBS sending until verified.

Text blocks also support inline bold, italic, and text color in the internal editor and preview. Keep the text editable and do not imply those styles are supported by ZBS sending until verified.

**Why:** The user wants reusable message content they can edit freely, not fixed fields or a locked design for one message type.

**How to apply:** Keep variable metadata internal. Insert text tokens at the cursor, keep ticket copy editable in text blocks, support inline bold/italic/color plus the generic blue-card block style, resolve center logo from the main location, and render QR from its separate block in local preview only.
