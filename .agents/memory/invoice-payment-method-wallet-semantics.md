---
name: Invoice payment method wallet semantics
description: Distinguishes recording Ví Đặt cọc as a payment method from debiting the deposit wallet.
---

Selecting **Ví Đặt cọc** on an invoice records the payment method only. It must not directly debit the deposit wallet; wallet deduction continues through the existing separate **Đặt cọc** field.

**Why:** the user explicitly chose label-only behavior. Coupling the selection to a debit could duplicate the existing deduction.

**How to apply:** when changing invoice payment methods or collection flows, preserve this separation unless the user explicitly asks to change wallet accounting.
