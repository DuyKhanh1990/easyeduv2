---
name: Invoice visibility scopes
description: Rules for separating invoice CRUD permissions from type/status visibility.
---

The parent Hóa đơn permission remains authoritative for entering the page and for create, edit, and delete rights. Its existing permission columns must remain unchanged. Six child Xem checkboxes only decide which Thu/Chi and Chưa thanh toán/Đã thanh toán/Đã xác nhận rows are visible; they do not grant CRUD or status-change rights. Three separate status-action permissions authorize moving an invoice to Chưa thanh toán, Đã thanh toán, or Đã xác nhận, independent of its previous status and independent of canEdit. “Tất cả” is an aggregate view, not a separate permission. For split invoices, evaluate each installment's own status, not the parent's aggregate status.

Keep the tab UI simple unless requested otherwise: filter unauthorized invoice rows/data rather than hiding status tabs. A status-action permission can allow a transition into a status the user cannot view; in that case, return success without the full updated invoice/schedule payload.

**Why:** The user clarified that Hóa đơn already has its full permission set, visibility checkboxes only select which invoice types/statuses staff can see, and status actions are authorized by their requested destination state.

**How to apply:** Preserve the parent permission behavior whenever adjusting invoice navigation, APIs, settings, and installment handling. Keep visibility scopes independent and enforce them on every response that exposes invoice rows. For manual status changes, enforce the matching destination-status action permission in the UI and server; `canEdit` must not substitute for those three actions. If the user cannot view the destination state, do not expose the changed record in the mutation response.
