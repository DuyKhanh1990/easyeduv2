import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Briefcase, Building2, CalendarDays, Mail, MapPin, Phone, UserRound } from "lucide-react";

interface StaffCardDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: any;
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

function getUniqueAssignmentNames(staff: any, key: "role" | "department" | "location") {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const assignment of staff?.assignments ?? []) {
    const name = assignment[key]?.name;
    if (typeof name === "string" && name.trim() && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

function DetailField({ label, value, icon: Icon }: { label: string; value?: string | null; icon: typeof Phone }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="break-words text-sm text-slate-800">{value || "—"}</div>
    </div>
  );
}

export function StaffCardDetailDialog({ open, onOpenChange, staff }: StaffCardDetailDialogProps) {
  if (!staff) return null;

  const assignments = [
    { label: "Vai trò", icon: Briefcase, names: getUniqueAssignmentNames(staff, "role") },
    { label: "Phòng ban", icon: Building2, names: getUniqueAssignmentNames(staff, "department") },
    { label: "Cơ sở", icon: MapPin, names: getUniqueAssignmentNames(staff, "location") },
  ];
  const active = staff.status === "Hoạt động";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-xl overflow-y-auto rounded-2xl border-slate-200 p-5">
        <DialogHeader>
          <DialogTitle className="sr-only">Chi tiết nhân sự</DialogTitle>
          <DialogDescription>Thông tin hồ sơ nhân sự</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-slate-100 to-slate-200">
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-500 to-indigo-600 text-xl font-bold text-white">
              {getInitials(staff.fullName || "?")}
            </div>
            {staff.avatarUrl && (
              <img
                src={staff.avatarUrl}
                alt={`Ảnh đại diện ${staff.fullName}`}
                className="absolute inset-0 h-full w-full object-cover"
                onError={(event) => event.currentTarget.remove()}
              />
            )}
          </div>
          <div className="min-w-0">
            <div className={`mb-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${active ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-amber-500"}`} />
              {active ? "Đang làm việc" : "Ngừng hoạt động"}
            </div>
            <h2 className="truncate text-lg font-bold text-slate-900">{staff.fullName}</h2>
            <p className="font-mono text-xs text-slate-500">{staff.code || "—"}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <DetailField label="Số điện thoại" value={staff.phone} icon={Phone} />
          <DetailField label="Email" value={staff.email} icon={Mail} />
          <DetailField label="Tài khoản" value={staff.username} icon={UserRound} />
          <DetailField
            label="Ngày sinh"
            value={staff.dateOfBirth ? new Date(staff.dateOfBirth).toLocaleDateString("vi-VN") : null}
            icon={CalendarDays}
          />
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 sm:col-span-2">
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
              <MapPin className="h-3.5 w-3.5" /> Địa chỉ
            </div>
            <div className="break-words text-sm text-slate-800">{staff.address || "—"}</div>
          </div>
        </div>

        <div className="space-y-2">
          {assignments.map(({ label, icon: Icon, names }) => (
            <div key={label} className="rounded-xl border border-slate-100 p-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                <Icon className="h-3.5 w-3.5" /> {label}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {names.length ? names.map((name) => (
                  <span key={`${label}-${name}`} className="rounded-full bg-violet-50 px-2.5 py-1 text-xs text-violet-800">{name}</span>
                )) : <span className="text-sm text-slate-400">—</span>}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
          <span>Hồ sơ tạo: {staff.createdAt ? new Date(staff.createdAt).toLocaleDateString("vi-VN") : "—"}</span>
          <span>Chỉnh sửa gần nhất: {staff.updatedAt ? new Date(staff.updatedAt).toLocaleDateString("vi-VN") : "—"}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
