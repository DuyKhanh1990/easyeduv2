import { useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArrowLeft,
  Braces,
  Check,
  ChevronDown,
  CircleAlert,
  Copy,
  Eye,
  FilePlus2,
  Image,
  Info,
  Link2,
  LoaderCircle,
  Plus,
  QrCode,
  RefreshCw,
  Save,
  ShieldAlert,
  Text,
  Trash2,
  X,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ZBS_TEMPLATE_SYSTEM_VARIABLES } from "@shared/zbs-template-system-variables";
import { QRCodeSVG } from "qrcode.react";
import { ZbsTextBlockEditor } from "./ZbsTextBlockEditor";
import { ApprovedZbsTemplateCard, type ApprovedZbsTemplateSource } from "./ApprovedZbsTemplateCard";
import { ZbsLogoCropField } from "./ZbsLogoCropField";
import { richTextPreviewHtml } from "./zbs-rich-text";
import "./zbs-template-library.css";

type TextBlock = { type: "text"; text: string; style?: "plain" | "blueCard" };
type ImageBlock = {
  type: "image";
  source: "url" | "asset" | "systemVariable";
  url?: string;
  assetId?: string;
  variableKey?: "center_logo";
  alt?: string;
  compatibilityStatus: "unverified";
};
type ButtonBlock = { type: "button"; label: string; url: string; compatibilityStatus: "unverified" };
type QrBlock = { type: "qr"; value: string; caption?: string; compatibilityStatus: "unverified" };
type LibraryComponent = TextBlock | ImageBlock | ButtonBlock | QrBlock;
type LogoPairBlock = { type: "logoPair"; logoLightUrl: string | null; logoDarkUrl: string | null };
type Variable = {
  key: string;
  example: string;
  description?: string;
  systemField?: string;
  format?: "monthName" | "currencyVnd" | "dateVi" | "imageUrl";
};
type TemplateRecord = {
  id: string;
  code: string;
  name: string;
  notificationType: string;
  title: string;
  components: (LibraryComponent | LogoPairBlock)[];
  variables: Variable[];
  version: number;
  status: "draft" | "archived";
  compatibilityStatus: string;
  createdAt: string;
  updatedAt: string;
};
type TemplateInput = Omit<Pick<TemplateRecord, "code" | "name" | "notificationType" | "title" | "components" | "variables">, "components"> & {
  logoLightUrl?: string | null;
  logoDarkUrl?: string | null;
  components: LibraryComponent[];
};

const endpoint = "/api/settings/zbs-template-library";
const emptyForm = (): TemplateInput => ({
  code: "",
  name: "",
  notificationType: "",
  title: "",
  logoLightUrl: null,
  logoDarkUrl: null,
  components: [],
  variables: [],
});

const systemVariablesFor = (keys: string[]): Variable[] => ZBS_TEMPLATE_SYSTEM_VARIABLES
  .filter((variable) => keys.includes(variable.key))
  .map((variable) => ({
    key: variable.key,
    example: variable.example,
    description: variable.description,
    systemField: variable.source,
    ...("format" in variable ? { format: variable.format } : {}),
  }));

function normalizeTemplateVariableSyntax(value: string) {
  return value
    .replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g, "<$1>")
    .replace(/&lt;([a-zA-Z][a-zA-Z0-9_]*)&gt;/g, "<$1>");
}

const tuitionNoticeSample: TemplateInput = {
  code: "TUITION_DUE_MONTHLY",
  name: "Thông báo học phí tháng",
  notificationType: "tuition_due",
  title: "Thông báo học phí tháng <billing_month>",
  components: [
    {
      type: "image",
      source: "systemVariable",
      variableKey: "center_logo",
      alt: "Logo trung tâm",
      compatibilityStatus: "unverified",
    },
    {
      type: "text",
      text: "Kính gửi Quý phụ huynh học sinh <student_name>,\n\n• Học phí: <tuition_amount>\n• Đã thanh toán: <paid_amount>\n• Còn phải đóng: <remaining_amount>\n• Hạn thanh toán: <due_date>\n• Ghi chú: <invoice_note>\n\nKính mong Quý phụ huynh hoàn tất thanh toán đúng hạn.",
    },
    {
      type: "button",
      label: "Thanh toán học phí",
      url: "https://example.invalid/replace-with-payment-link",
      compatibilityStatus: "unverified",
    },
    {
      type: "button",
      label: "Liên hệ trung tâm",
      url: "https://example.invalid/replace-with-contact-link",
      compatibilityStatus: "unverified",
    },
  ],
  variables: systemVariablesFor(["center_logo", "student_name", "billing_month", "tuition_amount", "paid_amount", "remaining_amount", "due_date", "invoice_note"]),
};

const qrPaymentSample: TemplateInput = {
  code: "PAYMENT_QR_NOTICE",
  name: "Thông báo thanh toán kèm mã QR",
  notificationType: "tuition_due",
  title: "Thông tin thanh toán",
  components: [
    { type: "image", source: "systemVariable", variableKey: "center_logo", alt: "Logo trung tâm", compatibilityStatus: "unverified" },
    { type: "text", text: "Kính gửi Quý khách <student_name>,\n\nMã hóa đơn: <invoice_code>\nSố tiền thanh toán: <remaining_amount>\nTên ngân hàng nhận: <bank_name> hoặc Mã ngân hàng <bank_code>\nSố tài khoản: <account_number>\nTên chủ tài khoản: <account_name>\nGhi chú: <invoice_note>\n\nVui lòng quét mã QR bên dưới để thanh toán." },
    { type: "qr", value: "", caption: "Quét mã để thanh toán", compatibilityStatus: "unverified" },
  ],
  variables: systemVariablesFor(["center_logo", "student_name", "invoice_code", "remaining_amount", "bank_name", "bank_code", "account_number", "account_name", "invoice_note"]),
};

const debtReminderBeforeSample: TemplateInput = {
  code: "DEBT_REMINDER_BEFORE",
  name: "Nhắc hóa đơn sắp đến hạn",
  notificationType: "debt_reminder_before",
  title: "Hoá đơn sắp đến hạn",
  components: [{
    type: "text",
    text: "Hoá đơn <invoice_code>: <amount>. <days_label> đến hạn thanh toán <deadline>\n<invoice_description>",
  }],
  variables: systemVariablesFor(["invoice_code", "amount", "deadline", "days_label", "invoice_description"]),
};

