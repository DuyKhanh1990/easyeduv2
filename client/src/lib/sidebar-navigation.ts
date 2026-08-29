import {
  LayoutDashboard,
  Newspaper,
  Users,
  Briefcase,
  Settings,
  GraduationCap,
  CalendarDays,
  FileText,
  BookOpen,
  Cog,
  ShieldCheck,
  CreditCard,
  Users2,
  ClipboardList,
  Wallet,
  BarChart3,
  ListTodo,
  Package,
  Warehouse,
  Bell,
  ArrowLeftRight,
} from "lucide-react";
import { SiMessenger, SiZalo, SiFacebook } from "react-icons/si";

export type SubTabItem = {
  value: string;
  name: string;
};

export type SubTab = {
  value: string;
  name: string;
  subItems?: SubTabItem[];
};

export type NavItem = {
  name: string;
  href: string;
  icon: any;
  permissionHref?: string;
  subTabs?: SubTab[];
};

export type NavModule = {
  module: string;
  color: string;
  icon: any;
  items: NavItem[];
};

export type NavEntry = NavItem | NavModule;

export const navigation: NavEntry[] = [
  {
    name: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
    subTabs: [
      { value: "khach-hang", name: "Khách hàng" },
      { value: "dao-tao", name: "Đào tạo" },
      { value: "tai-chinh", name: "Tài chính" },
      { value: "bao-cao", name: "Báo cáo" },
    ],
  },
  { name: "Bảng tin", href: "/news-feed", icon: Newspaper },
  { name: "Chat", href: "/chat", icon: SiMessenger },
  { name: "Zalo OA", href: "/zalo", icon: SiZalo },
  { name: "Facebook", href: "/facebook", icon: SiFacebook },
  {
    module: "MY SPACE",
    color: "text-violet-600 dark:text-violet-400",
    icon: Users2,
    items: [
      { name: "Lịch cá nhân", href: "/my-space/calendar", icon: CalendarDays },
      { name: "Bài tập của tôi", href: "/my-space/assignments", icon: ClipboardList },
      { name: "Bảng điểm của tôi", href: "/my-space/score-sheet", icon: BarChart3 },
      { name: "Hoá đơn của tôi", href: "/my-space/invoices", icon: FileText },
      { name: "Bảng lương của tôi", href: "/my-space/payroll", icon: Wallet },
      { name: "Đơn từ của tôi", href: "/my-space/don-tu", icon: FileText }
    ]
  },
  {
    module: "CÔNG VIỆC",
    color: "text-cyan-600 dark:text-cyan-400",
    icon: ListTodo,
    items: [
      {
        name: "Công việc",
        href: "/tasks",
        icon: ListTodo,
        subTabs: [
          { value: "list", name: "Danh sách công việc" },
          { value: "config", name: "Cấu hình công việc" },
        ]
      }
    ]
  },
  {
    module: "CRM",
    color: "text-blue-600 dark:text-blue-400",
    icon: Users,
    items: [
      { name: "Khách hàng", href: "/customers", icon: Users },
      {
        name: "Cấu hình CRM",
        href: "/customers/crm-config",
        icon: Cog,
        subTabs: [
          { value: "relationships", name: "Mối quan hệ" },
          { value: "reject-reasons", name: "Lý do từ chối" },
          { value: "sources", name: "Nguồn khách hàng" },
          { value: "schools", name: "Trường học" },
          { value: "additional-info", name: "Thông tin bổ sung" },
          { value: "required-info", name: "Thông tin bắt buộc" }
        ]
      },
      { name: "Lịch sử thông báo", href: "/notification-logs", icon: Bell },
    ]
  },
  {
    module: "HRM",
    color: "text-orange-600 dark:text-orange-400",
    icon: Briefcase,
    items: [
      { name: "Nhân sự", href: "/staff", icon: Briefcase },
      { name: "Đơn từ", href: "/don-tu", icon: FileText },
      {
        name: "Hoa hồng",
        href: "/commission",
        icon: Wallet,
        subTabs: [
          { value: "commission-board", name: "Bảng hoa hồng" },
          { value: "commission-config", name: "Cấu hình hoa hồng" }
        ]
      },
      {
        name: "Ca làm việc",
        href: "/shifts",
        icon: CalendarDays,
        subTabs: [
          { value: "register", name: "Đăng ký ca dạy" },
          { value: "board", name: "Bảng phân ca" },
          { value: "assign", name: "Phân ca làm việc" },
          { value: "config", name: "Cấu hình ca làm việc" }
        ]
      },
      { name: "Bảng chấm công", href: "/cham-cong", icon: CalendarDays },
      {
        name: "Lương đứng lớp",
        href: "/teacher-salary",
        icon: Wallet,
        subTabs: [
          { value: "salary-tables", name: "Bảng lương đứng lớp" },
          { value: "salary-packages", name: "Gói lương đứng lớp" },
          { value: "staff-config", name: "Cấu hình theo nhân sự" }
        ]
      },
      {
        name: "Tổng lương",
        href: "/tong-luong",
        icon: Wallet,
        subTabs: [
          { value: "salary-sheets", name: "Bảng tổng lương" },
          { value: "staff-config", name: "Cấu hình Lương nhân sự" },
          { value: "default-config", name: "Cấu hình mặc định" }
        ]
      }
    ]
  },
  {
    module: "EDUCATION",
    color: "text-emerald-600 dark:text-emerald-400",
    icon: GraduationCap,
    items: [
      {
        name: "Tổng quan học tập",
        href: "/learning-overview",
        icon: BookOpen,
        subTabs: [
          { value: "overview", name: "Tổng quan học viên" },
          { value: "students-ending", name: "Học viên sắp hết lịch" },
          { value: "classes-ending", name: "Lớp học sắp kết thúc" },
          { value: "cho-bu-bao-luu", name: "Chờ bù - Bảo lưu" },
          { value: "bang-diem", name: "Bảng điểm" },
          { value: "bai-tap-ve-nha", name: "Bài tập về nhà" },
          { value: "nhan-xet-hoc-vien", name: "Nhận xét học viên" },
          { value: "cham-cong-giao-vien", name: "Chấm công giáo viên" },
          { value: "xin-nghi", name: "Xin nghỉ" }
        ]
      },
      { name: "Lớp học", href: "/classes", icon: GraduationCap },
      { name: "Lịch học", href: "/schedule", icon: CalendarDays },
      { name: "Điểm danh", href: "/attendance", icon: CalendarDays },
      {
        name: "Khoá học & Chương trình",
        href: "/courses",
        icon: BookOpen,
        subTabs: [
          { value: "courses", name: "Khoá học" },
          { value: "programs", name: "Chương trình học" },
          { value: "library", name: "Thư viện nội dung" }
        ]
      },
      {
        name: "Bài kiểm tra",
        href: "/assessments",
        icon: FileText,
        subTabs: [
          { value: "list", name: "Danh sách Bài kiểm tra" },
          { value: "question-bank", name: "Ngân hàng câu hỏi" },
          { value: "results", name: "Kết quả bài làm" }
        ]
      },
      {
        name: "Cấu hình Education",
        href: "/education-config",
        icon: Cog,
        subTabs: [
          { value: "classrooms", name: "Phòng học" },
          { value: "subjects", name: "Bộ môn" },
          { value: "evaluation", name: "Tiêu chí đánh giá" },
          { value: "shifts", name: "Ca học" },
          { value: "attendance-fee", name: "Trừ tiền học phí" },
          { value: "score-sheets", name: "Bảng điểm mẫu" },
          { value: "online-learning", name: "Học online" }
        ]
      }
    ]
  },
  {
    module: "FINANCE",
    color: "text-purple-600 dark:text-purple-400",
    icon: CreditCard,
    items: [
      { name: "Hoá đơn", href: "/invoices", icon: FileText },
      { name: "Công nợ", href: "/invoices/debt", icon: FileText, permissionHref: "/invoices" },
      { name: "Học phí trả sau", href: "/deferred-tuition", icon: CreditCard, permissionHref: "/invoices" },
      { name: "Đối soát", href: "/reconciliation", icon: ArrowLeftRight },
      {
        name: "Cấu hình tài chính",
        href: "/finance-config",
        icon: Cog,
        subTabs: [
          { value: "promotions", name: "Khuyến mãi / Phụ thu" },
           { value: "categories", name: "Danh mục Thu Chi" },
           { value: "voucher", name: "Voucher" }
        ]
      }
    ]
  },
  {
    module: "STORE (KHO)",
    color: "text-amber-600 dark:text-amber-400",
    icon: Package,
    items: [
      {
        name: "Kho hàng",
        href: "/store",
        icon: Warehouse,
        subTabs: [
          { value: "nhap-kho", name: "Nhập kho" },
          { value: "xuat-kho", name: "Xuất kho" },
          { value: "chuyen-kho", name: "Chuyển kho" },
          { value: "ton-kho", name: "Tồn kho" },
          { value: "san-pham", name: "Sản phẩm" },
          { value: "cau-hinh", name: "Cấu hình kho" },
        ]
      }
    ]
  },
  {
    module: "SETTING",
    color: "text-slate-600 dark:text-slate-400",
    icon: ShieldCheck,
    items: [
      {
        name: "Cấu hình hệ thống",
        href: "/settings",
        icon: Settings,
        subTabs: [
          { value: "locations", name: "Cơ sở" },
          { value: "departments", name: "Phòng ban & Vai trò" },
          { value: "system", name: "Quản lý hệ thống" },
          { value: "permissions", name: "Quản lý phân quyền" },
          { value: "ai-accounts", name: "Tài khoản AI" },
          {
            value: "providers",
            name: "Kết nối nhà cung cấp",
            subItems: [
              { value: "payment", name: "Cổng thanh toán" },
              { value: "einvoice", name: "Hoá đơn điện tử" },
              { value: "zalo-oa", name: "Zalo OA" },
              { value: "call-center", name: "Tổng đài" },
            ],
          },
          { value: "holidays", name: "Ngày nghỉ lễ" }
        ]
      }
    ]
  }
];
