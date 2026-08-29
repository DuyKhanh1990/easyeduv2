import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { GraduationCap, Phone, Mail, CalendarDays, User, MessageSquare, ChevronDown, BookOpen, Check, Loader2, MapPin } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────
interface FieldConfig { fieldKey: string; isVisible: boolean; isRequired: boolean }
interface CustomFieldDef {
  id: string; label: string;
  fieldType: "text" | "number" | "date" | "textarea" | "select";
  options?: string[] | null;
}
interface LocationOption { id: string; name: string; isMain: boolean }
interface FormConfig { fields: FieldConfig[]; customFields: CustomFieldDef[]; mainLocation: LocationOption | null; locations: LocationOption[] }
interface Source { id: string; name: string }
interface StaffMember { id: string; fullName: string }

// ── Fetch helpers ────────────────────────────────────────────────────────────
async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

// ── Reusable input wrapper ───────────────────────────────────────────────────
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
      <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">{icon}</div>
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
      <div className="absolute left-3 top-3 pointer-events-none">{icon}</div>
      <textarea
        {...props}
        rows={3}
        className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400 resize-none"
      />
    </div>
  );
}

function SelectInput({ icon, options, placeholder, value, onChange }: {
  icon: React.ReactNode;
  options: { value: string; label: string }[];
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10">{icon}</div>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full pl-9 pr-8 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none text-gray-700"
      >
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
        <ChevronDown className="h-4 w-4 text-gray-400" />
      </div>
    </div>
  );
}

