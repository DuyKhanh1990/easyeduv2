import "./_group.css";
import { Briefcase, Building2, CalendarDays, Mail, MapPin, Phone, UserRound } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const staff = {
  fullName: "Nguyễn Thị Mai Anh",
  code: "NV00125",
  status: "Hoạt động",
  phone: "0987 654 321",
  email: "maianh@easyedu.vn",
  username: "maianh",
  dateOfBirth: "1995-07-15",
  address: "Số 123 Nguyễn Văn Cừ, Long Biên, Hà Nội",
  createdAt: "2025-08-01",
  updatedAt: "2025-08-01",
  assignments: [
    { role: { name: "Giáo viên" }, department: { name: "Phòng Đào tạo" }, location: { name: "Cơ sở Hà Nội" } },
  ],
};

const namesFor = (key: "role" | "department" | "location") =>
  [...new Set(staff.assignments.map((assignment) => assignment[key]?.name).filter(Boolean))] as string[];

function Field({ label, value, icon: Icon }: { label: string; value?: string; icon: typeof Phone }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-slate-500"><Icon className="h-3.5 w-3.5" />{label}</div>
      <div className="break-words text-sm text-slate-800">{value || "—"}</div>
    </div>
  );
}

export function Current() {
  const active = staff.status === "Hoạt động";
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <Dialog open>
        <DialogContent className="max-h-[88vh] max-w-xl overflow-y-auto rounded-2xl border-slate-200 p-5">
          <DialogHeader>
            <DialogTitle className="sr-only">Chi tiết nhân sự</DialogTitle>
            <DialogDescription>Thông tin hồ sơ nhân sự</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-xl font-bold text-white">MA</div>
            <div>
              <div className={`mb-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${active ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-amber-500"}`} />{active ? "Đang làm việc" : "Ngừng hoạt động"}
              </div>
              <h2 className="text-lg font-bold text-slate-900">{staff.fullName}</h2>
              <p className="font-mono text-xs text-slate-500">{staff.code}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label="Số điện thoại" value={staff.phone} icon={Phone} />
            <Field label="Email" value={staff.email} icon={Mail} />
            <Field label="Tài khoản" value={staff.username} icon={UserRound} />
            <Field label="Ngày sinh" value="15/07/1995" icon={CalendarDays} />
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 sm:col-span-2">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-slate-500"><MapPin className="h-3.5 w-3.5" />Địa chỉ</div>
              <div className="text-sm text-slate-800">{staff.address}</div>
            </div>
          </div>
          <div className="space-y-2">
            {[
              { label: "Vai trò", icon: Briefcase, key: "role" as const },
              { label: "Phòng ban", icon: Building2, key: "department" as const },
              { label: "Cơ sở", icon: MapPin, key: "location" as const },
            ].map(({ label, icon: Icon, key }) => (
              <div key={label} className="rounded-xl border border-slate-100 p-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-slate-500"><Icon className="h-3.5 w-3.5" />{label}</div>
                <div className="flex flex-wrap gap-1.5">
                  {namesFor(key).map((name) => <span key={name} className="rounded-full bg-violet-50 px-2.5 py-1 text-xs text-violet-800">{name}</span>)}
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
            <span>Hồ sơ tạo: 01/08/2025</span><span>Chỉnh sửa gần nhất: 01/08/2025</span>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
