---
name: Invoice visibility scopes
description: Rules for separating invoice CRUD permissions from type/status visibility.
---

The parent Hóa đơn permission remains authoritative for entering the page and for create, edit, and delete rights. Its existing permission columns must remain unchanged. Six child Xem/Xem all scopes only decide which Thu/Chi and Chưa thanh toán/Đã thanh toán/Đã xác nhận rows are visible; they do not grant CRUD rights. For split invoices, evaluate each installment's own status, not the parent's aggregate status. “Tất cả” is an aggregate view, not a separate permission.

**Why:** The user clarified that Hóa đơn already has its full permission set and the new child checkboxes only select which invoice types/statuses staff can see.

**How to apply:** Preserve the parent permission behavior whenever adjusting invoice navigation, APIs, settings, and installment handling. Keep visibility scopes independent and enforce them on every response that exposes invoice rows.