function MultiSelectInput({ icon, options, placeholder, value, onChange }: {
  icon: React.ReactNode;
  options: { value: string; label: string }[];
  placeholder: string;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id]);
  };
  return (
    <div className="space-y-2">
      {options.length === 0 ? (
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">{icon}</div>
          <div className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-gray-50 text-gray-400">{placeholder}</div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {options.map(o => {
            const selected = value.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-all ${
                  selected
                    ? "bg-blue-600 border-blue-600 text-white"
                    : "bg-white border-gray-300 text-gray-700 hover:border-blue-400"
                }`}
              >
                {o.name ?? o.value}
                {selected && <Check className="inline h-3 w-3 ml-1" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function RegistrationFormPage() {
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [consent, setConsent] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const { data: config, isLoading: loadingConfig } = useQuery<FormConfig>({
    queryKey: ["/api/public/registration-form-config"],
    queryFn: () => fetchJson("/api/public/registration-form-config"),
  });
  const { data: sources = [] } = useQuery<Source[]>({
    queryKey: ["/api/public/registration-form/sources"],
    queryFn: () => fetchJson("/api/public/registration-form/sources"),
    enabled: !!config?.fields.find(f => f.fieldKey === "customerSourceIds" && f.isVisible),
  });
  const { data: staffList = [] } = useQuery<StaffMember[]>({
    queryKey: ["/api/public/registration-form/staff"],
    queryFn: () => fetchJson("/api/public/registration-form/staff"),
    enabled: !!config?.fields.find(f => f.fieldKey === "salesByIds" && f.isVisible),
  });

  const submitMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await fetch("/api/public/registration-form/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Đã xảy ra lỗi.");
      }
      return res.json();
    },
    onSuccess: () => setSubmitted(true),
  });

  const set = (key: string, value: any) => setFormData(prev => ({ ...prev, [key]: value }));
  const get = (key: string, fallback: any = "") => formData[key] ?? fallback;

  const visibleKeys = new Set((config?.fields ?? []).filter(f => f.isVisible).map(f => f.fieldKey));
  const requiredKeys = new Set((config?.fields ?? []).filter(f => f.isRequired).map(f => f.fieldKey));
  const show = (key: string) => visibleKeys.has(key);
  const req = (key: string) => requiredKeys.has(key);

  if (loadingConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 px-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <Check className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Đăng ký thành công!</h2>
          <p className="text-sm text-gray-500">
            Cảm ơn bạn đã đăng ký. Chúng tôi sẽ liên hệ với bạn sớm nhất có thể để tư vấn chi tiết.
          </p>
        </div>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    if (!formData.fullName?.trim()) {
      setValidationError("Vui lòng nhập họ và tên.");
      return;
    }
    // Validate required configurable fields
    if (req("locationId") && !formData.locationId) {
      setValidationError("Vui lòng chọn cơ sở.");
      return;
    }
    const SCALAR_REQUIRED_LABELS: Record<string, string> = {
      phone: "Số điện thoại",
      email: "Email",
      dateOfBirth: "Ngày sinh",
      parentName: "Họ tên phụ huynh",
      parentPhone: "Số điện thoại phụ huynh",
      note: "Ghi chú",
      address: "Địa chỉ",
    };
    for (const [key, label] of Object.entries(SCALAR_REQUIRED_LABELS)) {
      if (req(key) && !formData[key]?.toString().trim()) {
        setValidationError(`Vui lòng nhập ${label.toLowerCase()}.`);
        return;
      }
    }
    if (req("customerSourceIds") && !formData.customerSourceIds?.length) {
      setValidationError("Vui lòng chọn nguồn khách hàng.");
      return;
    }
    if (req("salesByIds") && !formData.salesByIds?.length) {
      setValidationError("Vui lòng chọn nhân viên tư vấn.");
      return;
    }
    // Validate required custom fields
    for (const cf of (config?.customFields ?? [])) {
      const key = `custom:${cf.id}`;
      if (req(key) && !formData[key]?.toString().trim()) {
        setValidationError(`Vui lòng nhập ${cf.label.toLowerCase()}.`);
        return;
      }
    }
    const customFields: Record<string, any> = {};
    (config?.customFields ?? []).forEach(cf => {
      const key = `custom:${cf.id}`;
      if (visibleKeys.has(key) && formData[key] !== undefined) {
        customFields[cf.id] = formData[key];
      }
    });
    const payload: Record<string, any> = {
      fullName: formData.fullName,
      ...(show("locationId") && formData.locationId ? { locationId: formData.locationId } : {}),
      ...(show("phone") && formData.phone ? { phone: formData.phone } : {}),
      ...(show("email") && formData.email ? { email: formData.email } : {}),
      ...(show("dateOfBirth") && formData.dateOfBirth ? { dateOfBirth: formData.dateOfBirth } : {}),
      ...(show("address") && formData.address ? { address: formData.address } : {}),
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 py-8 px-4">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          {/* Header */}
          <div className="relative bg-gradient-to-br from-blue-600 to-indigo-600 px-6 pt-6 pb-5">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                <GraduationCap className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-lg font-bold text-white leading-tight">
                  Đăng ký tư vấn khóa học
                </h1>
                <p className="text-sm text-blue-100 mt-0.5">
                  Điền thông tin để được tư vấn miễn phí và nhận ưu đãi hấp dẫn!
                </p>
              </div>
              <BookOpen className="h-10 w-10 text-white/30 flex-shrink-0" />
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            {/* Họ và tên — always shown */}
            <FieldWrapper label="Họ và tên" required>
              <TextInput
                icon={<User className="h-4 w-4 text-gray-400" />}
                placeholder="Nhập họ và tên của bạn"
                value={get("fullName")}
                onChange={e => set("fullName", e.target.value)}
                required
              />
            </FieldWrapper>

            {/* Cơ sở */}
            {show("locationId") && (
              <FieldWrapper label="Cơ sở" required={req("locationId")} optional={!req("locationId")}>
                <SelectInput
                  icon={<MapPin className="h-4 w-4 text-gray-400" />}
                  placeholder="Chọn cơ sở..."
                  value={get("locationId")}
                  onChange={v => set("locationId", v)}
                  options={(config?.locations ?? []).map(l => ({ value: l.id, label: l.name }))}
                />
              </FieldWrapper>
            )}

            {/* Phone */}
            {show("phone") && (
              <FieldWrapper label="Số điện thoại" required={req("phone")} optional={!req("phone")}>
                <TextInput
                  icon={<Phone className="h-4 w-4 text-gray-400" />}
                  type="tel"
                  placeholder="Nhập số điện thoại để được liên hệ"
                  value={get("phone")}
                  onChange={e => set("phone", e.target.value)}
                />
              </FieldWrapper>
            )}

            {/* Email */}
            {show("email") && (
              <FieldWrapper label="Email" required={req("email")} optional={!req("email")}>
                <TextInput
                  icon={<Mail className="h-4 w-4 text-gray-400" />}
                  type="email"
                  placeholder="Nhập email của bạn"
                  value={get("email")}
                  onChange={e => set("email", e.target.value)}
                />
              </FieldWrapper>
            )}

            {/* Date of birth */}
            {show("dateOfBirth") && (
              <FieldWrapper label="Ngày sinh" required={req("dateOfBirth")} optional={!req("dateOfBirth")}>
                <TextInput
                  icon={<CalendarDays className="h-4 w-4 text-gray-400" />}
                  type="date"
                  value={get("dateOfBirth")}
                  onChange={e => set("dateOfBirth", e.target.value)}
                />
              </FieldWrapper>
            )}

            {/* Address */}
            {show("address") && (
              <FieldWrapper label="Địa chỉ" required={req("address")} optional={!req("address")}>
                <TextInput
                  icon={<MapPin className="h-4 w-4 text-gray-400" />}
                  placeholder="Nhập địa chỉ của bạn"
                  value={get("address")}
                  onChange={e => set("address", e.target.value)}
                />
              </FieldWrapper>
            )}

            {/* Parent name */}
            {show("parentName") && (
              <FieldWrapper label="Họ tên phụ huynh" required={req("parentName")} optional={!req("parentName")}>
                <TextInput
                  icon={<User className="h-4 w-4 text-gray-400" />}
                  placeholder="Họ tên phụ huynh"
                  value={get("parentName")}
                  onChange={e => set("parentName", e.target.value)}
                />
              </FieldWrapper>
            )}

            {/* Parent phone */}
            {show("parentPhone") && (
              <FieldWrapper label="Số điện thoại phụ huynh" required={req("parentPhone")} optional={!req("parentPhone")}>
                <TextInput
                  icon={<Phone className="h-4 w-4 text-gray-400" />}
                  type="tel"
                  placeholder="Số điện thoại phụ huynh"
                  value={get("parentPhone")}
                  onChange={e => set("parentPhone", e.target.value)}
                />
              </FieldWrapper>
            )}

            {/* Customer source */}
            {show("customerSourceIds") && (
              <FieldWrapper label="Nguồn khách hàng" required={req("customerSourceIds")} optional={!req("customerSourceIds")}>
                <SelectInput
                  icon={<ChevronDown className="h-4 w-4 text-gray-400" />}
                  placeholder="Bạn biết đến chúng tôi qua..."
                  value={get("customerSourceIds", [])[0] ?? ""}
                  onChange={v => set("customerSourceIds", v ? [v] : [])}
                  options={sources.map(s => ({ value: s.id, label: s.name }))}
                />
              </FieldWrapper>
            )}

            {/* Sales staff */}
            {show("salesByIds") && (
              <FieldWrapper label="Nhân viên tư vấn" required={req("salesByIds")} optional={!req("salesByIds")}>
                <SelectInput
                  icon={<User className="h-4 w-4 text-gray-400" />}
                  placeholder="Chọn nhân viên tư vấn"
                  value={get("salesByIds", [])[0] ?? ""}
                  onChange={v => set("salesByIds", v ? [v] : [])}
                  options={staffList.map(s => ({ value: s.id, label: s.fullName }))}
                />
              </FieldWrapper>
            )}

            {/* Custom fields */}
            {(config?.customFields ?? [])
              .filter(cf => visibleKeys.has(`custom:${cf.id}`))
              .map(cf => (
                <FieldWrapper key={cf.id} label={cf.label} required={req(`custom:${cf.id}`)} optional={!req(`custom:${cf.id}`)}>
                  {cf.fieldType === "textarea" ? (
                    <TextareaInput
                      icon={<MessageSquare className="h-4 w-4 text-gray-400" />}
                      placeholder={`Nhập ${cf.label.toLowerCase()}`}
                      value={get(`custom:${cf.id}`)}
                      onChange={e => set(`custom:${cf.id}`, e.target.value)}
                    />
                  ) : cf.fieldType === "select" && cf.options?.length ? (
                    <SelectInput
                      icon={<ChevronDown className="h-4 w-4 text-gray-400" />}
                      placeholder={`Chọn ${cf.label.toLowerCase()}`}
                      value={get(`custom:${cf.id}`)}
                      onChange={v => set(`custom:${cf.id}`, v)}
                      options={(cf.options ?? []).map(o => ({ value: o, label: o }))}
                    />
                  ) : (
                    <TextInput
                      icon={<BookOpen className="h-4 w-4 text-gray-400" />}
                      type={cf.fieldType === "number" ? "number" : cf.fieldType === "date" ? "date" : "text"}
                      placeholder={`Nhập ${cf.label.toLowerCase()}`}
                      value={get(`custom:${cf.id}`)}
                      onChange={e => set(`custom:${cf.id}`, e.target.value)}
                    />
                  )}
                </FieldWrapper>
              ))}

            {/* Note */}
            {show("note") && (
              <FieldWrapper label="Bạn muốn được tư vấn điều gì?" required={req("note")} optional={!req("note")}>
                <TextareaInput
                  icon={<MessageSquare className="h-4 w-4 text-gray-400" />}
                  placeholder="Nhập nội dung bạn muốn được tư vấn..."
                  value={get("note")}
                  onChange={e => set("note", e.target.value)}
                />
              </FieldWrapper>
            )}

            {/* Consent */}
            <label className="flex items-start gap-2.5 cursor-pointer">
              <div
                className={`mt-0.5 w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                  consent ? "bg-blue-600 border-blue-600" : "bg-white border-gray-400"
                }`}
                onClick={() => setConsent(c => !c)}
              >
                {consent && <Check className="w-2.5 h-2.5 text-white" />}
              </div>
              <span className="text-xs text-gray-500 select-none" onClick={() => setConsent(c => !c)}>
                Tôi đồng ý để trung tâm liên hệ tư vấn qua số điện thoại hoặc email.
              </span>
            </label>

            {/* Validation / submit errors */}
            {(validationError || submitMutation.error) && (
              <p className="text-sm text-red-500">
                {validationError ?? (submitMutation.error as Error).message}
              </p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitMutation.isPending || !consent}
              className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
              ĐĂNG KÝ NGAY
            </button>

            <p className="text-xs text-center text-gray-400 flex items-center justify-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Thông tin của bạn được bảo mật tuyệt đối và chỉ phục vụ cho mục đích tư vấn.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

export default RegistrationFormPage;
