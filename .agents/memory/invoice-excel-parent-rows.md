---
name: Invoice Excel parent rows
description: Export hierarchy for invoices with payment installments
---

## Rule
When exporting invoices with multiple payment installments, include the parent invoice row immediately before its visible child installment rows. The parent preserves invoice-level promotion, surcharge, deduction, and aggregate amounts; child rows preserve installment-level collection details. Because child installment amounts already include parent adjustments, leave child `Số tiền` empty and show the installment amount only in `Tổng tiền`.

**Why:** Installment rows intentionally zero out parent-level adjustments, so exporting only children hides promotions and surcharges. The hierarchy also makes the distinction between invoice totals and payment events explicit.

**How to apply:** Apply this only in the Excel export path, group children by parent before writing rows, label the parent clearly, and warn that parent and child rows are separate levels rather than amounts to sum together blindly.