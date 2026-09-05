/* ──────────────────────────────────────────────────────────────────────────
 * Mẫu HTML có sẵn cho dialog "Tạo mẫu hoá đơn".
 * Khi người dùng chọn một preset, nội dung HTML sẽ được nạp luôn cho mẫu mới
 * tạo, sau đó vẫn có thể chỉnh sửa tự do trong trình thiết kế mẫu.
 *
 * Các biến hợp lệ (sẽ được thay thế khi xem trước / khi in):
 *   Cơ bản:   {{customer_name}}  {{phone}}  {{address}}
 *             {{invoice_code}}   {{date}}
 *   Số tiền:  {{total}}  {{da_thanh_toan}}  {{con_lai}}  {{thu_ky_nay}}
 *   Học vụ:   {{lop}}  {{noi_dung}}  {{khoan_thu}}
 *   Thanh toán:{{phuong_thuc}}  {{nguoi_tao}}  {{nguoi_thanh_toan}}
 *   Bảng:     {{items}}  {{lich_su_thanh_toan}}
 * ────────────────────────────────────────────────────────────────────────── */

export type TemplatePreset = {
  key: string;
  label: string;
  invoiceType: "Thu" | "Chi" | "ThuGop" | "ChiGop";
  pageSize: "A4" | "A5" | "K80";
  html: string;
};

