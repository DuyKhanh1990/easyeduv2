export const ZBS_TEMPLATE_SYSTEM_VARIABLES = [
  {
    key: "student_name",
    label: "Tên học viên",
    source: "student.fullName",
    example: "Nguyễn Minh Anh",
    description: "Tên đầy đủ của học viên.",
  },
  {
    key: "center_logo",
    label: "Logo trung tâm",
    source: "center.logoUrl",
    format: "imageUrl",
    example: "Logo của trung tâm hiện tại",
    description: "Tự lấy logo từ cơ sở chính của trung tâm đang dùng mẫu.",
  },
  {
    key: "parent_name",
    label: "Tên phụ huynh",
    source: "student.parentName",
    example: "Nguyễn Thị Lan",
    description: "Tên phụ huynh liên hệ chính (nếu có).",
  },
  {
    key: "invoice_code",
    label: "Mã hóa đơn",
    source: "invoice.code",
    example: "HD0001",
    description: "Mã hóa đơn học phí.",
  },
  {
    key: "billing_month",
    label: "Tháng hiển thị",
    source: "invoice.dueDate",
    format: "monthName",
    example: "10",
    description: "Tháng lấy từ hạn thanh toán; kỳ học thực tế có thể khác.",
  },
  {
    key: "tuition_amount",
    label: "Tổng học phí",
    source: "invoice.grandTotal",
    format: "currencyVnd",
    example: "1.500.000đ",
    description: "Thành tiền theo hóa đơn, trước khấu trừ.",
  },
  {
    key: "paid_amount",
    label: "Đã thanh toán",
    source: "invoice.paidAmount",
    format: "currencyVnd",
    example: "500.000đ",
    description: "Số tiền đã thu trên hóa đơn.",
  },
  {
    key: "remaining_amount",
    label: "Còn phải đóng",
    source: "invoice.remainingAmount",
    format: "currencyVnd",
    example: "1.000.000đ",
    description: "Số tiền còn lại trên hóa đơn.",
  },
  {
    key: "due_date",
    label: "Hạn thanh toán",
    source: "invoice.dueDate",
    format: "dateVi",
    example: "15/10/2026",
    description: "Hạn thanh toán ghi trên hóa đơn.",
  },
] as const;

export const ZBS_TEMPLATE_SYSTEM_VARIABLE_SOURCES = [
  "student.fullName",
  "center.logoUrl",
  "student.parentName",
  "invoice.code",
  "invoice.dueDate",
  "invoice.grandTotal",
  "invoice.paidAmount",
  "invoice.remainingAmount",
] as const;

export const ZBS_TEMPLATE_SYSTEM_VARIABLE_FORMATS = [
  "monthName",
  "currencyVnd",
  "dateVi",
  "imageUrl",
] as const;
