import { useState, type ReactNode } from "react";
import {
  ArrowLeft,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Download,
  FileText,
  Fingerprint,
  Heart,
  MapPin,
  MoreHorizontal,
  Pencil,
  Phone,
  Printer,
  ShieldCheck,
  UserRound,
  UsersRound,
  Wallet,
  X,
} from "lucide-react";

const staff = {
  fullName: "Nguyễn Thị Mai Anh",
  code: "NV00125",
  status: "Đang làm việc",
  phone: "0987 654 321",
  email: "maianh@easyedu.vn",
  username: "maianh",
  dateOfBirth: "15/07/1995",
  gender: "Nữ",
  identity: "001195002345",
  address: "Số 123 Nguyễn Văn Cừ, Long Biên, Hà Nội",
  createdAt: "01/08/2025",
  updatedAt: "01/08/2025",
  role: "Giáo viên",
  department: "Phòng Đào tạo",
  location: "Cơ sở Hà Nội",
  startDate: "01/08/2025",
  emergencyContact: {
    name: "Trần Văn Bình",
    relation: "Chồng",
    phone: "0901 234 567",
  },
  contract: {
    code: "HDLD-2025-001",
    type: "Không xác định thời hạn",
    signed: "01/08/2025",
    effective: "01/08/2025",
  },
  history: [
    { period: "01/08/2025 – nay", detail: "Giáo viên · Phòng Đào tạo, Cơ sở Hà Nội", active: true },
    { period: "01/09/2022 – 31/07/2025", detail: "Giáo viên · Phòng Đào tạo, Cơ sở Hà Nội" },
    { period: "01/08/2020 – 31/08/2022", detail: "Trợ giảng · Phòng Đào tạo, Cơ sở Hà Nội" },
  ],
};

const tabs = [
  { id: "personal", label: "Thông tin cá nhân", icon: UserRound },
  { id: "work", label: "Công tác", icon: BriefcaseBusiness },
  { id: "contract", label: "Hợp đồng", icon: FileText },
  { id: "pay", label: "Lương", icon: Wallet },
  { id: "attendance", label: "Chấm công", icon: Clock3 },
  { id: "insurance", label: "Bảo hiểm", icon: ShieldCheck },
];

