---
name: Customer latest score display
description: User-confirmed placement and styling for the latest score result on the Customers page.
---

On `/customers`, show the latest published score as a bold 12.5px line under the student's code in the existing code cell; do not add a column or put another line under the student name. Use the score-conversion classification color and its green/red pass-result color. Keep existing metadata below the name in Roboto 11.5px. Present classification and pass outcome together, such as “Giỏi · Đạt”.

**Why:** The user wants to avoid adding columns and expects the name area to keep room for existing and future status information.

**How to apply:** Preserve the 12.5px size, bold weight, and score-conversion colors when changing the Customers table. Only show a result the CRM viewer is allowed to access and whose selected assessment result has been published.
