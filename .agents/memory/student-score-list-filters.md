---
name: Student score-list filters
description: Default filters and evaluation-filter ordering in the score conversion student view.
---

In the “Theo học viên” score-conversion view, default to all result statuses with “Bảng điểm gần nhất” and “Đang học” enabled; let users switch off the latest and active-only toggles independently. “Bảng điểm gần nhất” chooses each student's newest row whose status is “Đã nhập” (`complete`); skip newer incomplete rows, and omit students with no completed result. Keep “Đạt” and “Không đạt” visible as independent optional quick filters after a vertical divider. Apply pass/fail filters after choosing the latest completed result.

**Why:** The user wants the latest-result view to show a usable entered result, falling back to an older completed sheet when a newer one is incomplete; pass/fail remains an additional refinement and both outcome controls stay on the main filter bar.

**How to apply:** Preserve these defaults when resetting filters. Apply enrollment and general search/scope filters, select the latest `complete` result per student, then apply selected pass/fail statuses. With “Bảng điểm gần nhất” off, show incomplete rows too. No outcome selected means include all completed results, including unclassified ones.