const debtReminderDueTodaySample: TemplateInput = {
  code: "DEBT_REMINDER_DUE_TODAY",
  name: "Nhắc hóa đơn đến hạn hôm nay",
  notificationType: "debt_reminder_before",
  title: "Hoá đơn sắp đến hạn",
  components: [{
    type: "text",
    text: "Hoá đơn <invoice_code>: <amount>. Hôm nay là hạn thanh toán <deadline>\n<invoice_description>",
  }],
  variables: systemVariablesFor(["invoice_code", "amount", "deadline", "invoice_description"]),
};

const debtReminderOverdueSample: TemplateInput = {
  code: "DEBT_REMINDER_OVERDUE",
  name: "Nhắc hóa đơn quá hạn",
  notificationType: "debt_reminder_after",
  title: "Hoá đơn quá hạn",
  components: [{
    type: "text",
    text: "Hoá đơn <invoice_code>: <amount>. Hạn thanh toán <deadline> đã <days_label>\n<invoice_description>",
  }],
  variables: systemVariablesFor(["invoice_code", "amount", "deadline", "days_label", "invoice_description"]),
};

const ticketSample: TemplateInput = {
  code: "TRAVEL_TICKET_NOTICE",
  name: "Thông tin vé xe",
  notificationType: "travel_ticket",
  title: "",
  components: [
    { type: "image", source: "systemVariable", variableKey: "center_logo", alt: "Logo trung tâm", compatibilityStatus: "unverified" },
    {
      type: "text",
      text: "(Tin nhắn mẫu) THÔNG TIN VÉ XE KHÁCH\n\nQuý khách vui lòng có mặt tại điểm đi trước 30 phút.",
    },
    {
      type: "text",
      style: "blueCard",
      text: "Điểm đón\nZ06 VNG Campus, TP.HCM\n\nThời gian\n9:00, 1/1/2026\n\nMã đặt chỗ\n3798080800\n\nĐiểm đi                                      Điểm đến\n09:00             ···············             10:00\nThứ 2, 01/01/2026                   Thứ 3, 01/01/2026",
    },
    { type: "button", label: "Xem vé", url: "https://example.invalid/replace-with-ticket-link", compatibilityStatus: "unverified" },
    { type: "button", label: "Mua thêm vé", url: "https://example.invalid/replace-with-booking-link", compatibilityStatus: "unverified" },
  ],
  variables: systemVariablesFor(["center_logo"]),
};

async function getJson<T>(url: string): Promise<T> {
  const response = await apiRequest("GET", url);
  return response.json() as Promise<T>;
}

async function sendJson<T>(method: "POST" | "PUT" | "DELETE", url: string, body?: unknown): Promise<T> {
  const response = await apiRequest(method, url, body);
  return response.json() as Promise<T>;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Đã xảy ra lỗi không xác định.";
}

function dateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function asInput(record: TemplateRecord): TemplateInput {
  const logoPair = record.components.find((component): component is LogoPairBlock => component.type === "logoPair");
  const savedVariables = record.variables ?? [];
  const variables = record.code === "PAYMENT_QR_NOTICE"
    ? [
        ...savedVariables,
        ...qrPaymentSample.variables.filter((variable) => !savedVariables.some((saved) => saved.key === variable.key)),
      ]
    : savedVariables;
  return {
    code: record.code,
    name: record.name,
    notificationType: record.notificationType,
    title: normalizeTemplateVariableSyntax(record.title ?? ""),
    logoLightUrl: logoPair?.logoLightUrl ?? null,
    logoDarkUrl: logoPair?.logoDarkUrl ?? null,
    components: (record.components ?? []).filter((component): component is LibraryComponent => component.type !== "logoPair").map((component) => {
      if (component.type === "text") return { ...component, text: normalizeTemplateVariableSyntax(component.text) };
      if (component.type === "qr") return { ...component, value: normalizeTemplateVariableSyntax(component.value) };
      return component;
    }),
    variables,
  };
}

function toStoredInput(input: TemplateInput) {
  const components: (LibraryComponent | LogoPairBlock)[] = [...input.components];
  if (input.logoLightUrl || input.logoDarkUrl) {
    components.push({
      type: "logoPair",
      logoLightUrl: input.logoLightUrl ?? null,
      logoDarkUrl: input.logoDarkUrl ?? null,
    });
  }
  return { ...input, components };
}

function substitute(text: string, variables: Variable[]) {
  return text.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}|<([a-zA-Z][a-zA-Z0-9_]*)>/g, (match, doubleBraceKey: string | undefined, angleKey: string | undefined) => {
    const key = doubleBraceKey ?? angleKey ?? "";
    const variable = variables.find((item) => item.key === key);
    return variable ? variable.example || `[${key}]` : match;
  });
}

function ErrorNotice({ error, title = "Yêu cầu chưa hoàn tất" }: { error: unknown; title?: string }) {
  return (
    <Alert variant="destructive" className="border-rose-200 bg-rose-50 text-rose-950">
      <CircleAlert className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="mt-1 break-words">{errorMessage(error)}</AlertDescription>
    </Alert>
  );
}

function StatusPill({ archived }: { archived: boolean }) {
  return archived
    ? <Badge variant="outline" className="border-[#d9ddd8] bg-[#f0f2ee] text-[#747c75]">Đã lưu trữ</Badge>
    : <Badge variant="outline" className="border-[#ead7b9] bg-[#fff7e8] text-[#845a2e]">Bản nháp</Badge>;
}