const TUITION_RECEIPT_HTML = `<div style="font-family: Arial, sans-serif; font-size: 11px; color:#111; line-height:1.45;">

  <!-- ============== HEADER ============== -->
  <table style="width:100%;border-collapse:collapse;margin-bottom:6px;">
    <tr>
      <!-- Tiêu đề -->
      <td style="width:70%;vertical-align:middle;text-align:left;">
        <div style="font-size:20px;font-weight:bold;letter-spacing:1px;">PHIẾU THU HỌC PHÍ</div>
      </td>
      <!-- Số phiếu thu -->
      <td style="width:30%;vertical-align:top;">
        <div style="border:1px solid #111;border-radius:6px;padding:6px 10px;text-align:center;">
          <div style="font-size:9.5px;color:#555;">Số phiếu thu</div>
          <div style="font-weight:bold;font-size:13px;letter-spacing:0.5px;">{{invoice_code}}</div>
        </div>
        <div style="font-size:10px;margin-top:4px;text-align:right;">Ngày thu: <b>{{date}}</b></div>
        <div style="font-size:10px;text-align:right;">Mã HD gốc: <b>{{ma_hd_goc}}</b></div>
      </td>
    </tr>
  </table>

  <div style="border-top:1px dashed #999;margin:6px 0 8px;"></div>

  <!-- ============== THÔNG TIN HỌC VIÊN ============== -->
  <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:8px;">
    <tr>
      <td style="padding:2px 4px;width:50%;"><span style="color:#555;">Mã HD:</span> <b>{{invoice_code}}</b></td>
      <td style="padding:2px 4px;width:50%;"><span style="color:#555;">Ngày lập HD:</span> <b>{{date}}</b></td>
    </tr>
    <tr>
      <td style="padding:2px 4px;"><span style="color:#555;">Học viên:</span> <b>{{customer_name}}</b></td>
      <td style="padding:2px 4px;"><span style="color:#555;">Lớp:</span> <b>{{lop}}</b></td>
    </tr>
    <tr>
      <td style="padding:2px 4px;"><span style="color:#555;">SĐT phụ huynh:</span> <b>{{phone}}</b></td>
      <td style="padding:2px 4px;"><span style="color:#555;">Tổng học phí:</span> <b>{{total}} đ</b></td>
    </tr>
    <tr>
      <td style="padding:2px 4px;vertical-align:top;"><span style="color:#555;">Địa chỉ:</span> {{address}}</td>
      <td style="padding:2px 4px;vertical-align:top;"><span style="color:#555;">Ghi chú:</span> {{noi_dung}}</td>
    </tr>
  </table>

  <!-- ============== 2 KHỐI TỔNG QUAN / CHI TIẾT ============== -->
  <table style="width:100%;border-collapse:separate;border-spacing:6px 0;margin-bottom:8px;">
    <tr>
      <!-- Tổng quan thanh toán -->
      <td style="width:50%;vertical-align:top;border:1px solid #111;border-radius:4px;padding:8px 10px;">
        <div style="text-align:center;font-weight:bold;font-size:11px;letter-spacing:0.5px;border-bottom:1px solid #ccc;padding-bottom:4px;margin-bottom:6px;">
          TỔNG QUAN THANH TOÁN
        </div>
        <table style="width:100%;font-size:11px;">
          <tr><td style="padding:2px 0;">Tổng học phí</td><td style="padding:2px 0;">:</td><td style="padding:2px 0;text-align:right;">{{total}} đ</td></tr>
          <tr><td style="padding:2px 0;">Đã thanh toán</td><td style="padding:2px 0;">:</td><td style="padding:2px 0;text-align:right;">{{da_thanh_toan}} đ</td></tr>
          <tr><td style="padding:2px 0;">Thu kỳ này</td><td style="padding:2px 0;">:</td><td style="padding:2px 0;text-align:right;">{{thu_ky_nay}} đ</td></tr>
          <tr><td style="padding:2px 0;font-weight:bold;">Còn lại</td><td style="padding:2px 0;font-weight:bold;">:</td><td style="padding:2px 0;text-align:right;font-weight:bold;">{{con_lai}} đ</td></tr>
        </table>
      </td>
      <!-- Chi tiết phiếu thu -->
      <td style="width:50%;vertical-align:top;border:1px solid #111;border-radius:4px;padding:8px 10px;">
        <div style="text-align:center;font-weight:bold;font-size:11px;letter-spacing:0.5px;border-bottom:1px solid #ccc;padding-bottom:4px;margin-bottom:6px;">
          CHI TIẾT PHIẾU THU
        </div>
        <table style="width:100%;font-size:11px;">
          <tr><td style="padding:2px 0;width:42%;">Khoản thu</td><td style="padding:2px 0;width:8px;">:</td><td style="padding:2px 0;">{{khoan_thu}}</td></tr>
          <tr><td style="padding:2px 0;">Số tiền</td><td style="padding:2px 0;">:</td><td style="padding:2px 0;">{{thu_ky_nay}} đ</td></tr>
          <tr><td style="padding:2px 0;">Phương thức TT</td><td style="padding:2px 0;">:</td><td style="padding:2px 0;">{{phuong_thuc}}</td></tr>
          <tr><td style="padding:2px 0;">Người tạo</td><td style="padding:2px 0;">:</td><td style="padding:2px 0;">{{nguoi_tao}}</td></tr>
          <tr><td style="padding:2px 0;">Người thanh toán</td><td style="padding:2px 0;">:</td><td style="padding:2px 0;">{{nguoi_thanh_toan}}</td></tr>
        </table>
      </td>
    </tr>
  </table>

  <!-- ============== LỊCH SỬ THANH TOÁN ============== -->
  <div style="text-align:center;font-weight:bold;font-size:11px;letter-spacing:0.5px;margin:6px 0 4px;">
    LỊCH SỬ THANH TOÁN
  </div>
  {{lich_su_thanh_toan}}

  <!-- ============== CHỮ KÝ ============== -->
  <table style="width:100%;margin-top:18px;font-size:11px;">
    <tr>
      <td style="width:50%;text-align:center;vertical-align:top;">
        <div style="font-weight:bold;">NGƯỜI NỘP TIỀN</div>
        <div style="font-style:italic;color:#555;font-size:10px;">(Ký và ghi rõ họ tên)</div>
        <div style="height:50px;"></div>
      </td>
      <td style="width:50%;text-align:center;vertical-align:top;">
        <div style="font-weight:bold;">NGƯỜI THU TIỀN</div>
        <div style="font-style:italic;color:#555;font-size:10px;">(Ký và ghi rõ họ tên)</div>
        <div style="height:50px;"></div>
      </td>
    </tr>
  </table>

</div>`;

