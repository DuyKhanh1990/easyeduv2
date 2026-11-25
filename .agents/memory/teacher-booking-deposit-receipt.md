---
name: Teacher booking deposit receipt
description: Accounting design for student-selected teacher bookings funded from the deposit wallet.
---

When a teacher-booking cancellation window expires, record the tuition as a standard receipt under “Học phí theo đăng ký”, apply an equal “Đặt cọc” deduction, and show zero remaining due. The payment-method label “Ví Đặt Cọc” does not itself move wallet balances; the separate deposit deduction creates the paired debit from Đặt Cọc and credit to Học Phí. Do not perform an additional transfer, and do not count the already-collected deposit as new cash income a second time. Existing paid packages are used without creating a new receipt.

**Why:** The user confirmed this should behave like a normal tuition receipt paid with deposit funds, while attendance later consumes the credited tuition wallet balance.

**How to apply:** Link the receipt, booking, and paired ledger entries in one atomic operation; keep the original tuition amount visible, show the deposit offset separately, and make the amount due zero.