export function ZbsTemplateLibrary() {
  const queryClient = useQueryClient();
  const { data: permissions, isLoading: permissionsLoading } = useMyPermissions();
  const providerPermission = permissions?.permissions["/settings#providers"];
  const canRead = !!permissions && !permissions.isStudent && (
    permissions.isSuperAdmin || providerPermission?.canView === true
    || providerPermission?.canViewAll === true || providerPermission?.canCreate === true
    || providerPermission?.canEdit === true
  );
  const canWrite = !!permissions && !permissions.isStudent && (
    permissions.isSuperAdmin || providerPermission?.canCreate === true || providerPermission?.canEdit === true
  );
  const canDelete = !!permissions && !permissions.isStudent && (
    permissions.isSuperAdmin || providerPermission?.canDelete === true
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<TemplateInput>(emptyForm);
  const [filter, setFilter] = useState<"active" | "archived">("active");
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateCode, setDuplicateCode] = useState("");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [variablePickerOpen, setVariablePickerOpen] = useState(false);
  const [variableInsertionTarget, setVariableInsertionTarget] = useState<{ componentIndex: number } | null>(null);
  const textEditorsRef = useRef(new Map<number, Editor>());

  const mainLocationQuery = useQuery({
    queryKey: ["/api/public/main-location"],
    queryFn: () => getJson<{ logoUrl?: string | null } | null>("/api/public/main-location"),
  });
  const centerLogoUrl = mainLocationQuery.data?.logoUrl ?? "";

  const listQuery = useQuery({
    queryKey: [endpoint],
    queryFn: () => getJson<TemplateRecord[]>(endpoint),
    enabled: canRead,
  });
  const approvedSourcesQuery = useQuery({
    queryKey: [endpoint, "approved-sources"],
    queryFn: () => getJson<ApprovedZbsTemplateSource[]>(`${endpoint}/approved-sources`),
    enabled: canRead,
  });
  const detailQuery = useQuery({
    queryKey: [endpoint, selectedId],
    queryFn: () => getJson<TemplateRecord>(`${endpoint}/${encodeURIComponent(selectedId!)}`),
    enabled: Boolean(selectedId) && canRead,
  });
  const selected = useMemo(
    () => (listQuery.data ?? []).find((record) => record.id === selectedId),
    [listQuery.data, selectedId],
  );

  useEffect(() => {
    if (detailQuery.data && detailQuery.data.id === selectedId && !creating) {
      setForm(asInput(detailQuery.data));
    }
  }, [detailQuery.data, selectedId, creating]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (selectedId) return sendJson<TemplateRecord>("PUT", `${endpoint}/${encodeURIComponent(selectedId)}`, toStoredInput(form));
      return sendJson<TemplateRecord>("POST", endpoint, toStoredInput(form));
    },
    onSuccess: async (record) => {
      setSelectedId(record.id);
      setCreating(false);
      setForm(asInput(record));
      setNotice("Bản nháp đã được lưu vào thư viện trung tâm.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [endpoint] }),
        queryClient.invalidateQueries({ queryKey: [endpoint, record.id] }),
      ]);
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: () => sendJson<TemplateRecord>("POST", `${endpoint}/${encodeURIComponent(selectedId!)}/duplicate`, { code: duplicateCode.trim() }),
    onSuccess: async (record) => {
      setDuplicateOpen(false);
      setDuplicateCode("");
      setCreating(false);
      setSelectedId(record.id);
      setForm(asInput(record));
      setFilter("active");
      setNotice("Đã tạo một bản sao độc lập ở trạng thái bản nháp.");
      await queryClient.invalidateQueries({ queryKey: [endpoint] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => sendJson<TemplateRecord>("DELETE", `${endpoint}/${encodeURIComponent(selectedId!)}`),
    onSuccess: async () => {
      setArchiveOpen(false);
      setNotice("Mẫu đã được chuyển vào lưu trữ; dữ liệu không bị xóa vĩnh viễn.");
      await queryClient.invalidateQueries({ queryKey: [endpoint] });
      await queryClient.invalidateQueries({ queryKey: [endpoint, selectedId] });
      setFilter("archived");
    },
  });

  const records = (listQuery.data ?? []).filter((record) => filter === "archived" ? record.status === "archived" : record.status !== "archived");
  const isArchived = selected?.status === "archived";
  const canSave = canWrite && Boolean(form.code.trim() && form.name.trim() && form.notificationType.trim()) && !saveMutation.isPending && !isArchived;

  const startNew = () => {
    setCreating(true);
    setSelectedId(null);
    setForm(emptyForm());
    setNotice("");
    saveMutation.reset();
    duplicateMutation.reset();
    archiveMutation.reset();
  };
  const startTuitionSample = () => {
    startNew();
    setForm(structuredClone(tuitionNoticeSample));
    setNotice("Đã nạp khung học phí với logo trung tâm. Thay URL example.invalid trong các nút bằng liên kết thật trước khi sử dụng.");
  };
  const startQrPaymentSample = () => {
    startNew();
    setForm(structuredClone(qrPaymentSample));
    setNotice("Đã nạp khung thanh toán QR. Nhập nội dung QR để xem mã trong bản xem trước.");
  };
  const startTicketSample = () => {
    startNew();
    setForm(structuredClone(ticketSample));
    setNotice("Đã nạp khung thông tin vé xe. Thay các URL example.invalid bằng liên kết thật trước khi lưu.");
  };
  const startDebtReminderSample = (sample: TemplateInput) => {
    startNew();
    setForm(structuredClone(sample));
    setNotice("Đã nạp khung nhắc công nợ. Kiểm tra lại nội dung và các biến trước khi lưu bản nháp.");
  };
  const selectRecord = (record: TemplateRecord) => {
    setCreating(false);
    setSelectedId(record.id);
    setNotice("");
    saveMutation.reset();
  };
  const updateField = <K extends keyof TemplateInput>(key: K, value: TemplateInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setNotice("");
  };
  const updateComponent = (index: number, updated: LibraryComponent) => {
    setForm((current) => ({
      ...current,
      components: current.components.map((component, position) => position === index ? updated : component),
    }));
    setNotice("");
  };
  const openVariablePicker = (componentIndex: number) => {
    setVariableInsertionTarget({ componentIndex });
    setVariablePickerOpen(true);
  };
  const insertSystemVariable = (preset: typeof ZBS_TEMPLATE_SYSTEM_VARIABLES[number]) => {
    if (!variableInsertionTarget) return;
    const { componentIndex } = variableInsertionTarget;
    const component = form.components[componentIndex];
    if (!component || component.type !== "text") return;

    const token = "token" in preset ? preset.token : `<${preset.key}>`;
    const editor = textEditorsRef.current.get(componentIndex);
    if (!editor) return;
    editor.chain().focus().insertContent({ type: "text", text: token }).run();

    const variable: Variable = {
      key: preset.key,
      example: preset.example,
      description: preset.description,
      systemField: preset.source,
      ...("format" in preset ? { format: preset.format } : {}),
    };
    const existingIndex = form.variables.findIndex((item) => item.key === preset.key);
    updateField("variables", existingIndex < 0
      ? [...form.variables, variable]
      : form.variables.map((item, index) => index === existingIndex ? variable : item));

    setVariablePickerOpen(false);
    setNotice("");
  };
  const addComponent = (type: LibraryComponent["type"]) => {
    const block: LibraryComponent = type === "text"
      ? { type, text: "" }
      : type === "image"
        ? { type, source: "url", url: "", alt: "", compatibilityStatus: "unverified" }
      : type === "button"
          ? { type, label: "", url: "", compatibilityStatus: "unverified" }
          : { type, value: "", caption: "", compatibilityStatus: "unverified" };
    updateField("components", [...form.components, block]);
  };
  return (
    <section className="zbs-library space-y-5" aria-label="Thư viện mẫu ZBS nội bộ">
      <header className="relative overflow-hidden rounded-xl border border-[#c9d8d0] bg-[#edf4ef] px-5 py-5 sm:px-6">
        <div className="absolute -right-10 -top-16 h-44 w-44 rounded-full border-[22px] border-[#dce9e0]" aria-hidden="true" />
        <div className="relative flex min-w-0 flex-col gap-4">
          <div className="min-w-0 max-w-3xl">
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#527268]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#b5783e]" /> EasyEdu / Zalo Business Solution
            </div>
            <h2 className="font-[var(--font-display)] text-xl font-semibold tracking-tight text-[#203c34] sm:text-2xl">Thư viện mẫu nội bộ</h2>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[#536c63]">
              Không gian soạn thảo theo trung tâm để lưu, xem trước và sao chép nội dung nháp. Tách biệt hoàn toàn với ánh xạ mẫu ZBS.
            </p>
          </div>
          {canWrite && <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="border-[#a9c0b1] text-[#315f4e] hover:bg-white">
                  <FilePlus2 className="mr-2 h-4 w-4" />
                  Mẫu ZBS
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-72 border-[#d9e2dd] bg-[#fffefa]">
                <DropdownMenuLabel className="text-xs text-[#718078]">Chọn mẫu có sẵn</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={startTuitionSample}>Thông báo học phí tháng</DropdownMenuItem>
                <DropdownMenuItem onSelect={startQrPaymentSample}>Thông báo thanh toán kèm mã QR</DropdownMenuItem>
                <DropdownMenuItem onSelect={startTicketSample}>Thông tin vé xe</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => startDebtReminderSample(debtReminderBeforeSample)}>Nhắc hóa đơn sắp đến hạn</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => startDebtReminderSample(debtReminderDueTodaySample)}>Nhắc hóa đơn đến hạn hôm nay</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => startDebtReminderSample(debtReminderOverdueSample)}>Nhắc hóa đơn quá hạn</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={startNew} className="bg-[#315f4e] text-white hover:bg-[#264d3e]">
              <FilePlus2 className="mr-2 h-4 w-4" /> Tạo mẫu mới
            </Button>
          </div>}
        </div>
      </header>

      {permissionsLoading && <div className="rounded-lg border border-[#dbe4dd] bg-[#f8faf7] p-4 text-sm text-[#718078]">Đang kiểm tra quyền truy cập thư viện…</div>}
      {!permissionsLoading && !canRead && <Alert variant="destructive"><CircleAlert className="h-4 w-4" /><AlertTitle>Không có quyền truy cập</AlertTitle><AlertDescription>Bạn không có quyền xem Thư viện mẫu ZBS.</AlertDescription></Alert>}

      <Alert className="border-amber-300 bg-[#fff8e9] text-[#64431b] [&>svg]:text-[#a86c27]">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle className="font-semibold">Chỉ lưu dữ liệu nháp nội bộ</AlertTitle>
        <AlertDescription className="mt-1 leading-5 text-[#765a35]">
          Bản xem trước và cấu trúc ảnh/nút là <strong>chưa xác minh</strong>, không khẳng định Zalo hỗ trợ cho mọi mẫu. Khu vực này không gọi Zalo, không gửi tin và không thay đổi ánh xạ hay NotificationService.
        </AlertDescription>
      </Alert>

      {canRead && approvedSourcesQuery.data?.map((source) => (
        <ApprovedZbsTemplateCard key={source.template.brandTemplateId} source={source} />
      ))}
      {canRead && approvedSourcesQuery.error && <ErrorNotice error={approvedSourcesQuery.error} title="Không thể tải mẫu chuẩn" />}

      {notice && <div role="status" className="flex items-start gap-2 rounded-lg border border-[#c8dfd0] bg-[#eff8f2] px-3 py-2.5 text-xs leading-5 text-[#38644b]"><Check className="mt-0.5 h-4 w-4 shrink-0" />{notice}</div>}

      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(255px,0.72fr)_minmax(0,1.7fr)]">
        <Card className="min-w-0 overflow-hidden border-[#d9e2dd] shadow-[0_2px_12px_rgba(30,58,47,0.035)]">
          <CardHeader className="border-b border-[#e8eeeb] px-4 py-3.5 sm:px-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-sm text-[#263e36]">Mẫu của trung tâm</CardTitle>
                <p className="mt-1 text-xs text-[#78877f]">{listQuery.data?.length ?? "—"} mục · sắp xếp theo lần cập nhật</p>
              </div>
              <Button variant="ghost" size="icon" aria-label="Tải lại danh sách" onClick={() => listQuery.refetch()} className="h-8 w-8 text-[#62776c]">
                <RefreshCw className={`h-4 w-4 ${listQuery.isFetching ? "animate-spin" : ""}`} />
              </Button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-[#f0f4f0] p-1">
              <button type="button" onClick={() => setFilter("active")} className={`rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${filter === "active" ? "bg-white text-[#315f4e] shadow-sm" : "text-[#728078] hover:text-[#315f4e]"}`}>Bản nháp</button>
              <button type="button" onClick={() => setFilter("archived")} className={`rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${filter === "archived" ? "bg-white text-[#315f4e] shadow-sm" : "text-[#728078] hover:text-[#315f4e]"}`}>Lưu trữ</button>
            </div>
          </CardHeader>
          <CardContent className="zl-scrollbar max-h-[680px] overflow-y-auto p-2">
            {listQuery.isLoading ? (
              <div className="space-y-2 p-2" aria-label="Đang tải mẫu">{[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-[72px] rounded-lg bg-[#edf2ee]" />)}</div>
            ) : listQuery.error ? (
              <div className="p-2"><ErrorNotice error={listQuery.error} title="Không thể tải thư viện" /><Button variant="outline" size="sm" onClick={() => listQuery.refetch()} className="mt-3"><RefreshCw className="mr-2 h-3.5 w-3.5" />Thử lại</Button></div>
            ) : records.length === 0 ? (
              <div className="flex flex-col items-center px-5 py-10 text-center">
                <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#eef3ef] text-[#6c8377]"><Braces className="h-5 w-5" /></span>
                <p className="text-sm font-semibold text-[#43594f]">{filter === "archived" ? "Chưa có mẫu lưu trữ" : "Thư viện còn trống"}</p>
                <p className="mt-1 max-w-[220px] text-xs leading-5 text-[#78877f]">{filter === "archived" ? "Các mẫu được lưu trữ sẽ xuất hiện tại đây." : "Tạo bản nháp đầu tiên để bắt đầu biên soạn nội dung dùng lại."}</p>
                {filter === "active" && <Button variant="outline" size="sm" onClick={startNew} className="mt-4 border-[#cddbd2] text-[#315f4e]"><Plus className="mr-1.5 h-3.5 w-3.5" />Tạo mẫu</Button>}
              </div>
            ) : (
              <div className="space-y-1">
                {records.map((record) => (
                  <button type="button" key={record.id} onClick={() => selectRecord(record)} className={`zl-enter w-full rounded-lg border px-3 py-3 text-left transition-colors ${record.id === selectedId ? "border-[#9db9a8] bg-[#f0f6f1]" : "border-transparent hover:border-[#e0e8e2] hover:bg-[#f8faf7]"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 truncate text-sm font-semibold text-[#2f493e]">{record.name}</span>
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#d0a25e]" />
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-[#76857d]">
                      <code className="zl-mono text-[#557064]">{record.code}</code><span>·</span><span>{record.notificationType}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <StatusPill archived={record.status === "archived"} />
                      <span className="text-[10px] text-[#8a968f]">v{record.version}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-4">
          {!creating && !selectedId ? (
            <Card className="flex min-h-[360px] flex-col items-center justify-center border-dashed border-[#cbd8d0] bg-[#f8faf7] p-7 text-center">
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e9f0ea] text-[#527365]"><Text className="h-5 w-5" /></span>
              <h3 className="text-base font-semibold text-[#31493e]">Chọn mẫu để biên tập</h3>
              <p className="mt-1 max-w-sm text-sm leading-6 text-[#74827a]">Hoặc tạo một mẫu nháp mới. Mọi nội dung được lưu riêng trong thư viện nội bộ của trung tâm.</p>
              <Button onClick={startNew} className="mt-5 bg-[#315f4e] text-white hover:bg-[#264d3e]"><Plus className="mr-2 h-4 w-4" />Tạo mẫu mới</Button>
            </Card>
          ) : (
            <>
              {detailQuery.isLoading && !creating && <Card className="space-y-4 border-[#d9e2dd] p-5"><Skeleton className="h-7 w-1/3" /><Skeleton className="h-10 w-full" /><Skeleton className="h-28 w-full" /></Card>}
              {detailQuery.error && !creating && <ErrorNotice error={detailQuery.error} title="Không thể tải mẫu" />}
              {(creating || (selectedId && detailQuery.data && !detailQuery.isLoading)) && (
                <div className="zl-enter space-y-4">
                  <Card className="border-[#d9e2dd] shadow-[0_2px_12px_rgba(30,58,47,0.035)]">
                    <CardHeader className="border-b border-[#e8eeeb] px-4 py-3.5 sm:px-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                          <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-[#e5efe9] text-[#41675b]"><Braces className="h-4 w-4" /></span>
                          <div>
                            <CardTitle className="text-sm text-[#263e36]">Thông tin mẫu</CardTitle>
                            <p className="mt-1 text-xs text-[#7b8881]">{creating ? "Mẫu mới · bản nháp nội bộ" : `${form.name || "Mẫu chưa đặt tên"} · cập nhật ${dateLabel(selected?.updatedAt ?? "")}`}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {!creating && selected && <StatusPill archived={selected.status === "archived"} />}
                          {!creating && selected && <Badge variant="outline" className="border-[#dbe3dd] bg-[#f8faf7] text-[10px] text-[#65756c]">Tương thích: chưa xác minh</Badge>}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-5 px-4 py-4 sm:px-5">
                      {isArchived && <div className="rounded-md border border-[#e2e1d9] bg-[#f5f5f0] px-3 py-2 text-xs leading-5 text-[#74796f]">Mẫu đã lưu trữ — chỉ xem được, không thể sửa hoặc lưu đè.</div>}
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5"><Label htmlFor="zl-name">Tên mẫu <span className="text-[#a86c4b]">*</span></Label><Input id="zl-name" value={form.name} disabled={isArchived} onChange={(event) => updateField("name", event.target.value)} placeholder="Ví dụ: Nhắc lịch học ngày mai" className="border-[#d4ded7] bg-[#fffefa]" /></div>
                        <div className="space-y-1.5"><Label htmlFor="zl-code">Mã nội bộ <span className="text-[#a86c4b]">*</span></Label><Input id="zl-code" value={form.code} disabled={isArchived} onChange={(event) => updateField("code", event.target.value)} placeholder="CLASS_REMINDER" className="zl-mono border-[#d4ded7] bg-[#fffefa]" /></div>
                        <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="zl-type">Loại thông báo nội bộ <span className="text-[#a86c4b]">*</span></Label><Input id="zl-type" value={form.notificationType} disabled={isArchived} onChange={(event) => updateField("notificationType", event.target.value)} placeholder="Mã loại thông báo nội bộ" className="border-[#d4ded7] bg-[#fffefa]" /><p className="text-[10px] text-[#89938d]">Đây là định danh nội bộ, không phải lựa chọn hay liên kết tới mẫu Zalo.</p></div>
                        <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="zl-title">Tiêu đề</Label><Input id="zl-title" value={form.title} disabled={isArchived} onChange={(event) => updateField("title", event.target.value)} placeholder="Tiêu đề hiển thị trong bản xem trước" className="border-[#d4ded7] bg-[#fffefa]" /></div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-[#d9e2dd] shadow-[0_2px_12px_rgba(30,58,47,0.035)]">
                    <CardHeader className="border-b border-[#e8eeeb] px-4 py-3.5 sm:px-5">
                      <CardTitle className="text-sm text-[#263e36]">Logo mẫu ZBS</CardTitle>
                      <p className="mt-1 text-xs leading-5 text-[#78877f]">
                        Tải logo giao diện sáng và tối. Có thể căn chỉnh, phóng to/thu nhỏ và cắt trong khung 400 × 96 px; ảnh được lưu thành PNG.
                      </p>
                    </CardHeader>
                    <CardContent className="grid gap-6 px-4 py-4 md:grid-cols-2 sm:px-5">
                      <ZbsLogoCropField
                        label="Logo giao diện sáng"
                        theme="light"
                        value={form.logoLightUrl}
                        disabled={isArchived || !canWrite}
                        onChange={(url) => updateField("logoLightUrl", url)}
                      />
                      <ZbsLogoCropField
                        label="Logo giao diện tối"
                        theme="dark"
                        value={form.logoDarkUrl}
                        disabled={isArchived || !canWrite}
                        onChange={(url) => updateField("logoDarkUrl", url)}
                      />
                    </CardContent>
                  </Card>

                  <Card className="border-[#d9e2dd] shadow-[0_2px_12px_rgba(30,58,47,0.035)]">
                    <CardHeader className="border-b border-[#e8eeeb] px-4 py-3 sm:px-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div><CardTitle className="text-sm text-[#263e36]">Nội dung</CardTitle><p className="mt-1 text-xs text-[#78877f]">Văn bản, biến, ảnh và QR · bản nháp nội bộ</p></div>
                        <div className="flex flex-wrap gap-1.5">
                          <Button type="button" variant="outline" size="sm" disabled={isArchived} onClick={() => addComponent("text")} className="h-8 border-[#d5e0d7] text-[#426353]"><Text className="mr-1.5 h-3.5 w-3.5" />Văn bản</Button>
                          <Button type="button" variant="outline" size="sm" disabled={isArchived} onClick={() => addComponent("image")} className="h-8 border-[#d5e0d7] text-[#426353]"><Image className="mr-1.5 h-3.5 w-3.5" />Ảnh</Button>
                          <Button type="button" variant="outline" size="sm" disabled={isArchived} onClick={() => addComponent("qr")} className="h-8 border-[#d5e0d7] text-[#426353]"><QrCode className="mr-1.5 h-3.5 w-3.5" />Mã QR</Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 px-4 py-4 sm:px-5">
                      <div className="flex items-start gap-2 rounded-md border border-[#eadfca] bg-[#fffaf0] px-3 py-2 text-[11px] leading-5 text-[#725e3f]"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />Ảnh và nút chỉ là cấu trúc dữ liệu nháp chưa xác minh; không đồng nghĩa Zalo hỗ trợ chúng cho mọi loại mẫu.</div>
                      {form.components.every((component) => component.type === "button") && <div className="rounded-lg border border-dashed border-[#d4ded8] bg-[#fafbf8] px-4 py-7 text-center text-xs leading-5 text-[#829087]">Chưa có nội dung. Thêm văn bản, ảnh hoặc mã QR để dựng bản nháp.</div>}
                      {form.components.map((component, index) => component.type === "button" ? null : (
                        <div key={`${component.type}-${index}`} className="rounded-lg border border-[#e0e7e1] bg-[#fbfcf9] p-3 sm:p-4">
                          <div className="mb-3 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-xs font-semibold text-[#476153]">
                              {component.type === "text" ? <Text className="h-3.5 w-3.5" /> : component.type === "image" ? <Image className="h-3.5 w-3.5" /> : component.type === "qr" ? <QrCode className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
                              {component.type === "text" ? "Khối văn bản" : component.type === "image" ? "Khối ảnh · chưa xác minh" : component.type === "qr" ? "Mã QR · chưa xác minh" : "Khối nút · chưa xác minh"}
                            </div>
                            <div className="flex items-center gap-1">
                              {component.type === "text" && !isArchived && <Button type="button" variant="outline" size="sm" onMouseDown={(event) => event.preventDefault()} onClick={() => openVariablePicker(index)} className="h-7 border-[#d5e0d7] px-2 text-[11px] text-[#426353]"><Braces className="mr-1.5 h-3.5 w-3.5" />Chèn biến</Button>}
                              {!isArchived && <Button type="button" variant="ghost" size="icon" aria-label="Xóa khối" onClick={() => updateField("components", form.components.filter((_, position) => position !== index))} className="h-7 w-7 text-[#9b6257] hover:bg-[#fff0ed] hover:text-[#8b4439]"><Trash2 className="h-3.5 w-3.5" /></Button>}
                            </div>
                          </div>
                          {component.type === "text" && (
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <label className="flex items-center gap-2 text-[11px] text-[#718078]">
                                  Kiểu hiển thị
                                  <select disabled={isArchived} aria-label="Kiểu hiển thị khối văn bản" value={component.style ?? "plain"} onChange={(event) => updateComponent(index, { ...component, style: event.target.value as TextBlock["style"] })} className="h-7 rounded-md border border-[#d8e1da] bg-white px-2 text-[11px] text-[#40564a]">
                                    <option value="plain">Văn bản thường</option>
                                    <option value="blueCard">Khung xanh nhạt</option>
                                  </select>
                                </label>
                              </div>
                              <ZbsTextBlockEditor
                                value={component.text}
                                disabled={isArchived}
                                onChange={(text) => updateComponent(index, { ...component, text })}
                                onEditorReady={(editor) => {
                                  if (editor) textEditorsRef.current.set(index, editor);
                                  else textEditorsRef.current.delete(index);
                                }}
                              />
                            </div>
                          )}
                          {component.type === "image" && (
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="space-y-1.5"><Label className="text-xs">Nguồn ảnh</Label><select disabled={isArchived} value={component.source} onChange={(event) => { const source = event.target.value as ImageBlock["source"]; updateComponent(index, { ...component, source, url: "", assetId: "", variableKey: source === "systemVariable" ? "center_logo" : undefined }); }} className="h-10 w-full rounded-md border border-[#d8e1da] bg-white px-3 text-sm"><option value="url">URL ảnh</option><option value="asset">Mã tài nguyên</option><option value="systemVariable">Logo trung tâm tự động</option></select></div>
                              <div className="space-y-1.5"><Label className="text-xs">{component.source === "url" ? "URL ảnh" : component.source === "asset" ? "Mã tài nguyên" : "Biến hệ thống"}</Label>{component.source === "systemVariable" ? <div className="flex h-10 items-center rounded-md border border-[#d8e1da] bg-[#f4f7f3] px-3 text-sm text-[#496555]">{"<center_logo>"} · lấy từ cơ sở chính</div> : <Input disabled={isArchived} value={component.source === "url" ? component.url ?? "" : component.assetId ?? ""} onChange={(event) => updateComponent(index, component.source === "url" ? { ...component, url: event.target.value } : { ...component, assetId: event.target.value })} placeholder={component.source === "url" ? "https://…" : "asset-id"} className="border-[#d8e1da] bg-white" />}</div>
                              <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs">Mô tả thay thế</Label><Input disabled={isArchived} value={component.alt ?? ""} onChange={(event) => updateComponent(index, { ...component, alt: event.target.value })} placeholder="Mô tả ngắn cho ảnh" className="border-[#d8e1da] bg-white" /></div>
                              <p className="sm:col-span-2 text-[10px] text-[#8a785a]">compatibilityStatus: unverified</p>
                            </div>
                          )}
                          {component.type === "qr" && (
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs">Nội dung để mã hóa thành QR</Label><Textarea disabled={isArchived} value={component.value} onChange={(event) => updateComponent(index, { ...component, value: normalizeTemplateVariableSyntax(event.target.value) })} placeholder="Dán nội dung thanh toán hoặc URL để tạo mã QR xem trước" className="min-h-20 border-[#d8e1da] bg-white text-sm" /></div>
                              <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs">Chú thích</Label><Input disabled={isArchived} value={component.caption ?? ""} onChange={(event) => updateComponent(index, { ...component, caption: event.target.value })} placeholder="Ví dụ: Quét mã để thanh toán" className="border-[#d8e1da] bg-white" /></div>
                              <p className="sm:col-span-2 text-[10px] text-[#8a785a]">QR được dựng cục bộ để xem trước; chưa xác minh cách gửi khối QR qua ZBS.</p>
                            </div>
                          )}
                        </div>
                      ))}
                      <div className="overflow-hidden rounded-lg border border-[#d9e2dd] bg-white">
                        <div className="border-b border-[#e8eeeb] bg-[#f8faf7] px-4 py-3">
                          <div className="flex items-center gap-2"><Eye className="h-4 w-4 text-[#527365]" /><div><h3 className="text-sm font-semibold text-[#263e36]">Xem trước nội dung</h3><p className="mt-1 text-xs text-[#78877f]">Ví dụ nội bộ · chưa xác minh tương thích</p></div></div>
                        </div>
                        <div className="p-4">
                          <div className="mx-auto max-w-md rounded-xl border border-[#e0e4dc] bg-[#fffefa] p-4 shadow-[0_3px_12px_rgba(34,54,43,0.05)]">
                            <div className="mb-3 flex items-center justify-between border-b border-[#edf0e9] pb-2 text-[10px] uppercase tracking-[0.13em] text-[#89938a]"><span>Preview · nội bộ</span><span>Không gửi</span></div>
                            {form.title && <h4 className="mb-3 text-sm font-semibold text-[#304b3e]">{substitute(form.title, form.variables)}</h4>}
                            {form.components.every((component) => component.type === "button") && !form.title && <p className="text-xs italic text-[#929a91]">Nội dung xem trước sẽ xuất hiện tại đây.</p>}
                            <div className="space-y-3">
                              {form.components.map((component, index) => component.type === "button" ? null : component.type === "text" ? (
                                component.style === "blueCard"
                                  ? <div key={index} className="rounded-lg border border-[#d6e7f1] bg-[#eff8fc] p-3 text-sm leading-6 text-[#4c5a50]"><div className="zbs-rich-preview" dangerouslySetInnerHTML={{ __html: richTextPreviewHtml(component.text, form.variables) }} /></div>
                                  : <div key={index} className="zbs-rich-preview text-sm leading-6 text-[#4c5a50]" dangerouslySetInnerHTML={{ __html: richTextPreviewHtml(component.text, form.variables) }} />
                              ) : component.type === "image" ? (
                                component.source === "systemVariable" && centerLogoUrl
                                  ? <div key={index} className="flex justify-center"><img src={centerLogoUrl} alt={component.alt || "Logo trung tâm"} className="max-h-16 max-w-40 object-contain" /></div>
                                  : component.source === "url" && component.url
                                    ? <div key={index} className="flex justify-center"><img src={component.url} alt={component.alt || "Ảnh mẫu"} className="max-h-48 max-w-full rounded object-contain" /></div>
                                  : <div key={index} className="flex min-h-16 items-center justify-center rounded-lg border border-dashed border-[#d6ddd5] bg-[#f5f7f3] px-3 text-center text-xs text-[#7c897f]"><Image className="mr-2 h-4 w-4" />Ảnh · cấu trúc nháp chưa xác minh</div>
                              ) : (
                                <div key={index} className="flex flex-col items-center gap-2 rounded-xl border border-[#e0e4dc] bg-[#f8f7f2] p-4">
                                  {component.value.trim() ? <div className="rounded-lg bg-white p-2"><QRCodeSVG value={component.value} size={164} level="M" includeMargin /></div> : <div className="flex h-44 w-44 items-center justify-center rounded-lg border border-dashed border-[#cdd8cf] bg-white text-center text-xs text-[#7c897f]"><QrCode className="mr-2 h-5 w-5" />Nhập nội dung QR để xem mã</div>}
                                  {component.caption && <p className="text-center text-xs text-[#53685b]">{component.caption}</p>}
                                </div>
                              ))}
                            </div>
                            {form.components.filter((component) => component.type === "button").map((button, index) => button.type === "button" ? (
                              <div key={`preview-button-${index}`} className="mt-3 rounded-md bg-[#315f4e] px-3 py-2 text-center text-xs font-semibold text-white">{button.label || "Nút chưa đặt tên"}</div>
                            ) : null)}
                            <p className="mt-4 border-t border-[#edf0e9] pt-2 text-[10px] leading-4 text-[#9a8b6d]">Mô phỏng dữ liệu nội bộ, không phải bản render hoặc xác nhận từ Zalo.</p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-[#d9e2dd] shadow-[0_2px_12px_rgba(30,58,47,0.035)]">
                    <CardHeader className="border-b border-[#e8eeeb] px-4 py-3 sm:px-5">
                      <div className="flex items-center justify-between gap-3">
                        <div><CardTitle className="text-sm text-[#263e36]">Gán nút</CardTitle><p className="mt-1 text-xs text-[#78877f]">Nhãn và liên kết đích của từng nút</p></div>
                        {!isArchived && <Button type="button" variant="outline" size="sm" onClick={() => addComponent("button")} className="h-8 border-[#d5e0d7] text-[#426353]"><Link2 className="mr-1.5 h-3.5 w-3.5" />Thêm nút</Button>}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 px-4 py-4 sm:px-5">
                      {form.components.map((component, index) => component.type !== "button" ? null : (
                        <div key={`button-${index}`} className="grid gap-3 rounded-lg border border-[#e0e7e1] bg-[#fbfcf9] p-3 sm:grid-cols-[1fr_1.4fr_auto]">
                          <div className="space-y-1.5"><Label className="text-xs">Nhãn nút</Label><Input disabled={isArchived} value={component.label} onChange={(event) => updateComponent(index, { ...component, label: event.target.value })} placeholder="Ví dụ: Xem chi tiết" /></div>
                          <div className="space-y-1.5"><Label className="text-xs">URL đích</Label><Input disabled={isArchived} value={component.url} onChange={(event) => updateComponent(index, { ...component, url: event.target.value })} placeholder="https://…" /></div>
                          {!isArchived && <Button type="button" variant="ghost" size="icon" aria-label="Xóa nút" onClick={() => updateField("components", form.components.filter((_, position) => position !== index))} className="mt-5 text-[#9b6257]"><Trash2 className="h-4 w-4" /></Button>}
                        </div>
                      ))}
                      {form.components.every((component) => component.type !== "button") && <p className="rounded-lg border border-dashed border-[#d4ded8] px-4 py-6 text-center text-xs text-[#829087]">Chưa có nút. Thêm nút để gán nhãn và liên kết.</p>}
                    </CardContent>
                  </Card>

                  {(saveMutation.error || duplicateMutation.error || archiveMutation.error) && (
                    <ErrorNotice error={saveMutation.error ?? duplicateMutation.error ?? archiveMutation.error} title="Không thể hoàn tất thao tác" />
                  )}

                  <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#dbe4dd] bg-[#fbfcf8]/95 p-3 shadow-[0_8px_26px_rgba(33,57,44,0.11)] backdrop-blur">
                    <div className="flex flex-wrap items-center gap-2">
                       {!creating && selected && canWrite && <Button type="button" variant="outline" onClick={() => { setDuplicateCode(`${selected.code}_COPY`); setDuplicateOpen(true); duplicateMutation.reset(); }} disabled={duplicateMutation.isPending} className="border-[#d5e0d7] text-[#436454]"><Copy className="mr-2 h-4 w-4" />Sao chép</Button>}
                       {!creating && selected && !isArchived && canDelete && <Button type="button" variant="outline" onClick={() => setArchiveOpen(true)} className="border-[#ead7d3] text-[#92544a] hover:bg-[#fff5f2]"><Archive className="mr-2 h-4 w-4" />Lưu trữ</Button>}
                    </div>
                    <div className="flex items-center gap-2">
                      {!creating && <Button type="button" variant="ghost" onClick={() => { setSelectedId(null); setCreating(false); setNotice(""); }} className="text-[#68786f]"><ArrowLeft className="mr-1.5 h-4 w-4" />Đóng</Button>}
                      {!isArchived && <Button type="button" onClick={() => saveMutation.mutate()} disabled={!canSave} className="bg-[#315f4e] text-white hover:bg-[#264d3e] disabled:bg-[#dfe7e2] disabled:text-[#78877f]"><Save className="mr-2 h-4 w-4" />{saveMutation.isPending ? "Đang lưu…" : creating ? "Lưu bản nháp" : "Lưu thay đổi"}</Button>}
                    </div>
                  </div>
                  {!isArchived && (!form.code.trim() || !form.name.trim() || !form.notificationType.trim()) && <p className="-mt-2 text-right text-[11px] text-[#8b7a60]">Mã nội bộ, tên mẫu và loại thông báo là các trường bắt buộc.</p>}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Dialog open={variablePickerOpen} onOpenChange={setVariablePickerOpen}>
        <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto border-[#d9e2dd] bg-[#fffefa]">
          <DialogHeader>
            <DialogTitle className="text-[#263e36]">Chọn biến hệ thống</DialogTitle>
            <DialogDescription>
              Chọn một biến để chèn vào vị trí con trỏ trong khối văn bản. Mỗi biến có sẵn ví dụ và mô tả.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {Array.from(new Set(ZBS_TEMPLATE_SYSTEM_VARIABLES.map((variable) => variable.group))).map((group) => (
              <section key={group} className="space-y-2">
                <h3 className="sticky top-0 z-[1] bg-[#fffefa] py-1 text-xs font-semibold uppercase tracking-wide text-[#527365]">{group}</h3>
                <div className="space-y-2">
                  {ZBS_TEMPLATE_SYSTEM_VARIABLES.filter((variable) => variable.group === group && variable.key !== "center_logo").map((variable) => (
                    <button
                      key={variable.key}
                      type="button"
                      onClick={() => insertSystemVariable(variable)}
                      className="w-full rounded-lg border border-[#dfe7e1] bg-white p-3 text-left transition-colors hover:border-[#9db9a8] hover:bg-[#f5f9f5] focus:outline-none focus:ring-2 focus:ring-[#8eae9b]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-[#304b3e]">{variable.label}</span>
                        <code className="zl-mono rounded bg-[#edf3ee] px-2 py-1 text-xs text-[#426353]">{`<${variable.key}>`}</code>
                      </div>
                      <p className="mt-1.5 text-xs leading-5 text-[#68776e]">{variable.description}</p>
                      <p className="mt-1 text-xs text-[#526a5c]">Nguồn: <code>{variable.source}</code> · Ví dụ: <strong>{variable.example}</strong></p>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {duplicateOpen && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#18342b]/35 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDuplicateOpen(false); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="zl-duplicate-title" className="w-full max-w-md rounded-xl border border-[#d9e2dd] bg-[#fbfcf8] p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between"><div><h3 id="zl-duplicate-title" className="text-base font-semibold text-[#263e36]">Sao chép mẫu</h3><p className="mt-1 text-xs leading-5 text-[#74827a]">Bản sao được tạo thành một bản nháp riêng, không thay đổi mẫu gốc.</p></div><Button variant="ghost" size="icon" aria-label="Đóng" onClick={() => setDuplicateOpen(false)} className="-mr-2 -mt-2 h-8 w-8"><X className="h-4 w-4" /></Button></div>
            <Label htmlFor="zl-copy-code">Mã nội bộ cho bản sao</Label><Input id="zl-copy-code" value={duplicateCode} onChange={(event) => setDuplicateCode(event.target.value)} className="zl-mono mt-1.5 border-[#d4ded7] bg-white" />
            {duplicateMutation.error && <div className="mt-3"><ErrorNotice error={duplicateMutation.error} title="Không thể sao chép" /></div>}
            <div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => setDuplicateOpen(false)}>Hủy</Button><Button onClick={() => duplicateMutation.mutate()} disabled={!duplicateCode.trim() || duplicateMutation.isPending} className="bg-[#315f4e] text-white hover:bg-[#264d3e]">{duplicateMutation.isPending && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}Tạo bản sao</Button></div>
          </div>
        </div>
      )}

      {archiveOpen && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#18342b]/35 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setArchiveOpen(false); }}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="zl-archive-title" className="w-full max-w-md rounded-xl border border-[#e5d8d0] bg-[#fbfcf8] p-5 shadow-2xl">
            <div className="mb-4 flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#fbefea] text-[#9a5c4c]"><Archive className="h-4 w-4" /></span><div><h3 id="zl-archive-title" className="text-base font-semibold text-[#3b463e]">Lưu trữ mẫu này?</h3><p className="mt-1 text-xs leading-5 text-[#74827a]"><strong>{selected.name}</strong> sẽ được chuyển sang danh sách lưu trữ. Đây là thao tác lưu trữ mềm.</p></div></div>
            {archiveMutation.error && <ErrorNotice error={archiveMutation.error} title="Không thể lưu trữ" />}
            <div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => setArchiveOpen(false)}>Giữ lại</Button><Button onClick={() => archiveMutation.mutate()} disabled={archiveMutation.isPending} className="bg-[#92544a] text-white hover:bg-[#7b433b]">{archiveMutation.isPending && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}Lưu trữ mẫu</Button></div>
          </div>
        </div>
      )}
    </section>
  );
}

export default ZbsTemplateLibrary;
