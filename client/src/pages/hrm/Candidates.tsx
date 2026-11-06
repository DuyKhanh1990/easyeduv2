import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { BriefcaseBusiness, CalendarDays, ChevronRight, Eye, FileText, Plus, RotateCcw, Search, UserRound, Users, X } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import "./Candidates.css";

type CandidateResult = "pass" | "fail" | "";
type CandidateFile = { id: string; name: string; url: string };
type Candidate = {
  id: string;
  name: string;
  position: string;
  skills: string;
  result: CandidateResult;
  evaluation: string;
  files: CandidateFile[];
  scores: { expertise: string; experience: string; communication: string; attitude: string };
};
type CandidateFilter = "all" | "pending" | "interviewed" | "passed" | "rejected";

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
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<CandidateFilter>("all");
  const [newCandidateName, setNewCandidateName] = useState("");
  const [newCandidatePosition, setNewCandidatePosition] = useState("");
  const [newCandidateSkills, setNewCandidateSkills] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const fileUrls = useRef<string[]>([]);

  useEffect(() => () => {
    fileUrls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const filteredCandidates = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return candidates.filter((candidate) => {
      const matchesFilter = activeFilter === "all"
        || (activeFilter === "pending" && !candidate.result)
        || (activeFilter === "interviewed" && !!candidate.result)
        || (activeFilter === "passed" && candidate.result === "pass")
        || (activeFilter === "rejected" && candidate.result === "fail");
      const matchesSearch = !query
        || `${candidate.name} ${candidate.position} ${candidate.skills}`.toLowerCase().includes(query);
      return matchesFilter && matchesSearch;
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

  const addCandidate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newCandidateName.trim();
    if (!name) return;
    const candidate: Candidate = {
      id: crypto.randomUUID(),
      name,
      position: newCandidatePosition.trim(),
      skills: newCandidateSkills.trim(),
      result: "",
      evaluation: "",
      files: [],
      scores: { ...EMPTY_SCORES },
    };
    setCandidates((current) => [...current, candidate]);
    setSelectedCandidateId(candidate.id);
    setActiveFilter("all");
    setNewCandidateName("");
    setNewCandidatePosition("");
    setNewCandidateSkills("");
    setSearchTerm("");
    setIsAddFormOpen(false);
  };

  const updateCandidate = (id: string, updates: Partial<Candidate>) => {
    setCandidates((current) => current.map((candidate) =>
      candidate.id === id ? { ...candidate, ...updates } : candidate,
    ));
  };

  const addFiles = (candidateId: string, selectedFiles: FileList | null) => {
    if (!selectedFiles?.length) return;
    const nextFiles = Array.from(selectedFiles).map((file) => {
      const url = URL.createObjectURL(file);
      fileUrls.current.push(url);
      return { id: crypto.randomUUID(), name: file.name, url };
    });
    setCandidates((current) => current.map((candidate) =>
      candidate.id === candidateId
        ? { ...candidate, files: [...candidate.files, ...nextFiles] }
        : candidate,
    ));
  };

  const setCandidateResult = (candidate: Candidate, value: CandidateResult) => {
    updateCandidate(candidate.id, { result: value });
    setActiveFilter((filter) => {
      if (filter === "all") return filter;
      if (value === "pass") return "passed";
      if (value === "fail") return "rejected";
      return "pending";
    });
  };

  const filters: { value: CandidateFilter; label: string; count: number }[] = [
    { value: "all", label: "Tất cả", count: candidates.length },
    { value: "pending", label: "Chờ PV", count: candidates.filter((candidate) => !candidate.result).length },
    { value: "interviewed", label: "Đã PV", count: candidates.filter((candidate) => !!candidate.result).length },
    { value: "passed", label: "Đạt", count: candidates.filter((candidate) => candidate.result === "pass").length },
    { value: "rejected", label: "Loại", count: candidates.filter((candidate) => candidate.result === "fail").length },
  ];

  return (
    <DashboardLayout>
      <div className="candidate-page-theme">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="candidate-page-heading">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-[.18em] text-indigo-700">EasyEdu · Tuyển dụng</div>
          <h1 className="text-2xl font-semibold">Quản lý ứng viên</h1>
          <p className="mt-1 text-sm text-muted-foreground">Theo dõi hồ sơ, đánh giá và kết quả phỏng vấn.</p>
        </div>

        <div className="candidate-main-grid grid grid-cols-1 items-start gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
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
                  onClick={() => setIsAddFormOpen((open) => !open)}
                >
                  {isAddFormOpen ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
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

              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" aria-label="Lọc trạng thái ứng viên">
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

              {isAddFormOpen && (
                <form onSubmit={addCandidate} className="space-y-2 rounded-xl border bg-slate-50 p-3">
                  <Input
                    autoFocus
                    value={newCandidateName}
                    onChange={(event) => setNewCandidateName(event.target.value)}
                    placeholder="Họ tên ứng viên"
                    aria-label="Tên ứng viên mới"
                  />
                  <Input
                    value={newCandidatePosition}
                    onChange={(event) => setNewCandidatePosition(event.target.value)}
                    placeholder="Vị trí ứng tuyển"
                    aria-label="Vị trí ứng tuyển"
                  />
                  <Input
                    value={newCandidateSkills}
                    onChange={(event) => setNewCandidateSkills(event.target.value)}
                    placeholder="Kỹ năng"
                    aria-label="Kỹ năng ứng viên"
                  />
                  <div className="flex justify-end">
                    <Button type="submit" size="sm" disabled={!newCandidateName.trim()}>
                      Thêm ứng viên
                    </Button>
                  </div>
                </form>
              )}
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
                  ? "Đỗ"
                  : candidate.result === "fail"
                    ? "Trượt"
                    : "Đang chờ PV";
                const statusStyle = candidate.result === "pass"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : candidate.result === "fail"
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : "border-amber-200 bg-amber-50 text-amber-700";

                return (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => setSelectedCandidateId(candidate.id)}
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
                          <span className="truncate text-sm font-semibold text-slate-900">{candidate.name}</span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-indigo-600" />
                        </span>
                        <span className="mt-1 flex items-center gap-1.5 truncate text-xs text-slate-500">
                          <BriefcaseBusiness className="h-3.5 w-3.5 shrink-0" />
                          {candidate.position || "Chưa nhập vị trí"}
                        </span>
                        <span className="mt-2 flex items-center justify-between gap-2">
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${statusStyle}`}>
                            {statusLabel}
                          </span>
                          <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                            <CalendarDays className="h-3.5 w-3.5" />
                            Chưa xếp lịch
                          </span>
                        </span>
                      </span>
                    </div>
                  </button>
                );
              })}
              {filteredCandidates.length === 0 && (
                <div className="flex min-h-36 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                  <Users className="h-8 w-8 opacity-35" />
                  <p>
                    {searchTerm
                      ? "Không tìm thấy ứng viên phù hợp."
                      : activeFilter === "all"
                        ? "Chưa có ứng viên."
                        : activeFilter === "pending"
                          ? "Không có ứng viên đang chờ phỏng vấn."
                          : activeFilter === "interviewed"
                            ? "Chưa có ứng viên đã phỏng vấn."
                            : activeFilter === "passed"
                              ? "Chưa có ứng viên đạt."
                              : "Chưa có ứng viên bị loại."}
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t bg-white px-4 py-3 text-sm">
              <span className="text-muted-foreground">Kết quả: <strong className="text-foreground">{filteredCandidates.length}</strong></span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-primary"
                onClick={() => {
                  setActiveFilter("all");
                  setSearchTerm("");
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Đặt lại
              </Button>
            </div>
          </Card>

          {selectedCandidate ? (
            <div className="space-y-4">
              <div className="candidate-detail-heading flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="candidate-detail-avatar flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
                    {selectedCandidate.name.trim().split(/\s+/).slice(-2).map((part) => part[0] ?? "").join("").toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-xl font-semibold">{selectedCandidate.name}</h2>
                    <p className="truncate text-sm text-muted-foreground">{selectedCandidate.position || "Chưa nhập vị trí ứng tuyển"}</p>
                  </div>
                </div>
                <span className={`candidate-detail-status rounded-full px-3 py-1 text-sm font-semibold ${
                  selectedCandidate.result === "pass"
                    ? "bg-emerald-50 text-emerald-700"
                    : selectedCandidate.result === "fail"
                      ? "bg-rose-50 text-rose-700"
                      : "bg-amber-50 text-amber-700"
                }`}>
                  {selectedCandidate.result === "pass" ? "Đỗ" : selectedCandidate.result === "fail" ? "Trượt" : "Đang chờ PV"}
                </span>
              </div>

              <Card className="candidate-detail-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                  <CardTitle className="text-base">Hồ sơ ứng viên</CardTitle>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted">
                    <Plus className="h-4 w-4" />
                    Thêm tệp
                    <input
                      type="file"
                      multiple
                      className="sr-only"
                      onChange={(event) => {
                        addFiles(selectedCandidate.id, event.target.files);
                        event.target.value = "";
                      }}
                    />
                  </label>
                </CardHeader>
                <CardContent>
                  {selectedCandidate.files.length ? (
                    <div className="space-y-2">
                      {selectedCandidate.files.map((file) => (
                        <div key={file.id} className="flex items-center gap-3 rounded-md border px-3 py-2">
                          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
                          <a
                            href={file.url}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Xem ${file.name}`}
                            title="Xem tệp"
                            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <Eye className="h-4 w-4" />
                          </a>
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

              <Card className="candidate-detail-card">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Kết quả phỏng vấn</CardTitle>
                </CardHeader>
                <CardContent className="max-w-xs">
                  <Select
                    value={selectedCandidate.result || "pending"}
                    onValueChange={(value) => setCandidateResult(
                      selectedCandidate,
                      value === "pass" || value === "fail" ? value : "",
                    )}
                  >
                    <SelectTrigger aria-label="Chọn kết quả phỏng vấn">
                      <SelectValue placeholder="Chọn kết quả" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Chưa có kết quả</SelectItem>
                      <SelectItem value="pass">Đỗ</SelectItem>
                      <SelectItem value="fail">Trượt</SelectItem>
                    </SelectContent>
                  </Select>
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
      </div>
    </DashboardLayout>
  );
}
