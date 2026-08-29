# EduManage — Mobile API: Dashboard

> Tài liệu này mô tả 3 endpoint Dashboard tổng quan dành cho app mobile.  
> **Chỉ dành cho nhân viên / quản trị viên** — học sinh & phụ huynh nhận 403.

**Base URL:** `https://<domain>/api/mobile`  
**Auth:** `Authorization: Bearer <jwt_token>` (bắt buộc)

---

## Mục lục

- [Query Params chung](#query-params-chung)
- [25.1 Tab KHÁCH HÀNG](#251-tab-khách-hàng) — 9 widget
- [25.2 Tab ĐÀO TẠO](#252-tab-đào-tạo) — 7 widget
- [25.3 Tab TÀI CHÍNH](#253-tab-tài-chính) — 5 widget
- [Enum & Giá trị tham chiếu](#enum--giá-trị-tham-chiếu)

---

## Query Params chung

Tất cả 3 endpoint đều nhận cùng bộ query params (đều optional):

| Param | Kiểu | Mô tả |
|-------|------|-------|
| `locationId` | `string` (UUID) | Lọc theo cơ sở. Bỏ trống = tất cả cơ sở mà user được phép |
| `dateFrom` | `string` (`YYYY-MM-DD`) | Điểm đầu khoảng thời gian lọc |
| `dateTo` | `string` (`YYYY-MM-DD`) | Điểm cuối khoảng thời gian lọc |

**Mapping bộ lọc thời gian UI → params:**

| Nút UI | dateFrom | dateTo |
|--------|----------|--------|
| Hôm nay | today | today |
| Tuần này | startOf(week) | today |
| Tháng này | startOf(month) | today |
| 3 tháng | 3 months ago | today |
| 6 tháng | 6 months ago | today |
| Năm nay | startOf(year) | today |
| Tuỳ chọn | picker | picker |

---

## 25.1 Tab KHÁCH HÀNG

```
GET /api/mobile/dashboard/customers
Authorization: Bearer <token>
```

Trả về **tất cả 9 widget** của Tab KHÁCH HÀNG trong **1 lần gọi**.

### Response 200

```json
{
  "success": true,
  "data": {
    "customerSummary": {
      "total": 136,
      "hocVien": 135,
      "hocVienPct": 99.3,
      "phuHuynh": 1,
      "phuHuynhPct": 0.7,
      "active": 134,
      "activePct": 98.5,
      "inactive": 2
    },
    "accountStatus": {
      "active": 134,
      "activePct": 98.5,
      "inactive": 2
    },
    "newCustomers": {
      "today": 0,
      "thisMonth": 0
    },
    "learningStatus": {
      "dangHoc": 120,
      "baoLuu": 5,
      "choLich": 3,
      "daNghi": 8,
      "chuaCoLich": 0,
      "total": 136
    },
    "byRelationship": [
      { "name": "Học viên", "count": 135, "color": "#4F8EF7" },
      { "name": "Phụ huynh", "count": 1, "color": "#F7A24F" }
    ],
    "bySource": [
      { "name": "Zalo", "count": 50, "pct": 36.8 },
      { "name": "Giới thiệu", "count": 40, "pct": 29.4 }
    ],
    "byLocation": [
      { "name": "Cơ sở chính", "count": 100, "pct": 73.5 },
      { "name": "Cơ sở 2", "count": 36, "pct": 26.5 }
    ],
    "byStaff": [
      { "name": "Nguyễn Văn A", "count": 30, "pct": 22.1 }
    ],
    "monthlyCounts": [
      { "monthKey": "2025-01", "label": "T1/2025", "count": 120, "growthPct": 5.2 },
      { "monthKey": "2025-02", "label": "T2/2025", "count": 125, "growthPct": 4.2 },
      { "monthKey": "2025-03", "label": "T3/2025", "count": 128, "growthPct": 2.4 },
      { "monthKey": "2025-04", "label": "T4/2025", "count": 130, "growthPct": 1.6 },
      { "monthKey": "2025-05", "label": "T5/2025", "count": 134, "growthPct": 3.1 },
      { "monthKey": "2025-06", "label": "T6/2025", "count": 136, "growthPct": 1.5 }
    ]
  }
}
```

### Mapping widget → field

| Tên widget trên màn hình | Field sử dụng |
|--------------------------|---------------|
| **Tổng Khách hàng** (donut) | `customerSummary.total`, `.hocVien`, `.hocVienPct`, `.phuHuynh`, `.phuHuynhPct` |
| **Trạng thái tài khoản** (gauge) | `accountStatus.active`, `.activePct`, `.inactive` |
| **Khách hàng mới** (card số) | `newCustomers.today`, `.thisMonth` |
| **Trạng thái học tập** (bar list) | `learningStatus.dangHoc/baoLuu/choLich/daNghi/chuaCoLich/total` |
| **Số lượng HV theo tháng** (line chart) | `monthlyCounts[]` — `count`, `growthPct` |
| **Học viên theo Nguồn** (pie/bar) | `bySource[]` — `name`, `count`, `pct` |
| **Học viên theo Mối quan hệ** (pie) | `byRelationship[]` — `name`, `count`, `color` |
| **Học viên theo Cơ sở** (bar) | `byLocation[]` — `name`, `count`, `pct` |
| **Học viên theo Nhân sự** (bar) | `byStaff[]` — `name`, `count`, `pct` |

---

## 25.2 Tab ĐÀO TẠO

```
GET /api/mobile/dashboard/training
Authorization: Bearer <token>
```

Trả về **tất cả 7 widget** của Tab ĐÀO TẠO trong **1 lần gọi**.

### Response 200

```json
{
  "success": true,
  "data": {
    "formatSummary": {
      "total": 62,
      "offline": 57,
      "offlinePct": 92.0,
      "online": 5,
      "onlinePct": 8.0
    },
    "statusSummary": {
      "active": 1,
      "recruiting": 0,
      "planning": 61,
      "closed": 0,
      "total": 62
    },
    "newClasses": {
      "today": 0,
      "thisMonth": 1
    },
    "byLocation": [
      {
        "locationId": "uuid-cs-chinh",
        "locationName": "Cơ sở chính",
        "total": 4,
        "active": 1,
        "closed": 0
      },
      {
        "locationId": "uuid-cs-2",
        "locationName": "Cơ sở 2",
        "total": 3,
        "active": 0,
        "closed": 0
      }
    ],
    "monthlyAttendance": [
      { "monthKey": "2026-02", "label": "02/2026", "total": 500, "present": 460, "rate": 92.0 },
      { "monthKey": "2026-03", "label": "03/2026", "total": 480, "present": 450, "rate": 93.8 },
      { "monthKey": "2026-04", "label": "04/2026", "total": 510, "present": 480, "rate": 94.1 },
      { "monthKey": "2026-05", "label": "05/2026", "total": 490, "present": 455, "rate": 92.9 },
      { "monthKey": "2026-06", "label": "06/2026", "total": 520, "present": 495, "rate": 95.2 },
      { "monthKey": "2026-07", "label": "07/2026", "total": 100, "present": 20,  "rate": 20.0 }
    ],
    "byTeacher": [
      { "name": "Giáo viên 1", "count": 1, "pct": 100.0 }
    ],
    "byTeacherSessions": [
      { "name": "Giáo viên 1", "count": 15, "pct": 55.6 },
      { "name": "Giáo viên 3", "count": 12, "pct": 44.4 }
    ]
  }
}
```

### Mapping widget → field

| Tên widget trên màn hình | Field sử dụng |
|--------------------------|---------------|
| **Tổng số lớp học** (donut Online/Offline) | `formatSummary.total/offline/offlinePct/online/onlinePct` |
| **Trạng thái lớp học** (bar list) | `statusSummary.active/recruiting/planning/closed/total` |
| **Lớp học mới** (card số) | `newClasses.today`, `.thisMonth` |
| **Tổng số lớp theo cơ sở** (bar + line %) | `byLocation[]` — `locationName`, `total`, `active` |
| **Tỷ lệ điểm danh theo tháng** (bar + line %) | `monthlyAttendance[]` — `label`, `total`, `present`, `rate` |
| **Tổng số lớp giáo viên** (bar list) | `byTeacher[]` — `name`, `count`, `pct` |
| **Tổng số ca dạy giáo viên** (bar list) | `byTeacherSessions[]` — `name`, `count`, `pct` |

### Nhãn `statusSummary`

| Key | Nhãn hiển thị trên UI |
|-----|-----------------------|
| `active` | Đang hoạt động |
| `recruiting` | Đang tuyển sinh |
| `planning` | Lên kế hoạch |
| `closed` | Đã đóng |

---

## 25.3 Tab TÀI CHÍNH

```
GET /api/mobile/dashboard/finance
Authorization: Bearer <token>
```

Trả về **tất cả 5 widget** của Tab TÀI CHÍNH trong **1 lần gọi**.

### Response 200

```json
{
  "success": true,
  "data": {
    "invoiceSummary": {
      "totalCount": 320,
      "byStatus": {
        "unpaid": 40,
        "partial": 15,
        "paid": 250,
        "debt": 10,
        "cancelled": 5
      },
      "totalRevenue": 150000000,
      "actualCollected": 120000000,
      "debtAmount": 30000000,
      "expectedIncome": 130000000,
      "expectedExpense": 20000000,
      "actualIncome": 120000000,
      "actualExpense": 18000000,
      "debtIncome": 10000000,
      "debtExpense": 2000000
    },
    "byCategory": {
      "income": {
        "total": 120000000,
        "categories": [
          { "name": "Học phí", "amount": 100000000, "pct": 83.3 },
          { "name": "Lệ phí thi", "amount": 20000000, "pct": 16.7 }
        ]
      },
      "expense": {
        "total": 18000000,
        "categories": [
          { "name": "Lương giáo viên", "amount": 12000000, "pct": 66.7 },
          { "name": "Khác", "amount": 6000000, "pct": 33.3 }
        ]
      }
    },
    "revenueByLocation": {
      "rows": [
        {
          "locationId": "uuid-cs-chinh",
          "locationName": "Cơ sở chính",
          "totalIncome": 90000000,
          "totalExpense": 12000000,
          "profit": 78000000
        }
      ],
      "totals": {
        "totalIncome": 120000000,
        "totalExpense": 18000000,
        "profit": 102000000
      }
    },
    "debtSummary": {
      "totalDebtAmount": 30000000,
      "totalCount": 50,
      "byStatus": [
        { "key": "unpaid",  "label": "Chưa thanh toán",     "count": 40, "amount": 25000000, "pct": 83.3 },
        { "key": "partial", "label": "Thanh toán một phần", "count": 10, "amount": 5000000,  "pct": 16.7 }
      ]
    }
  }
}
```

> ⚠️ Tất cả giá trị tiền tệ là **VNĐ** (số nguyên). Ví dụ: `150000000` = 150.000.000 đồng.

### Mapping widget → field

| Tên widget trên màn hình | Field sử dụng |
|--------------------------|---------------|
| **Tổng hoá đơn** (số liệu tổng) | `invoiceSummary.totalCount/totalRevenue/actualCollected/debtAmount` |
| **Trạng thái hóa đơn** (bar/badge) | `invoiceSummary.byStatus.unpaid/partial/paid/debt/cancelled` |
| **Thu/Chi kế hoạch vs thực tế** | `invoiceSummary.expectedIncome/Expense`, `.actualIncome/Expense`, `.debtIncome/Expense` |
| **Phân bổ thu / Phân bổ chi** (pie/bar) | `byCategory.income.categories[]`, `byCategory.expense.categories[]` |
| **Doanh thu thực theo cơ sở** (bar) | `revenueByLocation.rows[]` — `locationName/totalIncome/totalExpense/profit` |
| **Tổng toàn trung tâm** | `revenueByLocation.totals` |
| **Công nợ khách hàng** (pie/list) | `debtSummary.totalDebtAmount/totalCount`, `.byStatus[]` |

### Nhãn `invoiceSummary.byStatus`

| Key | Nhãn hiển thị |
|-----|---------------|
| `unpaid` | Chưa thanh toán |
| `partial` | Thanh toán một phần |
| `paid` | Đã thanh toán |
| `debt` | Công nợ |
| `cancelled` | Đã huỷ |

---

## Enum & Giá trị tham chiếu

### Trạng thái học tập (`learningStatus` — Tab KHÁCH HÀNG)

| Field | Nhãn tiếng Việt |
|-------|-----------------|
| `dangHoc` | Đang học |
| `baoLuu` | Bảo lưu |
| `choLich` | Chờ xếp lịch |
| `daNghi` | Đã nghỉ |
| `chuaCoLich` | Chưa có lịch |

### Lưu ý quyền

| Loại tài khoản | Hành vi |
|----------------|---------|
| **Super admin** | Xem tất cả cơ sở, không bị lọc |
| **Staff thường** | Chỉ thấy dữ liệu cơ sở được phân công. Nếu truyền `locationId` không được phép → server tự lọc về cơ sở được phép |
| **Học sinh / phụ huynh** | `403 Forbidden` |