const BULK_COLLECT_HTML = `<div style="font-family: Arial, sans-serif; font-size: 11px; color:#111; line-height:1.5;">

  <!-- ============== HEADER ============== -->
  <table style="width:100%;border-collapse:collapse;margin-bottom:6px;">
    <tr>
      <td style="width:18%;vertical-align:middle;text-align:center;">{{logo}}</td>
      <td style="width:82%;vertical-align:middle;text-align:center;">
        <div style="font-weight:bold;font-size:14px;">{{ten_co_so}}</div>
        <div style="font-size:11px;color:#555;">Địa chỉ: {{dia_chi_co_so}}</div>
        <div style="font-size:11px;color:#555;">Số điện thoại: {{sdt_co_so}}</div>
      </td>
    </tr>
  </table>

  <div style="border-top:2px solid #111;margin:6px 0 10px;"></div>

  <!-- ============== TIÊU ĐỀ ============== -->
  <div style="text-align:center;margin-bottom:10px;">
    <div style="font-size:22px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;">Phiếu Thu Gộp</div>
    <div style="font-size:11px;color:#555;margin-top:2px;">Ngày thu: <b>{{date}}</b></div>
  </div>

  <!-- ============== BẢNG LIỆT KÊ HOÁ ĐƠN ============== -->
  {{merge_items}}

  <!-- ============== TỔNG CỘNG ============== -->
  <table style="width:100%;border-collapse:collapse;margin-top:4px;margin-bottom:4px;">
    <tr>
      <td colspan="3" style="text-align:right;padding:5px 8px;font-weight:bold;font-size:12px;border-top:2px solid #111;">
        TỔNG CỘNG:
      </td>
      <td style="text-align:right;padding:5px 8px;font-weight:bold;font-size:13px;border-top:2px solid #111;white-space:nowrap;">
        {{tong_tien}} đ
      </td>
    </tr>
    <tr>
      <td colspan="4" style="text-align:right;padding:3px 8px;font-size:11px;font-style:italic;color:#444;">
        Bằng chữ: {{thanh_chu}}
      </td>
    </tr>
  </table>

  <div style="border-top:1px dashed #999;margin:8px 0;"></div>

  <!-- ============== THÔNG TIN THANH TOÁN ============== -->
  <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:16px;">
    <tr>
      <td style="padding:3px 0;width:38%;color:#555;">Hình thức thanh toán:</td>
      <td style="padding:3px 0;font-weight:bold;">{{phuong_thuc}}</td>
    </tr>
    <tr>
       <td style="padding:3px 0;color:#555;">Người tạo:</td>
       <td style="padding:3px 0;font-weight:bold;">{{nguoi_tao}}</td>
     </tr>
     <tr>
       <td style="padding:3px 0;color:#555;">Người thanh toán:</td>
       <td style="padding:3px 0;font-weight:bold;">{{nguoi_thanh_toan}}</td>
    </tr>
  </table>

  <!-- ============== CHỮ KÝ ============== -->
  <table style="width:100%;margin-top:18px;font-size:11px;">
    <tr>
      <td style="width:50%;text-align:center;vertical-align:top;">
        <div style="font-weight:bold;">NGƯỜI NỘP TIỀN</div>
        <div style="font-style:italic;color:#555;font-size:10px;">(Ký và ghi rõ họ tên)</div>
        <div style="height:50px;"></div>
      </td>
      <td style="width:50%;text-align:center;vertical-align:top;">
        <div style="font-weight:bold;">NGƯỜI THU TIỀN</div>
        <div style="font-style:italic;color:#555;font-size:10px;">(Ký và ghi rõ họ tên)</div>
        <div style="height:50px;"></div>
         <div style="font-style:italic;">{{nguoi_tao}}</div>
      </td>
    </tr>
  </table>

</div>`;

const BULK_EXPENSE_HTML = BULK_COLLECT_HTML
  .replace(/Phiếu Thu Gộp/g, "Phiếu Chi Gộp")
  .replace(/PHIẾU THU GỘP/g, "PHIẾU CHI GỘP")
  .replace(/Ngày thu:/g, "Ngày chi:")
  .replace(/NGƯỜI NỘP TIỀN/g, "NGƯỜI NHẬN TIỀN")
  .replace(/NGƯỜI THU TIỀN/g, "NGƯỜI CHI TIỀN")
  .replace(/Người tạo:/g, "Người nhận:")
  .replace(/Người thanh toán:/g, "Người chi:")
  .replace(/nguoi_tao/g, "nguoi_nhan")
  .replace(/nguoi_thanh_toan/g, "nguoi_chi");

export const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    key: "blank",
    label: "Mẫu trống",
    invoiceType: "Thu",
    pageSize: "A4",
    html: "",
  },
  {
    key: "tuition_receipt",
    label: "Phiếu thu học phí (nhiều đợt)",
    invoiceType: "Thu",
    pageSize: "A5",
    html: TUITION_RECEIPT_HTML,
  },
  {
    key: "bulk_collect_thu",
    label: "Phiếu thu gộp",
    invoiceType: "ThuGop",
    pageSize: "A4",
    html: BULK_COLLECT_HTML,
  },
  {
    key: "bulk_collect_chi",
    label: "Phiếu chi gộp",
    invoiceType: "ChiGop",
    pageSize: "A4",
    html: BULK_EXPENSE_HTML,
  },
];
