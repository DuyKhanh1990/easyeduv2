import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  GraduationCap, Phone, Mail, CalendarDays, User, MessageSquare,
  ChevronDown, BookOpen, Check, Loader2, X,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface FieldConfig { fieldKey: string; isVisible: boolean; isRequired: boolean }
interface CustomFieldDef {
  id: string; label: string;
  fieldType: "text" | "number" | "date" | "textarea" | "select";
  options?: string[] | null;
}
interface FormConfig { fields: FieldConfig[]; customFields: CustomFieldDef[] }
interface Source { id: string; name: string }
interface StaffMember { id: string; fullName: string }

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Fetch error");
  return res.json();
}

// ── Shared sub-components ─────────────────────────────────────────────────────
function FieldWrapper({ label, required, optional, children }: {
  label: string; required?: boolean; optional?: boolean; children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
        {optional && <span className="text-gray-400 font-normal ml-1">(không bắt buộc)</span>}
      </label>
      {children}
    </div>
  );
}

function TextInput({ icon, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { icon: React.ReactNode }) {
  return (
    <div className="relative">
      <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">{icon}</div>
      <input
        {...props}
        className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400"
      />
    </div>
  );
}

function TextareaInput({ icon, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { icon: React.ReactNode }) {
  return (
    <div className="relative">
      <div className="absolute left-3 top-3 pointer-events-none text-gray-400">{icon}</div>
      <textarea {...props} rows={3}
        className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400 resize-none"
      />
    </div>
  );
}

function SelectInput({ icon, options, placeholder, value, onChange }: {
  icon: React.ReactNode; options: { value: string; label: string }[];
  placeholder: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 z-10">{icon}</div>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full pl-9 pr-8 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none text-gray-700"
      >
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
        <ChevronDown className="h-4 w-4" />
      </div>
    </div>
  );
}

// ── Inner form (stateful) ─────────────────────────────────────────────────────
function RegistrationForm({ onSuccess }: { onSuccess: () => void }) {
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [consent, setConsent] = useState(true);

  const { data: config } = useQuery<FormConfig>({
    queryKey: ["/api/public/registration-form-config"],
    queryFn: () => fetchJson("/api/public/registration-form-config"),
  });

  const visibleKeys = new Set((config?.fields ?? []).filter(f => f.isVisible).map(f => f.fieldKey));
  const requiredKeys = new Set((config?.fields ?? []).filter(f => f.isRequired).map(f => f.fieldKey));
  const show = (k: string) => visibleKeys.has(k);
  const req = (k: string) => requiredKeys.has(k);

  const { data: sources = [] } = useQuery<Source[]>({
    queryKey: ["/api/public/registration-form/sources"],
    queryFn: () => fetchJson("/api/public/registration-form/sources"),
    enabled: show("customerSourceIds"),
  });
  const { data: staffList = [] } = useQuery<StaffMember[]>({
    queryKey: ["/api/public/registration-form/staff"],
    queryFn: () => fetchJson("/api/public/registration-form/staff"),
    enabled: show("salesByIds"),
  });

  const submitMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await fetch("/api/public/registration-form/submit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || "Lỗi gửi form"); }
      return res.json();
    },
    onSuccess,
  });

  const set = (k: string, v: any) => setFormData(p => ({ ...p, [k]: v }));
  const get = (k: string, fb: any = "") => formData[k] ?? fb;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName?.trim()) return;
    const customFields: Record<string, any> = {};
    (config?.customFields ?? []).forEach(cf => {
      const key = `custom:${cf.id}`;
      if (visibleKeys.has(key) && formData[key] !== undefined) customFields[cf.id] = formData[key];
    });
    const payload: Record<string, any> = {
      fullName: formData.fullName,
      ...(show("phone") && (formData.phone || req("phone")) ? { phone: formData.phone } : {}),
      ...(show("email") && formData.email ? { email: formData.email } : {}),
      ...(show("dateOfBirth") && formData.dateOfBirth ? { dateOfBirth: formData.dateOfBirth } : {}),
      ...(show("parentName") && formData.parentName ? { parentName: formData.parentName } : {}),
      ...(show("parentPhone") && formData.parentPhone ? { parentPhone: formData.parentPhone } : {}),
      ...(show("customerSourceIds") && formData.customerSourceIds?.length ? { customerSourceIds: formData.customerSourceIds } : {}),
      ...(show("salesByIds") && formData.salesByIds?.length ? { salesByIds: formData.salesByIds } : {}),
      ...(show("note") && formData.note ? { note: formData.note } : {}),
      ...(Object.keys(customFields).length ? { customFields } : {}),
    };
    submitMutation.mutate(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Họ và tên — always required */}
      <FieldWrapper label="Họ và tên" required>
        <TextInput icon={<User className="h-4 w-4" />} placeholder="Nhập họ và tên"
          value={get("fullName")} onChange={e => set("fullName", (e.target as HTMLInputElement).value)} required />
      </FieldWrapper>

      {show("phone") && (
        <FieldWrapper label="Số điện thoại" required={req("phone")} optional={!req("phone")}>
          <TextInput icon={<Phone className="h-4 w-4" />} type="tel" placeholder="Số điện thoại liên hệ"
            value={get("phone")} onChange={e => set("phone", (e.target as HTMLInputElement).value)}
            required={req("phone")} />
        </FieldWrapper>
      )}

      {show("email") && (
        <FieldWrapper label="Email" required={req("email")} optional={!req("email")}>
          <TextInput icon={<Mail className="h-4 w-4" />} type="email" placeholder="Email của bạn"
            value={get("email")} onChange={e => set("email", (e.target as HTMLInputElement).value)}
            required={req("email")} />
        </FieldWrapper>
      )}

      {show("dateOfBirth") && (
        <FieldWrapper label="Ngày sinh" required={req("dateOfBirth")} optional={!req("dateOfBirth")}>
          <TextInput icon={<CalendarDays className="h-4 w-4" />} type="date"
            value={get("dateOfBirth")} onChange={e => set("dateOfBirth", (e.target as HTMLInputElement).value)}
            required={req("dateOfBirth")} />
        </FieldWrapper>
      )}

      {show("parentName") && (
        <FieldWrapper label="Họ tên phụ huynh" required={req("parentName")} optional={!req("parentName")}>
          <TextInput icon={<User className="h-4 w-4" />} placeholder="Họ tên phụ huynh"
            value={get("parentName")} onChange={e => set("parentName", (e.target as HTMLInputElement).value)}
            required={req("parentName")} />
        </FieldWrapper>
      )}

      {show("parentPhone") && (
        <FieldWrapper label="SĐT phụ huynh" required={req("parentPhone")} optional={!req("parentPhone")}>
          <TextInput icon={<Phone className="h-4 w-4" />} type="tel" placeholder="Số điện thoại phụ huynh"
            value={get("parentPhone")} onChange={e => set("parentPhone", (e.target as HTMLInputElement).value)}
            required={req("parentPhone")} />
        </FieldWrapper>
      )}

      {show("customerSourceIds") && (
        <FieldWrapper label="Nguồn khách hàng" required={req("customerSourceIds")} optional={!req("customerSourceIds")}>
          <SelectInput icon={<ChevronDown className="h-4 w-4" />}
            placeholder="Bạn biết đến chúng tôi qua..."
            value={get("customerSourceIds", [])[0] ?? ""}
            onChange={v => set("customerSourceIds", v ? [v] : [])}
            options={sources.map(s => ({ value: s.id, label: s.name }))} />
        </FieldWrapper>
      )}

      {show("salesByIds") && (
        <FieldWrapper label="Nhân viên tư vấn" required={req("salesByIds")} optional={!req("salesByIds")}>
          <SelectInput icon={<User className="h-4 w-4" />}
            placeholder="Chọn nhân viên tư vấn"
            value={get("salesByIds", [])[0] ?? ""}
            onChange={v => set("salesByIds", v ? [v] : [])}
            options={staffList.map(s => ({ value: s.id, label: s.fullName }))} />
        </FieldWrapper>
      )}

      {(config?.customFields ?? []).filter(cf => visibleKeys.has(`custom:${cf.id}`)).map(cf => (
        <FieldWrapper key={cf.id} label={cf.label}>
          {cf.fieldType === "textarea" ? (
            <TextareaInput icon={<MessageSquare className="h-4 w-4" />}
              placeholder={`Nhập ${cf.label.toLowerCase()}`}
              value={get(`custom:${cf.id}`)}
              onChange={e => set(`custom:${cf.id}`, (e.target as HTMLTextAreaElement).value)} />
          ) : cf.fieldType === "select" && cf.options?.length ? (
            <SelectInput icon={<ChevronDown className="h-4 w-4" />}
              placeholder={`Chọn ${cf.label.toLowerCase()}`}
              value={get(`custom:${cf.id}`)}
              onChange={v => set(`custom:${cf.id}`, v)}
              options={(cf.options ?? []).map(o => ({ value: o, label: o }))} />
          ) : (
            <TextInput icon={<BookOpen className="h-4 w-4" />}
              type={cf.fieldType === "number" ? "number" : cf.fieldType === "date" ? "date" : "text"}
              placeholder={`Nhập ${cf.label.toLowerCase()}`}
              value={get(`custom:${cf.id}`)}
              onChange={e => set(`custom:${cf.id}`, (e.target as HTMLInputElement).value)} />
          )}
        </FieldWrapper>
      ))}

      {show("note") && (
        <FieldWrapper label="Bạn muốn được tư vấn điều gì?">
          <TextareaInput icon={<MessageSquare className="h-4 w-4" />}
            placeholder="Nội dung cần tư vấn..."
            value={get("note")}
            onChange={e => set("note", (e.target as HTMLTextAreaElement).value)} />
        </FieldWrapper>
      )}

      {/* Consent */}
      <label className="flex items-start gap-2.5 cursor-pointer select-none" onClick={() => setConsent(c => !c)}>
        <div className={`mt-0.5 w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${consent ? "bg-blue-600 border-blue-600" : "bg-white border-gray-400"}`}>
          {consent && <Check className="w-2.5 h-2.5 text-white" />}
        </div>
        <span className="text-xs text-gray-500">
          Tôi đồng ý để trung tâm liên hệ tư vấn qua số điện thoại hoặc email.
        </span>
      </label>

      {submitMutation.error && (
        <p className="text-sm text-red-500">{(submitMutation.error as Error).message}</p>
      )}

      <button type="submit" disabled={submitMutation.isPending || !consent}
        className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-bold flex items-center justify-center gap-2 hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {submitMutation.isPending
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
        }
        ĐĂNG KÝ NGAY
      </button>
    </form>
  );
}