function SectionHeading({
  icon: Icon,
  children,
  trailing,
}: {
  icon: typeof UserRound;
  children: ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[42px] items-center justify-between gap-3 rounded-t-[15px] bg-[#f3f6fc] px-4">
      <div className="flex items-center gap-2.5 text-[13px] font-semibold text-[#263754]">
        <Icon className="h-[15px] w-[15px] text-[#5574b9]" strokeWidth={2.2} />
        {children}
      </div>
      {trailing}
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(110px,0.8fr)_minmax(0,1.2fr)] items-start gap-3 border-b border-[#edf0f5] py-[8px] last:border-b-0">
      <span className="text-[12px] text-[#79859a]">{label}</span>
      <span className="min-w-0 break-words text-[12px] font-medium leading-[1.45] text-[#27354c]">{children}</span>
    </div>
  );
}

function DataPanel({
  icon,
  title,
  children,
  className = "",
  trailing,
}: {
  icon: typeof UserRound;
  title: string;
  children: ReactNode;
  className?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <section className={`overflow-hidden rounded-[16px] border border-[#e7ebf3] bg-white shadow-[0_2px_8px_rgba(42,62,99,0.025)] ${className}`}>
      <SectionHeading icon={icon} trailing={trailing}>{title}</SectionHeading>
      <div className="px-4 pb-3 pt-1">{children}</div>
    </section>
  );
}

export function ProfileDashboard() {
  const [activeTab, setActiveTab] = useState("personal");
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState("");

  const downloadProfile = () => {
    const blob = new Blob([JSON.stringify(staff, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${staff.code}-ho-so.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("Đã tải hồ sơ xuống thiết bị");
    window.setTimeout(() => setNotice(""), 2600);
  };

  const handlePrint = () => window.print();

  return (
    <main className="min-h-[100dvh] bg-[#f4f6fb] px-3 py-4 font-['DM_Sans'] text-[#24324a] sm:px-5 sm:py-5 lg:px-8">
      <div className="mx-auto max-w-[1440px]">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setNotice("Bạn đang xem hồ sơ nhân sự")}
              className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-[#e3e8f1] bg-white px-3 text-[12px] font-medium text-[#53627b] shadow-sm transition hover:border-[#b8c7e1] hover:text-[#304c84]"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Quay lại
            </button>
            <span className="h-5 w-px bg-[#dce2ed]" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8793a8]">Nhân sự / Hồ sơ</p>
              <h1 className="mt-0.5 text-[17px] font-bold tracking-[-0.025em] text-[#22314b] sm:text-[19px]">Hồ sơ nhân sự</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setEditing(true)} className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-[#dce4f0] bg-white px-3 text-[12px] font-semibold text-[#385b9b] transition hover:bg-[#f6f8fd]">
              <Pencil className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Chỉnh sửa</span>
            </button>
            <button onClick={downloadProfile} className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-[#dce4f0] bg-white px-3 text-[12px] font-semibold text-[#53627b] transition hover:bg-[#f6f8fd]">
              <Download className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Tải hồ sơ</span>
            </button>
            <button onClick={handlePrint} className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-[#dce4f0] bg-white px-3 text-[12px] font-semibold text-[#53627b] transition hover:bg-[#f6f8fd]">
              <Printer className="h-3.5 w-3.5" /> <span className="hidden sm:inline">In thông tin</span>
            </button>
          </div>
        </header>

        <div className="grid items-start gap-4 lg:grid-cols-[254px_minmax(0,1fr)]">
          <aside className="overflow-hidden rounded-[18px] border border-[#e4e9f2] bg-white shadow-[0_4px_18px_rgba(40,60,100,0.035)]">
            <div className="relative bg-gradient-to-b from-[#f0f4fc] to-white px-5 pb-4 pt-5 text-center">
              <div className="mx-auto flex h-[102px] w-[102px] items-center justify-center rounded-full border-[4px] border-white bg-[#e2eaf9] text-[30px] font-bold tracking-[-0.05em] text-[#6079ad] shadow-[0_2px_10px_rgba(43,67,113,0.1)]">
                MA
              </div>
              <button onClick={() => setNotice("Ảnh đại diện chưa được cấu hình")} aria-label="Cập nhật ảnh đại diện" className="absolute left-[calc(50%+30px)] top-[95px] flex h-7 w-7 items-center justify-center rounded-full border border-[#e3e8f0] bg-white text-[#586b90] shadow-sm transition hover:bg-[#f3f6fc]">
                <Pencil className="h-3 w-3" />
              </button>
              <h2 className="mt-3 text-[16px] font-bold tracking-[-0.025em] text-[#26344d]">{staff.fullName}</h2>
              <p className="mt-1 font-mono text-[11px] tracking-[0.08em] text-[#73819a]">{staff.code}</p>
              <span className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#e8f7ef] px-3 py-1.5 text-[11px] font-semibold text-[#268255]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#39a977]" /> {staff.status}
              </span>
            </div>
            <div className="mx-4 border-t border-[#edf0f5] py-3">
              <div className="space-y-3 px-1">
                <div className="flex items-center gap-2.5 text-[12px] text-[#475875]"><BriefcaseBusiness className="h-4 w-4 text-[#6882b7]" />{staff.role}</div>
                <div className="flex items-center gap-2.5 text-[12px] text-[#475875]"><UsersRound className="h-4 w-4 text-[#6882b7]" />{staff.department}</div>
                <div className="flex items-center gap-2.5 text-[12px] text-[#475875]"><MapPin className="h-4 w-4 text-[#6882b7]" />{staff.location}</div>
              </div>
            </div>
            <div className="mx-4 mb-3 rounded-[13px] border border-[#e5eaf3] bg-[#f8faff] px-3.5 py-3">
              <div className="flex items-start gap-2.5">
                <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-[#6780b4]" />
                <div>
                  <p className="text-[10px] text-[#7d899d]">Ngày vào làm</p>
                  <p className="mt-0.5 text-[12px] font-semibold text-[#33425d]">{staff.startDate}</p>
                </div>
              </div>
            </div>
            <div className="border-t border-[#edf0f5] p-3">
              <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#929db0]">Truy cập nhanh</p>
              {[
                { label: "Lịch làm việc", icon: CalendarDays, key: "work" },
                { label: "Chấm công", icon: Clock3, key: "attendance" },
                { label: "Hợp đồng", icon: FileText, key: "contract" },
                { label: "Lương thưởng", icon: Wallet, key: "pay" },
              ].map(({ label, icon: Icon, key }) => (
                <button key={label} onClick={() => setActiveTab(key)} className="group flex w-full items-center justify-between rounded-[9px] px-2.5 py-2 text-left text-[11px] font-medium text-[#53627c] transition hover:bg-[#f3f6fc] hover:text-[#36588f]">
                  <span className="flex items-center gap-2.5"><Icon className="h-3.5 w-3.5 text-[#7187b2]" />{label}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-[#abb5c7] transition group-hover:translate-x-0.5" />
                </button>
              ))}
            </div>
          </aside>

          <section className="min-w-0">
            <nav aria-label="Mục hồ sơ" className="mb-3 flex gap-1 overflow-x-auto rounded-[14px] border border-[#e5eaf2] bg-white p-1.5 shadow-[0_2px_8px_rgba(42,62,99,0.02)]">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => setActiveTab(id)} className={`relative flex shrink-0 items-center gap-2 rounded-[10px] px-3 py-2.5 text-[11px] font-semibold transition sm:px-3.5 ${activeTab === id ? "bg-[#edf3ff] text-[#365b9f]" : "text-[#6f7b91] hover:bg-[#f7f8fb] hover:text-[#435575]"}`}>
                  <Icon className="h-3.5 w-3.5" />{label}
                  {activeTab === id && <span className="absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-[#6281bd]" />}
                </button>
              ))}
            </nav>

            {activeTab === "personal" && (
              <div className="grid gap-3.5 xl:grid-cols-2">
                <DataPanel icon={UserRound} title="Thông tin cá nhân">
                  <DetailRow label="Họ và tên">{staff.fullName}</DetailRow>
                  <DetailRow label="Mã nhân viên">{staff.code}</DetailRow>
                  <DetailRow label="Giới tính"><span className="inline-flex rounded-full bg-[#f9edf3] px-2 py-0.5 text-[11px] text-[#a44f78]">{staff.gender}</span></DetailRow>
                  <DetailRow label="Ngày sinh">{staff.dateOfBirth}</DetailRow>
                  <DetailRow label="Số CMND/CCCD">{staff.identity}</DetailRow>
                  <DetailRow label="Điện thoại"><a className="hover:text-[#4569aa]" href={`tel:${staff.phone.replaceAll(" ", "")}`}>{staff.phone}</a></DetailRow>
                  <DetailRow label="Email"><a className="hover:text-[#4569aa]" href={`mailto:${staff.email}`}>{staff.email}</a></DetailRow>
                  <DetailRow label="Tài khoản">{staff.username}</DetailRow>
                  <DetailRow label="Địa chỉ">{staff.address}</DetailRow>
                </DataPanel>

                <div className="space-y-3.5">
                  <DataPanel icon={BriefcaseBusiness} title="Đơn vị công tác">
                    <DetailRow label="Phòng ban"><span className="inline-flex rounded-full bg-[#edf3ff] px-2.5 py-1 text-[11px] font-medium text-[#45659e]">{staff.department}</span></DetailRow>
                    <DetailRow label="Chức vụ">{staff.role}</DetailRow>
                    <DetailRow label="Cơ sở làm việc"><span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-[#657eae]" />{staff.location}</span></DetailRow>
                    <DetailRow label="Ngày bắt đầu công tác">{staff.startDate}</DetailRow>
                    <DetailRow label="Trạng thái công việc"><span className="inline-flex items-center gap-1.5 rounded-full bg-[#e8f7ef] px-2 py-1 text-[10px] font-semibold text-[#278357]"><span className="h-1.5 w-1.5 rounded-full bg-[#39a977]" />Đang làm việc</span></DetailRow>
                    <div className="mt-2 flex items-start gap-2 rounded-[10px] bg-[#f2f6fd] px-3 py-2.5 text-[10px] leading-relaxed text-[#63728d]">
                      <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#6780b4]" />
                      <span>Đang công tác tại <strong className="font-semibold text-[#405779]">{staff.location}</strong><br />Từ ngày {staff.startDate} đến nay</span>
                    </div>
                  </DataPanel>

                  <div className="grid gap-3.5 sm:grid-cols-2">
                    <DataPanel icon={Phone} title="Liên hệ khẩn cấp">
                      <DetailRow label="Họ tên">{staff.emergencyContact.name}</DetailRow>
                      <DetailRow label="Quan hệ">{staff.emergencyContact.relation}</DetailRow>
                      <DetailRow label="Điện thoại"><a href={`tel:${staff.emergencyContact.phone.replaceAll(" ", "")}`}>{staff.emergencyContact.phone}</a></DetailRow>
                    </DataPanel>
                    <DataPanel icon={FileText} title="Hợp đồng lao động" trailing={<span className="inline-flex items-center gap-1 rounded-full bg-[#e9f7ef] px-2 py-1 text-[9px] font-semibold text-[#2c8659]"><span className="h-1.5 w-1.5 rounded-full bg-[#42a477]" />Đang hiệu lực</span>}>
                      <DetailRow label="Số hợp đồng">{staff.contract.code}</DetailRow>
                      <DetailRow label="Loại hợp đồng">{staff.contract.type}</DetailRow>
                      <DetailRow label="Ngày ký">{staff.contract.signed}</DetailRow>
                      <DetailRow label="Ngày hiệu lực">{staff.contract.effective}</DetailRow>
                    </DataPanel>
                  </div>
                </div>

                <DataPanel icon={BriefcaseBusiness} title="Quá trình công tác">
                  <div className="relative ml-1.5 mt-1 space-y-0.5 border-l border-[#d9e2f2] pl-4">
                    {staff.history.map((item) => (
                      <div key={item.period} className="relative py-1.5">
                        <span className={`absolute -left-[21px] top-[11px] h-2.5 w-2.5 rounded-full border-2 border-white ${item.active ? "bg-[#4673c3] ring-1 ring-[#dce7f8]" : "bg-[#a8bce0]"}`} />
                        <p className="text-[11px] font-semibold text-[#344561]">{item.period}</p>
                        <p className="mt-0.5 text-[10px] leading-relaxed text-[#718099]">{item.detail}</p>
                      </div>
                    ))}
                  </div>
                </DataPanel>

                <div className="grid gap-3.5 sm:grid-cols-2">
                  <DataPanel icon={Fingerprint} title="Thông tin tài khoản">
                    <DetailRow label="Tên đăng nhập">{staff.username}</DetailRow>
                    <DetailRow label="Email công việc">{staff.email}</DetailRow>
                  </DataPanel>
                  <DataPanel icon={Heart} title="Thông tin hồ sơ">
                    <DetailRow label="Hồ sơ tạo">{staff.createdAt}</DetailRow>
                    <DetailRow label="Chỉnh sửa gần nhất">{staff.updatedAt}</DetailRow>
                  </DataPanel>
                </div>
              </div>
            )}

            {activeTab === "work" && (
              <div className="grid gap-3.5 md:grid-cols-2">
                <DataPanel icon={BriefcaseBusiness} title="Đơn vị công tác">
                  <DetailRow label="Phòng ban">{staff.department}</DetailRow><DetailRow label="Chức vụ">{staff.role}</DetailRow><DetailRow label="Cơ sở">{staff.location}</DetailRow><DetailRow label="Ngày bắt đầu">{staff.startDate}</DetailRow><DetailRow label="Trạng thái">Đang làm việc</DetailRow>
                </DataPanel>
                <DataPanel icon={Building2} title="Quá trình công tác">
                  <div className="relative ml-1.5 mt-1 space-y-1 border-l border-[#d9e2f2] pl-4">{staff.history.map((item) => <div key={item.period} className="relative py-2"><span className={`absolute -left-[21px] top-3 h-2.5 w-2.5 rounded-full border-2 border-white ${item.active ? "bg-[#4673c3]" : "bg-[#a8bce0]"}`} /><p className="text-[12px] font-semibold">{item.period}</p><p className="mt-1 text-[11px] text-[#718099]">{item.detail}</p></div>)}</div>
                </DataPanel>
              </div>
            )}
            {activeTab === "contract" && (
              <DataPanel icon={FileText} title="Hợp đồng lao động" trailing={<span className="inline-flex items-center gap-1 rounded-full bg-[#e9f7ef] px-2 py-1 text-[10px] font-semibold text-[#2c8659]"><Check className="h-3 w-3" />Đang hiệu lực</span>}>
                <div className="max-w-2xl"><DetailRow label="Số hợp đồng">{staff.contract.code}</DetailRow><DetailRow label="Loại hợp đồng">{staff.contract.type}</DetailRow><DetailRow label="Ngày ký">{staff.contract.signed}</DetailRow><DetailRow label="Ngày hiệu lực">{staff.contract.effective}</DetailRow><DetailRow label="Nhân sự">{staff.fullName} · {staff.code}</DetailRow></div>
              </DataPanel>
            )}
            {["pay", "attendance", "insurance"].includes(activeTab) && (
              <section className="flex min-h-[310px] flex-col items-center justify-center rounded-[16px] border border-[#e7ebf3] bg-white px-6 text-center shadow-[0_2px_8px_rgba(42,62,99,0.025)]">
                <div className="flex h-12 w-12 items-center justify-center rounded-[15px] bg-[#f1f5fc] text-[#7187b2]">
                  {activeTab === "pay" ? <Wallet className="h-5 w-5" /> : activeTab === "attendance" ? <Clock3 className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
                </div>
                <h3 className="mt-4 text-[14px] font-semibold text-[#34435d]">{tabs.find((tab) => tab.id === activeTab)?.label}</h3>
                <p className="mt-1.5 max-w-sm text-[12px] leading-relaxed text-[#8390a4]">Thông tin mục này chưa có trong hồ sơ được cung cấp.</p>
              </section>
            )}

            <footer className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1 text-[10px] text-[#8a96aa]">
              <span>Cập nhật lần cuối {staff.updatedAt}</span>
          <button onClick={() => setNotice("Hồ sơ nhân sự · " + staff.code)} className="inline-flex items-center gap-1 font-medium text-[#667895] hover:text-[#3c5e9f]">Thao tác khác <MoreHorizontal className="h-3.5 w-3.5" /></button>
            </footer>
          </section>
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1d2b43]/35 p-4 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(false); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="edit-title" className="w-full max-w-md rounded-[18px] border border-[#e5eaf2] bg-white p-5 shadow-[0_20px_70px_rgba(34,48,76,0.2)]">
            <div className="flex items-start justify-between">
              <div><h2 id="edit-title" className="text-[16px] font-bold text-[#293852]">Chỉnh sửa hồ sơ</h2><p className="mt-1 text-[11px] text-[#7d899e]">Thông tin hiện được xem ở chế độ mockup.</p></div>
              <button aria-label="Đóng" onClick={() => setEditing(false)} className="rounded-lg p-1.5 text-[#8490a3] hover:bg-[#f2f5fa]"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-4 space-y-3">
              <label className="block text-[11px] font-medium text-[#65738b]">Họ và tên<input readOnly value={staff.fullName} className="mt-1.5 h-10 w-full rounded-[9px] border border-[#e2e7ef] bg-[#fafbfd] px-3 text-[12px] text-[#34435d] outline-none" /></label>
              <label className="block text-[11px] font-medium text-[#65738b]">Email<input readOnly value={staff.email} className="mt-1.5 h-10 w-full rounded-[9px] border border-[#e2e7ef] bg-[#fafbfd] px-3 text-[12px] text-[#34435d] outline-none" /></label>
              <p className="rounded-[9px] bg-[#f3f6fc] px-3 py-2.5 text-[10px] leading-relaxed text-[#6c7b94]">Chỉnh sửa và lưu dữ liệu cần được kết nối với hệ thống nhân sự.</p>
            </div>
            <div className="mt-4 flex justify-end"><button onClick={() => setEditing(false)} className="rounded-[9px] bg-[#3e609f] px-4 py-2 text-[11px] font-semibold text-white transition hover:bg-[#324f87]">Đóng</button></div>
          </div>
        </div>
      )}

      {notice && (
        <div role="status" className="fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full border border-[#dfe7f3] bg-white px-4 py-2.5 text-[11px] font-medium text-[#405675] shadow-[0_8px_28px_rgba(34,48,76,0.15)]">
          <Check className="h-3.5 w-3.5 text-[#34855d]" />{notice}
          <button onClick={() => setNotice("")} aria-label="Đóng thông báo" className="ml-1 rounded-full p-0.5 text-[#8792a4] hover:bg-[#f1f4f8]"><X className="h-3 w-3" /></button>
        </div>
      )}
    </main>
  );
}
