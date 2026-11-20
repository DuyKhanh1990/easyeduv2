import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { BriefcaseBusiness, CalendarDays, ChevronRight, Eye, FileText, Mail, Pencil, Phone, Plus, Search, Trash2, UserRound, Users } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { FileViewer } from "@/components/ui/file-viewer";
import * as mammoth from "mammoth";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { apiRequest, getAuthHeaders } from "@/lib/queryClient";
import "./Candidates.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type CandidateResult = "interviewed" | "pass" | "fail" | "";
type InterviewMode = "offline" | "online";
type CandidateFile = { id: string; name: string; url: string };
type Candidate = {
  id: string;
  code: string;
  name: string;
  position: string;
  phone: string;
  email: string;
  address: string;
  interviewMode: InterviewMode;
  skills: string;
  result: CandidateResult;
  interviewScheduledAt: string | null;
  evaluation: string;
  files: CandidateFile[];
  scores: { expertise: string; experience: string; communication: string; attitude: string };
};
type CandidateFilter = "pending" | "interviewed" | "passed" | "rejected";

function toLocalDateTimeInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseScheduleDate(value: string): Date | undefined {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return undefined;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : undefined;
}

function formatShortDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${String(date.getFullYear()).slice(-2)}`;
}

const EMPTY_SCORES: Candidate["scores"] = {
  expertise: "",
  experience: "",
  communication: "",
  attitude: "",
};

const SCORE_CRITERIA: { key: keyof Candidate["scores"]; label: string }[] = [
  { key: "expertise", label: "Chuyên môn" },
  { key: "experience", label: "Kinh nghiệm" },
  { key: "communication", label: "Giao tiếp" },
  { key: "attitude", label: "Thái độ" },
];

function getAverage(scores: Candidate["scores"]): number | null {
  const values = Object.values(scores)
    .filter((value) => value !== "")
    .map(Number)
    .filter((value) => Number.isFinite(value));
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export default function Candidates() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(true);
  const [candidateDataError, setCandidateDataError] = useState("");
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<CandidateFilter>("pending");
  const [newCandidateName, setNewCandidateName] = useState("");
  const [newCandidatePosition, setNewCandidatePosition] = useState("");
  const [newCandidatePhone, setNewCandidatePhone] = useState("");
  const [newCandidateEmail, setNewCandidateEmail] = useState("");
  const [newCandidateAddress, setNewCandidateAddress] = useState("");
  const [newCandidateInterviewMode, setNewCandidateInterviewMode] = useState<InterviewMode>("offline");
  const [newCandidateCvFile, setNewCandidateCvFile] = useState<File | null>(null);
  const [isReadingCv, setIsReadingCv] = useState(false);
  const [cvImportStatus, setCvImportStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(null);
  const [candidatePendingDelete, setCandidatePendingDelete] = useState<Candidate | null>(null);
  const [isDeletingCandidate, setIsDeletingCandidate] = useState(false);
  const [isSavingCandidate, setIsSavingCandidate] = useState(false);
  const [isUploadingCandidateFiles, setIsUploadingCandidateFiles] = useState(false);
  const [candidateFileUploadError, setCandidateFileUploadError] = useState("");
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduleDateTime, setScheduleDateTime] = useState("");
  const [viewerFile, setViewerFile] = useState<{ url: string; name: string } | null>(null);
  const selectedScheduleDate = parseScheduleDate(scheduleDateTime);
  const pendingCandidateUpdates = useRef<Record<string, Partial<Candidate>>>({});
  const candidateSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    apiRequest("GET", "/api/hrm/candidates")
      .then((response) => response.json())
      .then((data) => setCandidates(Array.isArray(data.candidates) ? data.candidates : []))
      .catch(() => setCandidateDataError("Không thể tải hồ sơ ứng viên từ DB."))
      .finally(() => setIsLoadingCandidates(false));
  }, []);

  const uploadCandidateFiles = async (files: File[]): Promise<CandidateFile[]> => {
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
      headers: getAuthHeaders(),
      credentials: "include",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Không thể tải tệp lên S3.");
    }
    if (!Array.isArray(data.files) || data.files.length !== files.length || data.files.some((file: any) => !file?.url)) {
      throw new Error("S3 không trả về đủ liên kết tệp.");
    }
    return data.files.map((file: { name: string; url: string }) => ({
      id: crypto.randomUUID(),
      name: file.name,
      url: file.url,
    }));
  };

  const handleCvImport = async (file: File) => {
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!["pdf", "docx"].includes(extension || "")) {
      setCvImportStatus({ type: "error", message: "Chỉ hỗ trợ CV định dạng PDF hoặc DOCX." });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setCvImportStatus({ type: "error", message: "CV vượt quá 10 MB. Vui lòng chọn tệp nhỏ hơn." });
      return;
    }

    setNewCandidateCvFile(file);
    setCvImportStatus(null);
    setIsReadingCv(true);
    try {
      let cvText = "";
      if (extension === "docx") {
        const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
        cvText = result.value;
      } else {
        const document = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
        const pageTexts: string[] = [];
        for (let pageNumber = 1; pageNumber <= Math.min(document.numPages, 20); pageNumber++) {
          const page = await document.getPage(pageNumber);
          const content = await page.getTextContent();
          pageTexts.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
        }
        await document.destroy();
        cvText = pageTexts.join("\n");
      }

      cvText = cvText.replace(/\s+/g, " ").trim().slice(0, 40_000);
      if (!cvText) {
        throw new Error("CV không có văn bản để đọc. Nếu đây là bản scan, bạn có thể nhập thông tin thủ công.");
      }

      const response = await apiRequest("POST", "/api/ai/parse-candidate-cv", { text: cvText });
      const parsed = await response.json();
      const filledFields: string[] = [];
      if (typeof parsed.name === "string" && parsed.name.trim()) {
        setNewCandidateName(parsed.name.trim());
        filledFields.push("tên");
      }
      if (typeof parsed.position === "string" && parsed.position.trim()) {
        setNewCandidatePosition(parsed.position.trim());
        filledFields.push("vị trí");
      }
      if (typeof parsed.phone === "string" && parsed.phone.trim()) {
        setNewCandidatePhone(parsed.phone.trim());
        filledFields.push("số điện thoại");
      }
      if (typeof parsed.email === "string" && parsed.email.trim()) {
        setNewCandidateEmail(parsed.email.trim());
        filledFields.push("email");
      }
      if (typeof parsed.address === "string" && parsed.address.trim()) {
        setNewCandidateAddress(parsed.address.trim());
        filledFields.push("địa chỉ");
      }
      setCvImportStatus(filledFields.length
        ? { type: "success", message: `Đã nhận diện: ${filledFields.join(", ")}. Vui lòng kiểm tra lại trước khi thêm.` }
        : { type: "error", message: "Không nhận diện được trường thông tin nào. Bạn có thể nhập thủ công." });
    } catch (error) {
      let message = error instanceof Error ? error.message : "Không thể đọc CV.";
      try {
        const responseBody = JSON.parse(message.replace(/^\d+:\s*/, ""));
        if (responseBody.message) message = responseBody.message;
      } catch {}
      setCvImportStatus({ type: "error", message });
    } finally {
      setIsReadingCv(false);
    }
  };

  const filteredCandidates = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return candidates.filter((candidate) => {
      const matchesFilter = (activeFilter === "pending" && !candidate.result)
        || (activeFilter === "interviewed" && candidate.result === "interviewed")
        || (activeFilter === "passed" && candidate.result === "pass")
        || (activeFilter === "rejected" && candidate.result === "fail");
      const matchesSearch = !query
        || `${candidate.code} ${candidate.name} ${candidate.position} ${candidate.phone} ${candidate.email} ${candidate.skills}`.toLowerCase().includes(query);
      return matchesFilter && matchesSearch;
    }).sort((a, b) => {
      const aTime = a.interviewScheduledAt ? Date.parse(a.interviewScheduledAt) : Number.POSITIVE_INFINITY;
      const bTime = b.interviewScheduledAt ? Date.parse(b.interviewScheduledAt) : Number.POSITIVE_INFINITY;
      const safeATime = Number.isFinite(aTime) ? aTime : Number.POSITIVE_INFINITY;
      const safeBTime = Number.isFinite(bTime) ? bTime : Number.POSITIVE_INFINITY;
      return safeATime - safeBTime;
    });
  }, [activeFilter, candidates, searchTerm]);
  const selectedCandidate = filteredCandidates.find((candidate) => candidate.id === selectedCandidateId) ?? null;

  useEffect(() => {
    if (selectedCandidateId && !filteredCandidates.some((candidate) => candidate.id === selectedCandidateId)) {
      setSelectedCandidateId(filteredCandidates[0]?.id ?? null);
    } else if (!selectedCandidateId && filteredCandidates.length > 0) {
      setSelectedCandidateId(filteredCandidates[0].id);
    }
  }, [filteredCandidates, selectedCandidateId]);

  const saveCandidate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newCandidateName.trim();
    const position = newCandidatePosition.trim();
    if (!name || !position) return;
    setIsSavingCandidate(true);
    setCvImportStatus(null);
    try {
      const editingCandidate = editingCandidateId
        ? candidates.find((candidate) => candidate.id === editingCandidateId)
        : null;
      if (editingCandidateId && !editingCandidate) {
        throw new Error("Không tìm thấy hồ sơ ứng viên cần chỉnh sửa.");
      }
      const uploadedFiles = newCandidateCvFile ? await uploadCandidateFiles([newCandidateCvFile]) : [];
      const values = {
        name,
        position,
        phone: newCandidatePhone.trim(),
        email: newCandidateEmail.trim(),
        address: newCandidateAddress.trim(),
        interviewMode: newCandidateInterviewMode,
        ...(editingCandidate
          ? { files: [...editingCandidate.files, ...uploadedFiles] }
          : {
              skills: "",
              result: "",
              evaluation: "",
              files: uploadedFiles,
              scores: { ...EMPTY_SCORES },
            }),
      };
      const response = editingCandidate
        ? await apiRequest("PATCH", `/api/hrm/candidates/${editingCandidate.id}`, values)
        : await apiRequest("POST", "/api/hrm/candidates", values);
      const candidate: Candidate = await response.json();
      setCandidates((current) => editingCandidate
        ? current.map((item) => item.id === candidate.id ? candidate : item)
        : [...current, candidate]);
    setCandidateDataError("");
    setSelectedCandidateId(candidate.id);
      if (!editingCandidate) setActiveFilter("pending");
      setNewCandidateName("");
      setNewCandidatePosition("");
      setNewCandidatePhone("");
      setNewCandidateEmail("");
      setNewCandidateAddress("");
      setNewCandidateInterviewMode("offline");
      setNewCandidateCvFile(null);
      setCvImportStatus(null);
      setSearchTerm("");
      setEditingCandidateId(null);
      setIsAddFormOpen(false);
    } catch (error) {
      setCvImportStatus({
        type: "error",
        message: error instanceof Error
          ? error.message
          : editingCandidateId
            ? "Không thể lưu thay đổi ứng viên."
            : "Không thể tải CV lên S3; ứng viên chưa được thêm.",
      });
    } finally {
      setIsSavingCandidate(false);
    }
  };

  const openAddCandidateDialog = () => {
    setEditingCandidateId(null);
    setNewCandidateName("");
    setNewCandidatePosition("");
    setNewCandidatePhone("");
    setNewCandidateEmail("");
    setNewCandidateAddress("");
    setNewCandidateInterviewMode("offline");
    setNewCandidateCvFile(null);
    setCvImportStatus(null);
    setIsAddFormOpen(true);
  };

  const openEditCandidateDialog = (candidate: Candidate) => {
    setEditingCandidateId(candidate.id);
    setNewCandidateName(candidate.name);
    setNewCandidatePosition(candidate.position);
    setNewCandidatePhone(candidate.phone);
    setNewCandidateEmail(candidate.email);
    setNewCandidateAddress(candidate.address);
    setNewCandidateInterviewMode(candidate.interviewMode);
    setNewCandidateCvFile(null);
    setCvImportStatus(null);
    setIsAddFormOpen(true);
  };

  const deleteCandidate = async () => {
    if (!candidatePendingDelete) return;
    setIsDeletingCandidate(true);
    try {
      await apiRequest("DELETE", `/api/hrm/candidates/${candidatePendingDelete.id}`);
      clearTimeout(candidateSaveTimers.current[candidatePendingDelete.id]);
      delete candidateSaveTimers.current[candidatePendingDelete.id];
      delete pendingCandidateUpdates.current[candidatePendingDelete.id];
      setCandidates((current) => current.filter((candidate) => candidate.id !== candidatePendingDelete.id));
      if (selectedCandidateId === candidatePendingDelete.id) setSelectedCandidateId(null);
      setCandidateDataError("");
      setCandidatePendingDelete(null);
    } catch {
      setCandidateDataError("Không thể xóa hồ sơ ứng viên. Vui lòng thử lại.");
    } finally {
      setIsDeletingCandidate(false);
    }
  };

  const updateCandidate = (id: string, updates: Partial<Candidate>) => {
    setCandidates((current) => current.map((candidate) =>
      candidate.id === id ? { ...candidate, ...updates } : candidate,
    ));
    pendingCandidateUpdates.current[id] = { ...pendingCandidateUpdates.current[id], ...updates };
    clearTimeout(candidateSaveTimers.current[id]);
    candidateSaveTimers.current[id] = setTimeout(async () => {
      const pending = pendingCandidateUpdates.current[id];
      delete pendingCandidateUpdates.current[id];
      try {
        await apiRequest("PATCH", `/api/hrm/candidates/${id}`, pending);
        setCandidateDataError("");
      } catch {
        setCandidateDataError("Có thay đổi chưa lưu được vào DB. Hãy thử chỉnh sửa lại.");
      }
    }, 500);
  };

  const addFiles = async (candidateId: string, selectedFiles: FileList | null) => {
    if (!selectedFiles?.length) return;
    setIsUploadingCandidateFiles(true);
    setCandidateFileUploadError("");
    try {
      const nextFiles = await uploadCandidateFiles(Array.from(selectedFiles));
      const candidate = candidates.find((item) => item.id === candidateId);
      if (!candidate) throw new Error("Không tìm thấy hồ sơ ứng viên.");
      updateCandidate(candidateId, { files: [...candidate.files, ...nextFiles] });
    } catch (error) {
      setCandidateFileUploadError(error instanceof Error ? error.message : "Không thể tải tệp lên S3.");
    } finally {
      setIsUploadingCandidateFiles(false);
    }
  };

  const setCandidateResult = (candidate: Candidate, value: CandidateResult) => {
    updateCandidate(candidate.id, { result: value });
    setActiveFilter((filter) => {
      if (value === "interviewed") return "interviewed";
      if (value === "pass") return "passed";
      if (value === "fail") return "rejected";
      return "pending";
    });
  };

  const filters: { value: CandidateFilter; label: string; count: number }[] = [
    { value: "pending", label: "Chờ Phỏng vấn", count: candidates.filter((candidate) => !candidate.result).length },
    { value: "interviewed", label: "Đã phỏng vấn", count: candidates.filter((candidate) => candidate.result === "interviewed").length },
    { value: "passed", label: "Trúng tuyển", count: candidates.filter((candidate) => candidate.result === "pass").length },
    { value: "rejected", label: "Loại", count: candidates.filter((candidate) => candidate.result === "fail").length },
  ];

  return (
    <DashboardLayout>
      <div className="candidate-page-theme">
      <div className="w-full max-w-none space-y-5">
        <div className="candidate-page-heading">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-[.18em] text-indigo-700">EasyEdu · Tuyển dụng</div>
          <h1 className="text-2xl font-semibold">Quản lý ứng viên</h1>
          <p className="mt-1 text-sm text-muted-foreground">Theo dõi hồ sơ, đánh giá và kết quả phỏng vấn.</p>
        </div>
        {candidateDataError && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700" role="alert">
            {candidateDataError}
          </div>
        )}

        <div className="candidate-main-grid grid grid-cols-1 items-start gap-5">
          <Card className="candidate-list-panel flex min-h-[680px] flex-col overflow-hidden border-slate-200 bg-slate-50/60 lg:sticky lg:top-4">
            <div className="space-y-4 border-b bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Danh sách Ứng viên</h2>
                  <p className="text-sm text-muted-foreground">Quản lý hồ sơ phỏng vấn</p>
                </div>
                <Button
                  type="button"
                  size="icon"
                  className="h-10 w-10 shrink-0 rounded-xl"
                  aria-label="Thêm ứng viên"
                  onClick={openAddCandidateDialog}
                >
                  <Plus className="h-5 w-5" />
                </Button>
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Tìm tên, vị trí, kỹ năng..."
                  aria-label="Tìm ứng viên theo tên, vị trí hoặc kỹ năng"
                  className="h-11 rounded-xl bg-white pl-9"
                />
              </div>

              <div className="candidate-filter-row" aria-label="Lọc trạng thái ứng viên">
                {filters.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    className={`candidate-filter-chip shrink-0 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors ${
                      activeFilter === filter.value
                        ? "is-active border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                    }`}
                    aria-pressed={activeFilter === filter.value}
                    onClick={() => setActiveFilter(filter.value)}
                  >
                    {filter.label}
                    <span className="ml-1 opacity-70">{filter.count}</span>
                  </button>
                ))}
              </div>

            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              {filteredCandidates.map((candidate) => {
                const initials = candidate.name
                  .trim()
                  .split(/\s+/)
                  .slice(-2)
                  .map((part) => part[0] ?? "")
                  .join("")
                  .toUpperCase();
                const statusLabel = candidate.result === "pass"
                  ? "Trúng tuyển"
                  : candidate.result === "fail"
                    ? "Loại"
                      : candidate.result === "interviewed"
                        ? "Đã phỏng vấn"
                        : "Chờ Phỏng vấn";
                const statusStyle = candidate.result === "pass"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : candidate.result === "fail"
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : candidate.result === "interviewed"
                      ? "border-blue-200 bg-blue-50 text-blue-700"
                      : "border-amber-200 bg-amber-50 text-amber-700";

                return (
                  <div
                    key={candidate.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedCandidateId(candidate.id)}
                    onKeyDown={(event) => {
                      if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                        event.preventDefault();
                        setSelectedCandidateId(candidate.id);
                      }
                    }}
                    aria-current={selectedCandidateId === candidate.id ? "true" : undefined}
                    className={`candidate-list-card w-full rounded-2xl border p-3.5 text-left transition-colors ${
                      selectedCandidateId === candidate.id
                        ? "border-indigo-200 bg-indigo-50/80 shadow-sm"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-violet-600 text-sm font-semibold text-white">
                        {initials || <UserRound className="h-5 w-5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate text-[13px] font-semibold text-slate-900">{candidate.name}</span>
                            <span className="shrink-0 text-[13px] text-slate-400">{candidate.code}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-0.5">
                            <button
                              type="button"
                              aria-label={`Sửa ${candidate.name}`}
                              title="Sửa ứng viên"
                              className="rounded-md p-1.5 text-slate-400 transition hover:bg-white hover:text-indigo-700"
                              onClick={(event) => {
                                event.stopPropagation();
                                openEditCandidateDialog(candidate);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Xóa ${candidate.name}`}
                              title="Xóa ứng viên"
                              className="rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                              onClick={(event) => {
                                event.stopPropagation();
                                setCandidatePendingDelete(candidate);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                            <ChevronRight className="h-4 w-4 text-indigo-600" />
                          </span>
                        </span>
                        <span className="mt-1 flex items-center gap-1.5 truncate text-xs text-slate-500">
                          <BriefcaseBusiness className="h-3.5 w-3.5 shrink-0" />
                          {candidate.position || "Chưa nhập vị trí"}
                        </span>
                        <span className="mt-2 flex items-center justify-between gap-2">
                          <Select
                            value={candidate.result || "pending"}
                            onValueChange={(value) => setCandidateResult(
                              candidate,
                              value === "interviewed" || value === "pass" || value === "fail" ? value : "",
                            )}
                          >
                            <SelectTrigger
                              aria-label={`Trạng thái ứng viên ${candidate.name}`}
                              className={`h-auto w-fit gap-1 rounded-full border px-2.5 py-1 text-[13px] font-medium shadow-none ${statusStyle}`}
                              onClick={(event) => event.stopPropagation()}
                              onPointerDown={(event) => event.stopPropagation()}
                            >
                              <SelectValue>{statusLabel}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="interviewed">Đã phỏng vấn</SelectItem>
                              <SelectItem value="pass">Trúng tuyển</SelectItem>
                              <SelectItem value="fail">Loại</SelectItem>
                            </SelectContent>
                          </Select>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-[13px] text-slate-400 hover:text-indigo-700"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedCandidateId(candidate.id);
                              const scheduledDate = candidate.interviewScheduledAt
                                ? new Date(candidate.interviewScheduledAt)
                                : new Date();
                              setScheduleDateTime(toLocalDateTimeInput(
                                Number.isNaN(scheduledDate.getTime()) ? new Date() : scheduledDate,
                              ));
                              setScheduleDialogOpen(true);
                            }}
                          >
                            <CalendarDays className="h-3.5 w-3.5" />
                            {candidate.interviewScheduledAt
                              ? new Date(candidate.interviewScheduledAt).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })
                              : "Chưa xếp lịch"}
                          </button>
                        </span>
                      </span>
                    </div>
                  </div>
                );
              })}
              {filteredCandidates.length === 0 && (
                <div className="flex min-h-36 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                  <Users className="h-8 w-8 opacity-35" />
                  <p>
                    {isLoadingCandidates
                      ? "Đang tải hồ sơ ứng viên..."
                      : searchTerm
                      ? "Không tìm thấy ứng viên phù hợp."
                      : activeFilter === "pending"
                          ? "Không có ứng viên chờ phỏng vấn."
                          : activeFilter === "interviewed"
                            ? "Chưa có ứng viên đã phỏng vấn."
                            : activeFilter === "passed"
                              ? "Chưa có ứng viên trúng tuyển."
                              : "Chưa có ứng viên bị loại."}
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center border-t bg-white px-4 py-3 text-sm">
              <span className="text-muted-foreground">Kết quả: <strong className="text-foreground">{filteredCandidates.length}</strong></span>
            </div>
          </Card>

          {selectedCandidate ? (
            <div className="space-y-4">
              <div className="candidate-detail-heading flex flex-wrap items-center gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="candidate-detail-avatar flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
                    {selectedCandidate.name.trim().split(/\s+/).slice(-2).map((part) => part[0] ?? "").join("").toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-[13px] font-semibold">{selectedCandidate.name}</h2>
                      <span className="text-[13px] text-slate-400">{selectedCandidate.code}</span>
                      <Select
                        value={selectedCandidate.result || "pending"}
                        onValueChange={(value) => setCandidateResult(
                          selectedCandidate,
                          value === "interviewed" || value === "pass" || value === "fail" ? value : "",
                        )}
                      >
                        <SelectTrigger className={`candidate-detail-status h-auto w-fit rounded-full px-2.5 py-1 text-[13px] font-semibold ${
                        selectedCandidate.result === "pass"
                          ? "bg-emerald-50 text-emerald-700"
                          : selectedCandidate.result === "fail"
                            ? "bg-rose-50 text-rose-700"
                            : selectedCandidate.result === "interviewed"
                              ? "bg-blue-50 text-blue-700"
                              : "bg-amber-50 text-amber-700"
                      }`} aria-label="Trạng thái ứng viên">
                          <SelectValue>{selectedCandidate.result === "pass" ? "Trúng tuyển" : selectedCandidate.result === "fail" ? "Loại" : selectedCandidate.result === "interviewed" ? "Đã phỏng vấn" : "Chờ Phỏng vấn"}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="interviewed">Đã phỏng vấn</SelectItem>
                          <SelectItem value="pass">Trúng tuyển</SelectItem>
                          <SelectItem value="fail">Loại</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <BriefcaseBusiness className="h-4 w-4 shrink-0 text-slate-400" />
                        {selectedCandidate.position || "Chưa nhập vị trí ứng tuyển"}
                      </span>
                      {selectedCandidate.email && (
                        <a className="inline-flex items-center gap-1.5 hover:text-primary" href={`mailto:${selectedCandidate.email}`}>
                          <Mail className="h-4 w-4 shrink-0 text-slate-400" />
                          {selectedCandidate.email}
                        </a>
                      )}
                      {selectedCandidate.phone && (
                        <a className="inline-flex items-center gap-1.5 hover:text-primary" href={`tel:${selectedCandidate.phone}`}>
                          <Phone className="h-4 w-4 shrink-0 text-slate-400" />
                          {selectedCandidate.phone}
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <Card className="candidate-detail-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                  <CardTitle className="text-base">Hồ sơ ứng viên</CardTitle>
                  <label className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium ${
                    isUploadingCandidateFiles ? "cursor-wait opacity-60" : "cursor-pointer hover:bg-muted"
                  }`}>
                    <Plus className="h-4 w-4" />
                    {isUploadingCandidateFiles ? "Đang tải..." : "Thêm tệp"}
                    <input
                      type="file"
                      multiple
                      className="sr-only"
                      disabled={isUploadingCandidateFiles}
                      onChange={(event) => {
                        void addFiles(selectedCandidate.id, event.target.files);
                        event.target.value = "";
                      }}
                    />
                  </label>
                </CardHeader>
                <CardContent>
                  {candidateFileUploadError && (
                    <p className="mb-3 text-sm text-destructive" role="alert">{candidateFileUploadError}</p>
                  )}
                  {selectedCandidate.files.length ? (
                    <div className="space-y-2">
                      {selectedCandidate.files.map((file) => (
                        <div key={file.id} className="flex items-center gap-3 rounded-md border px-3 py-2">
                          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
                          <button
                            type="button"
                            aria-label={`Xem ${file.name}`}
                            title="Xem tệp"
                            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                            onClick={() => setViewerFile({ url: file.url, name: file.name })}
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Chưa có tệp hồ sơ.</p>
                  )}
                </CardContent>
              </Card>

              <Card className="candidate-detail-card">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Đánh giá ứng viên</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={selectedCandidate.evaluation}
                    onChange={(event) => updateCandidate(selectedCandidate.id, { evaluation: event.target.value })}
                    placeholder="Nhập nội dung đánh giá..."
                    rows={4}
                  />
                </CardContent>
              </Card>

              <Card className="candidate-detail-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                  <CardTitle className="text-base">Điểm ứng viên</CardTitle>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Trung bình</p>
                    <p className="text-lg font-semibold text-primary">
                      {getAverage(selectedCandidate.scores)?.toFixed(1) ?? "—"}<span className="text-sm font-normal text-muted-foreground"> / 10</span>
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {SCORE_CRITERIA.map((criterion) => (
                    <label key={criterion.key} className="space-y-1.5">
                      <span className="text-sm font-medium">{criterion.label} <span className="text-muted-foreground">/ 10</span></span>
                      <Input
                        type="number"
                        min="0"
                        max="10"
                        step="0.5"
                        value={selectedCandidate.scores[criterion.key]}
                        onChange={(event) => {
                          const raw = event.target.value;
                          const value = raw === ""
                            ? ""
                            : String(Math.min(10, Math.max(0, Number(raw))));
                          updateCandidate(selectedCandidate.id, {
                            scores: { ...selectedCandidate.scores, [criterion.key]: value },
                          });
                        }}
                        placeholder="—"
                        aria-label={`${criterion.label}, tối đa 10 điểm`}
                      />
                    </label>
                  ))}
                </CardContent>
              </Card>

            </div>
          ) : (
            <Card className="flex min-h-[420px] items-center justify-center">
              <CardContent className="flex flex-col items-center gap-3 pt-6 text-center text-muted-foreground">
                <Users className="h-10 w-10 opacity-40" />
                <p className="text-sm">
                  {searchTerm
                    ? "Không tìm thấy ứng viên phù hợp."
                    : "Thêm hoặc chọn ứng viên để xem thông tin."}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      <Dialog open={isAddFormOpen} onOpenChange={(open) => {
        setIsAddFormOpen(open);
        if (!open) {
          setEditingCandidateId(null);
          setNewCandidateCvFile(null);
          setCvImportStatus(null);
        }
      }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>{editingCandidateId ? "Chỉnh sửa ứng viên" : "Thêm ứng viên"}</DialogTitle>
            <DialogDescription>
              {editingCandidateId
                ? "Cập nhật thông tin ứng viên. Có thể nhập CV mới để tự nhận diện thông tin và đính kèm vào hồ sơ."
                : "Import CV để nhận diện thông tin hoặc nhập thủ công. Văn bản CV được gửi đến AI đã cấu hình; tệp sẽ được lưu trên S3 khi thêm ứng viên."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveCandidate} className="space-y-5 pt-2">
            <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 p-4">
              <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-medium text-indigo-700 transition hover:bg-indigo-50 ${isReadingCv ? "pointer-events-none opacity-60" : ""}`}>
                <FileText className="h-4 w-4" />
                {isReadingCv ? "Đang đọc CV..." : newCandidateCvFile ? "Chọn CV khác" : editingCandidateId ? "Import CV mới PDF/DOCX" : "Import CV PDF/DOCX"}
                <input
                  type="file"
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="sr-only"
                  disabled={isReadingCv}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = "";
                    if (file) void handleCvImport(file);
                  }}
                />
              </label>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Chỉ trích xuất văn bản tối đa 20 trang và 10 MB. CV scan/ảnh chưa đọc được; bạn vẫn có thể nhập tay.
              </p>
              {newCandidateCvFile && (
                <p className="mt-2 truncate text-xs font-medium text-slate-700">
                  Tệp sẽ đính kèm vào hồ sơ: {newCandidateCvFile.name}
                </p>
              )}
              {cvImportStatus && (
                <p className={`mt-2 text-xs ${cvImportStatus.type === "success" ? "text-emerald-700" : "text-rose-700"}`} role="status">
                  {cvImportStatus.message}
                </p>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm font-medium">
                Tên ứng viên <span className="text-destructive">*</span>
                <Input required value={newCandidateName} onChange={(event) => setNewCandidateName(event.target.value)} placeholder="Nhập họ tên" />
              </label>
              <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
                Vị trí tuyển dụng <span className="text-destructive">*</span>
                <Input required value={newCandidatePosition} onChange={(event) => setNewCandidatePosition(event.target.value)} placeholder="Nhập vị trí ứng tuyển" />
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                Số điện thoại
                <Input type="tel" value={newCandidatePhone} onChange={(event) => setNewCandidatePhone(event.target.value)} placeholder="Nhập số điện thoại" />
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                Email
                <Input type="email" value={newCandidateEmail} onChange={(event) => setNewCandidateEmail(event.target.value)} placeholder="name@example.com" />
              </label>
              <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
                Địa chỉ
                <Input value={newCandidateAddress} onChange={(event) => setNewCandidateAddress(event.target.value)} placeholder="Nhập địa chỉ" />
              </label>
              <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
                Hình thức phỏng vấn
                <Select value={newCandidateInterviewMode} onValueChange={(value) => setNewCandidateInterviewMode(value as InterviewMode)}>
                  <SelectTrigger aria-label="Hình thức phỏng vấn">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="offline">Offline</SelectItem>
                    <SelectItem value="online">Online</SelectItem>
                  </SelectContent>
                </Select>
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={isSavingCandidate} onClick={() => setIsAddFormOpen(false)}>Hủy</Button>
              <Button type="submit" disabled={!newCandidateName.trim() || !newCandidatePosition.trim() || isSavingCandidate || isReadingCv}>
                {isSavingCandidate ? "Đang lưu..." : editingCandidateId ? "Lưu thay đổi" : "Thêm ứng viên"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Xếp lịch phỏng vấn</DialogTitle>
            <DialogDescription>
              {selectedCandidate ? `Chọn ngày và giờ phỏng vấn cho ${selectedCandidate.name}.` : "Chọn ngày và giờ phỏng vấn."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="block text-[13px] font-medium">Ngày phỏng vấn</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" />
                      {selectedScheduleDate ? formatShortDate(selectedScheduleDate) : "Chọn ngày"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={selectedScheduleDate}
                      onSelect={(date) => {
                        if (!date) return;
                        const time = scheduleDateTime.split("T")[1] || "09:00";
                        setScheduleDateTime(`${toLocalDateTimeInput(date).slice(0, 10)}T${time}`);
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <label className="block space-y-1.5 text-[13px] font-medium">
                Giờ phỏng vấn
              <Input
                  type="time"
                  value={scheduleDateTime.split("T")[1] || ""}
                  onChange={(event) => {
                    const date = scheduleDateTime.slice(0, 10) || toLocalDateTimeInput(new Date()).slice(0, 10);
                    setScheduleDateTime(`${date}T${event.target.value}`);
                  }}
              />
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setScheduleDialogOpen(false)}>Hủy</Button>
              <Button
                type="button"
                disabled={!selectedCandidate || !selectedScheduleDate || !scheduleDateTime.split("T")[1]}
                onClick={() => {
                  if (!selectedCandidate) return;
                  updateCandidate(selectedCandidate.id, {
                    interviewScheduledAt: new Date(scheduleDateTime).toISOString(),
                  });
                  setScheduleDialogOpen(false);
                }}
              >
                Lưu lịch
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <FileViewer
        open={!!viewerFile}
        onClose={() => setViewerFile(null)}
        url={viewerFile?.url ?? ""}
        name={viewerFile?.name ?? ""}
      />
      <AlertDialog
        open={!!candidatePendingDelete}
        onOpenChange={(open) => {
          if (!open && !isDeletingCandidate) setCandidatePendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa hồ sơ ứng viên?</AlertDialogTitle>
            <AlertDialogDescription>
              Hồ sơ, đánh giá, điểm, lịch phỏng vấn và toàn bộ tệp đính kèm của {candidatePendingDelete?.name} sẽ bị xóa khỏi hệ thống.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingCandidate}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeletingCandidate}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void deleteCandidate();
              }}
            >
              {isDeletingCandidate ? "Đang xóa..." : "Xóa ứng viên"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