// ── Success screen ─────────────────────────────────────────────────────────────
function SuccessView({ onClose }: { onClose: () => void }) {
  return (
    <div className="py-8 flex flex-col items-center text-center gap-4">
      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
        <Check className="h-8 w-8 text-green-600" />
      </div>
      <div>
        <h3 className="text-lg font-bold text-gray-900">Đăng ký thành công!</h3>
        <p className="text-sm text-gray-500 mt-1">
          Cảm ơn bạn! Chúng tôi sẽ liên hệ sớm nhất để tư vấn.
        </p>
      </div>
      <button onClick={onClose}
        className="px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors">
        Đóng
      </button>
    </div>
  );
}

// ── Public Dialog ─────────────────────────────────────────────────────────────
export function RegistrationFormDialog({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [submitted, setSubmitted] = useState(false);

  const handleClose = () => { setSubmitted(false); onOpenChange(false); };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      {/* [&>button]:hidden hides the default Shadcn close button */}
      <DialogContent
        className="sm:max-w-lg w-full p-0 gap-0 rounded-2xl border-0 shadow-2xl overflow-hidden [&>button]:hidden"
      >
        {/* Custom header with gradient */}
        <div className="relative bg-gradient-to-br from-blue-600 to-indigo-600 px-6 pt-5 pb-4">
          <button
            onClick={handleClose}
            className="absolute right-4 top-4 w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
          >
            <X className="h-4 w-4 text-white" />
          </button>
          <div className="flex items-center gap-3 pr-8">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
              <GraduationCap className="h-5 w-5 text-white" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-white leading-tight">
                Đăng ký tư vấn khóa học
              </DialogTitle>
              <p className="text-xs text-blue-100 mt-0.5">
                Điền thông tin để được tư vấn miễn phí!
              </p>
            </div>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="px-6 py-5 max-h-[75vh] overflow-y-auto">
          {submitted
            ? <SuccessView onClose={handleClose} />
            : <RegistrationForm onSuccess={() => setSubmitted(true)} />
          }
        </div>
      </DialogContent>
    </Dialog>
  );
}
