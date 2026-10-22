---
name: Customer latest score display
description: User-confirmed placement and styling for the latest score result on the Customers page.
---

On `/customers`, show the latest published score as a bold 12.5px line under the student's code in the existing code cell; do not add a column or put another line under the student name. Use the score-conversion classification color and its green/red pass-result color. Keep existing metadata below the name in Roboto 11.5px. Present classification and pass outcome together, such as “Giỏi · Đạt”.

In the staff `/my-space/calendar` session detail, show the same latest published classification and pass outcome under each listed student's name/code. Preserve existing calendar access rules; do not add a Customers or score-conversion permission gate to this display.

**Why:** The user wants score context available in both customer and assigned-session views while keeping the existing access behavior of each page unchanged.

**How to apply:** Preserve score-conversion classification colors and pass-result colors. Only show results whose selected assessment result has been published. In the staff calendar, rely on the existing staff session authorization and do not add a separate permission check.
