---
name: Student score-list filters
description: Default filters and evaluation-filter ordering in the score conversion student view.
---

In the “Theo học viên” score-conversion view, default to all result statuses with “Bảng điểm gần nhất” and “Đang học” enabled; let users switch off the latest and active-only toggles independently. Keep “Đạt” and “Không đạt” as optional filters in the advanced filter dialog. Choose each student's latest result before applying pass/fail filters, so a previous passing result cannot appear when the newest attempt failed.

**Why:** The user wants to start from all score sheets, narrow to each student's latest result and active enrollment, and use pass/fail only as an additional refinement.

**How to apply:** Preserve these defaults when resetting filters. Apply enrollment and general search/scope filters, select the latest result per student, then apply selected pass/fail statuses. No outcome selected means include all results, including unclassified ones.
