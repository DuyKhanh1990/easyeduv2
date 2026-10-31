import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Briefcase, Building2, CalendarDays, Download, FileText, MapPin, Printer, UserRound, Users, type LucideIcon } from "lucide-react";

interface StaffCardDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: any;
  onEdit: () => void;
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

function DetailField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="grid min-w-0 grid-cols-[130px_minmax(0,1fr)] gap-3 border-b border-slate-100 py-2.5 text-sm last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="break-words font-medium text-slate-800">{value || "—"}</span>
    </div>
  );
}

function SectionCard({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <h3 className="flex items-center gap-2 border-b border-blue-100 bg-blue-50/80 px-4 py-3 text-sm font-semibold text-slate-800">
        <Icon className="h-4 w-4 text-blue-600" /> {title}
      </h3>
      <div className="px-4 py-1">{children}</div>
    </section>
  );
}

function EmptyTab({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white px-6 text-center">
      <div className="mb-3 rounded-full bg-blue-50 p-3"><FileText className="h-5 w-5 text-blue-500" /></div>
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">{description}</p>
    </div>
  );
}

export function StaffCardDetailDialog({ open, onOpenChange, staff, onEdit }: StaffCardDetailDialogProps) {
  if (!staff) return null;

  const assignments = [
    { label: "Vai trò", icon: Briefcase, names: getUniqueAssignmentNames(staff, "role") },
    { label: "Phòng ban", icon: Building2, names: getUniqueAssignmentNames(staff, "department") },
    { label: "Cơ sở", icon: MapPin, names: getUniqueAssignmentNames(staff, "location") },
  ];
  const active = staff.status === "Hoạt động";
  const roleNames = getUniqueAssignmentNames(staff, "role");
  const departmentNames = getUniqueAssignmentNames(staff, "department");
  const locationNames = getUniqueAssignmentNames(staff, "location");
  const formatDate = (value?: string | Date | null) =>
    value ? new Date(value).toLocaleDateString("vi-VN") : "—";

  const handleDownload = () => {
    const lines = [
      "HỒ SƠ NHÂN SỰ",
      `Họ và tên: ${staff.fullName || "—"}`,
      `Mã nhân viên: ${staff.code || "—"}`,
      `Trạng thái: ${staff.status || "—"}`,
      `Số điện thoại: ${staff.phone || "—"}`,
      `Email: ${staff.email || "—"}`,
      `Tài khoản: ${staff.username || "—"}`,
      `Ngày sinh: ${formatDate(staff.dateOfBirth)}`,
      `Địa chỉ: ${staff.address || "—"}`,
      `Vai trò: ${roleNames.join(", ") || "—"}`,
      `Phòng ban: ${departmentNames.join(", ") || "—"}`,
      `Cơ sở: ${locationNames.join(", ") || "—"}`,
    ];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `ho-so-nhan-su-${String(staff.code || staff.fullName || "nhan-su").replace(/[^a-zA-Z0-9-_]/g, "-")}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(94vh,960px)] w-[96vw] max-w-[1440px] flex-col gap-0 overflow-hidden rounded-2xl border-slate-200 p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Hồ sơ nhân sự: {staff.fullName}</DialogTitle>
          <DialogDescription>Thông tin nhân sự, phân công và lịch sử cập nhật</DialogDescription>
        </DialogHeader>

        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 pr-12 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} className="h-8 gap-1.5 rounded-lg text-xs">
              <ArrowLeft className="h-3.5 w-3.5" /> Quay lại
            </Button>
            <h2 className="truncate text-lg font-bold text-slate-900">Hồ sơ nhân sự</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onEdit} className="h-8 gap-1.5 rounded-lg text-xs">
              <Briefcase className="h-3.5 w-3.5" /> Chỉnh sửa
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleDownload} className="hidden h-8 gap-1.5 rounded-lg text-xs sm:flex">
              <Download className="h-3.5 w-3.5" /> Tải hồ sơ
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => window.print()} className="hidden h-8 gap-1.5 rounded-lg text-xs md:flex">
              <Printer className="h-3.5 w-3.5" /> In thông tin
            </Button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-50 md:flex-row">
          <aside className="w-full shrink-0 overflow-y-auto border-b border-slate-200 bg-white p-4 md:w-[250px] md:border-b-0 md:border-r">
            <div className="flex items-center gap-3 md:flex-col md:text-center">
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-slate-100 to-slate-200 ring-4 ring-blue-50 md:h-28 md:w-28">
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-500 to-indigo-600 text-2xl font-bold text-white">{getInitials(staff.fullName || "?")}</div>
                {staff.avatarUrl && <img src={staff.avatarUrl} alt={`Ảnh đại diện ${staff.fullName}`} className="absolute inset-0 h-full w-full object-cover" onError={(event) => event.currentTarget.remove()} />}
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-base font-bold text-slate-900">{staff.fullName}</h3>
                <p className="font-mono text-xs text-slate-500">{staff.code || "—"}</p>
                <span className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${active ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-amber-500"}`} />
                  {active ? "Đang làm việc" : "Ngừng hoạt động"}
                </span>
              </div>
            </div>

            <div className="mt-4 hidden space-y-2 border-t border-slate-100 pt-4 md:block">
              {assignments.map(({ label, icon: Icon, names }) => (
                <div key={label} className="flex items-start gap-2 text-xs text-slate-600">
                  <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
                  <span className="min-w-0 break-words">{names.join(", ") || "Chưa phân công"}<span className="sr-only">, {label}</span></span>
                </div>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 md:grid-cols-1">
              {[
                { label: "Vai trò", count: roleNames.length, icon: Briefcase, color: "bg-blue-50 text-blue-700" },
                { label: "Phòng ban", count: departmentNames.length, icon: Users, color: "bg-emerald-50 text-emerald-700" },
                { label: "Cơ sở", count: locationNames.length, icon: MapPin, color: "bg-violet-50 text-violet-700" },
              ].map(({ label, count, icon: Icon, color }) => (
                <div key={label} className={`flex items-center gap-2 rounded-lg px-2.5 py-2 ${color}`}>
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{label}</span>
                  <strong className="text-sm">{count}</strong>
                </div>
              ))}
            </div>

            <div className="mt-3 hidden rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-[11px] text-slate-600 md:block">
              <div className="flex items-center gap-1.5 font-medium"><CalendarDays className="h-3.5 w-3.5 text-blue-600" /> Hồ sơ tạo</div>
              <div className="mt-1 font-semibold text-slate-800">{formatDate(staff.createdAt)}</div>
            </div>
          </aside>

          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-3 sm:p-5">
            <Tabs defaultValue="personal" className="w-full">
              <TabsList className="mb-4 flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1">
                <TabsTrigger value="personal" className="shrink-0 gap-1.5 rounded-lg px-3 py-2 text-xs"><UserRound className="h-3.5 w-3.5" />Thông tin cá nhân</TabsTrigger>
                <TabsTrigger value="work" className="shrink-0 gap-1.5 rounded-lg px-3 py-2 text-xs"><Briefcase className="h-3.5 w-3.5" />Công tác</TabsTrigger>
                <TabsTrigger value="contract" className="shrink-0 gap-1.5 rounded-lg px-3 py-2 text-xs"><FileText className="h-3.5 w-3.5" />Hợp đồng</TabsTrigger>
                <TabsTrigger value="salary" className="shrink-0 gap-1.5 rounded-lg px-3 py-2 text-xs"><Download className="h-3.5 w-3.5" />Lương</TabsTrigger>
                <TabsTrigger value="attendance" className="shrink-0 gap-1.5 rounded-lg px-3 py-2 text-xs"><CalendarDays className="h-3.5 w-3.5" />Chấm công</TabsTrigger>
                <TabsTrigger value="insurance" className="shrink-0 gap-1.5 rounded-lg px-3 py-2 text-xs"><Users className="h-3.5 w-3.5" />Bảo hiểm</TabsTrigger>
              </TabsList>

              <TabsContent value="personal" className="mt-0 space-y-3">
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  <SectionCard title="Thông tin cá nhân" icon={UserRound}>
                    <DetailField label="Họ và tên" value={staff.fullName} />
                    <DetailField label="Mã nhân viên" value={staff.code} />
                    <DetailField label="Ngày sinh" value={formatDate(staff.dateOfBirth)} />
                    <DetailField label="Số điện thoại" value={staff.phone} />
                    <DetailField label="Email" value={staff.email} />
                    <DetailField label="Tài khoản" value={staff.username} />
                    <DetailField label="Địa chỉ" value={staff.address} />
                  </SectionCard>
                  <SectionCard title="Đơn vị công tác hiện tại" icon={Building2}>
                    <DetailField label="Phòng ban" value={departmentNames.join(", ")} />
                    <DetailField label="Chức vụ" value={roleNames.join(", ")} />
                    <DetailField label="Cơ sở làm việc" value={locationNames.join(", ")} />
                    <DetailField label="Trạng thái công việc" value={active ? "Đang làm việc" : "Ngừng hoạt động"} />
                    <div className="my-2 rounded-lg bg-blue-50 px-3 py-2.5 text-xs leading-5 text-blue-900">
                      Đang được phân công tại {locationNames.length} cơ sở, {departmentNames.length} phòng ban và {roleNames.length} vai trò.
                    </div>
                  </SectionCard>
                </div>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <SectionCard title="Thông tin hồ sơ" icon={CalendarDays}>
                    <DetailField label="Ngày tạo hồ sơ" value={formatDate(staff.createdAt)} />
                    <DetailField label="Chỉnh sửa gần nhất" value={formatDate(staff.updatedAt)} />
                  </SectionCard>
                  <SectionCard title="Phân công hiện tại" icon={MapPin}>
                    <div className="space-y-2 py-3">
                      {assignments.map(({ label, icon: Icon, names }) => (
                        <div key={label} className="flex gap-2 text-sm">
                          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                          <div><span className="text-slate-500">{label}: </span><span className="font-medium text-slate-800">{names.join(", ") || "Chưa phân công"}</span></div>
                        </div>
                      ))}
                    </div>
                  </SectionCard>
                </div>
              </TabsContent>

              <TabsContent value="work" className="mt-0 space-y-3">
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                  {assignments.map(({ label, icon: Icon, names }) => (
                    <SectionCard key={label} title={label} icon={Icon}>
                      <div className="space-y-2 py-3">
                        {names.length ? names.map((name) => <div key={name} className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800">{name}</div>) : <p className="text-sm text-slate-400">Chưa có thông tin</p>}
                      </div>
                    </SectionCard>
                  ))}
                </div>
                <SectionCard title="Thông tin cập nhật hồ sơ" icon={CalendarDays}>
                  <DetailField label="Ngày tạo hồ sơ" value={formatDate(staff.createdAt)} />
                  <DetailField label="Chỉnh sửa gần nhất" value={formatDate(staff.updatedAt)} />
                  <DetailField label="Trạng thái" value={staff.status} />
                </SectionCard>
              </TabsContent>
              <TabsContent value="contract" className="mt-0"><EmptyTab title="Chưa có dữ liệu hợp đồng" description="Hồ sơ nhân sự hiện chưa liên kết với dữ liệu hợp đồng lao động." /></TabsContent>
              <TabsContent value="salary" className="mt-0"><EmptyTab title="Thông tin lương chưa được liên kết" description="Để bảo vệ dữ liệu nhạy cảm, tab lương chỉ hiển thị khi được kết nối với phân quyền và dữ liệu bảng lương." /></TabsContent>
              <TabsContent value="attendance" className="mt-0"><EmptyTab title="Chấm công chưa được liên kết" description="Dữ liệu chấm công được quản lý ở phân hệ riêng và chưa được tải vào hồ sơ này." /></TabsContent>
              <TabsContent value="insurance" className="mt-0"><EmptyTab title="Chưa có dữ liệu bảo hiểm" description="Hồ sơ nhân sự hiện chưa có dữ liệu bảo hiểm được liên kết." /></TabsContent>
            </Tabs>
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
}
