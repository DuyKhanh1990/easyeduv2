import {
  LayoutDashboard,
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
} from "lucide-react";
import { SiMessenger } from "react-icons/si";

export type SubTab = {
  value: string;
  name: string;
};

export type NavItem = {
  name: string;
  href: string;
  icon: any;
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
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Chat", href: "/chat", icon: SiMessenger },
  {
    module: "MY SPACE",
    color: "text-violet-600 dark:text-violet-400",
    icon: Users2,
    items: [
      { name: "Lịch cá nhân", href: "/my-space/calendar", icon: CalendarDays },
      { name: "Bài tập của tôi", href: "/my-space/assignments", icon: ClipboardList },
      { name: "Bảng điểm của tôi", href: "/my-space/score-sheet", icon: BarChart3 },
      { name: "Hoá đơn của tôi", href: "/my-space/invoices", icon: FileText },
      { name: "Bảng lương của tôi", href: "/my-space/payroll", icon: Wallet }
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
          { value: "sources", name: "Nguồn khách hàng" }
        ]
      }
    ]
  },
  {
    module: "HRM",
    color: "text-orange-600 dark:text-orange-400",
    icon: Briefcase,
    items: [
      { name: "Nhân sự", href: "/staff", icon: Briefcase },
      {
        name: "Ca làm việc",
        href: "/shifts",
        icon: CalendarDays,
        subTabs: [
          { value: "register", name: "Đăng ký ca dạy" }
        ]
      },
      {
        name: "Lương đứng lớp",
        href: "/teacher-salary",
        icon: Wallet,
        subTabs: [
          { value: "salary-tables", name: "Bảng lương đứng lớp" },
          { value: "salary-packages", name: "Gói lương đứng lớp" },
          { value: "staff-config", name: "Cấu hình theo nhân sự" }
        ]
      }
    ]
  },
  {
    module: "EDUCATION",
    color: "text-emerald-600 dark:text-emerald-400",
    icon: GraduationCap,
    items: [
      { name: "Tổng quan học tập", href: "/learning-overview", icon: BookOpen },
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
          { value: "score-sheets", name: "Bảng điểm mẫu" }
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
      {
        name: "Cấu hình tài chính",
        href: "/finance-config",
        icon: Cog,
        subTabs: [
          { value: "promotions", name: "Khuyến mãi / Phụ thu" },
          { value: "categories", name: "Danh mục Thu Chi" }
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
          { value: "providers", name: "Kết nối nhà cung cấp" }
        ]
      }
    ]
  }
];
