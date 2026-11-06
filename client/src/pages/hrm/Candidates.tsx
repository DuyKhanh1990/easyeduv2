import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Check, Eye, FileText, Plus, UserRound, Users } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type CandidateResult = "pass" | "fail" | "";
type CandidateFile = { id: string; name: string; url: string };
type Candidate = {
  id: string;
  name: string;
  result: CandidateResult;
  evaluation: string;
  files: CandidateFile[];
  scores: { expertise: string; experience: string; communication: string; attitude: string };
};
type CandidateTab = "all" | "pass" | "fail";

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
  const [activeTab, setActiveTab] = useState<CandidateTab>("all");
  const [newCandidateName, setNewCandidateName] = useState("");
  const fileUrls = useRef<string[]>([]);

  useEffect(() => () => {
    fileUrls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const filteredCandidates = useMemo(
    () => activeTab === "all" ? candidates : candidates.filter((candidate) => candidate.result === activeTab),
    [activeTab, candidates],
  );
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
      result: "",
      evaluation: "",
      files: [],
      scores: { ...EMPTY_SCORES },
    };
    setCandidates((current) => [...current, candidate]);
    setSelectedCandidateId(candidate.id);
    setActiveTab("all");
    setNewCandidateName("");
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
    setActiveTab((tab) => {
      if (tab === "all" || !value || tab === value) return tab;
      return value;
    });
  };

  const tabs: { value: CandidateTab; label: string; count: number }[] = [
    { value: "all", label: "Tất cả", count: candidates.length },
    { value: "pass", label: "Đỗ", count: candidates.filter((candidate) => candidate.result === "pass").length },
    { value: "fail", label: "Trượt", count: candidates.filter((candidate) => candidate.result === "fail").length },
  ];

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-5">
        <div>
          <h1 className="text-2xl font-semibold">Quản lý ứng viên</h1>
          <p className="mt-1 text-sm text-muted-foreground">Theo dõi hồ sơ, đánh giá và kết quả phỏng vấn.</p>
        </div>

        <div className="flex flex-wrap gap-2 border-b" role="tablist" aria-label="Lọc ứng viên">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.value
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
              <span className={`rounded-full px-2 py-0.5 text-xs ${
                activeTab === tab.value ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
              }`}>{tab.count}</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
          <Card className="h-fit lg:sticky lg:top-4">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-primary" />
                Danh sách ứng viên
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <form onSubmit={addCandidate} className="flex gap-2">
                <Input
                  value={newCandidateName}
                  onChange={(event) => setNewCandidateName(event.target.value)}
                  placeholder="Tên ứng viên"
                  aria-label="Tên ứng viên mới"
                />
                <Button type="submit" size="icon" aria-label="Thêm ứng viên" disabled={!newCandidateName.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </form>

              <div className="max-h-[55vh] space-y-1 overflow-y-auto">
                {filteredCandidates.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => setSelectedCandidateId(candidate.id)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                      selectedCandidateId === candidate.id
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-muted"
                    }`}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                      <UserRound className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{candidate.name}</span>
                    {candidate.result && (
                      <span className={`text-xs font-semibold ${candidate.result === "pass" ? "text-emerald-600" : "text-rose-600"}`}>
                        {candidate.result === "pass" ? "Đỗ" : "Trượt"}
                      </span>
                    )}
                  </button>
                ))}
                {filteredCandidates.length === 0 && (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    {activeTab === "all" ? "Chưa có ứng viên." : `Chưa có ứng viên ${activeTab === "pass" ? "đỗ" : "trượt"}.`}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {selectedCandidate ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">{selectedCandidate.name}</h2>
                  <p className="text-sm text-muted-foreground">Thông tin ứng viên</p>
                </div>
                {selectedCandidate.result && (
                  <span className={`rounded-full px-3 py-1 text-sm font-semibold ${
                    selectedCandidate.result === "pass"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-rose-50 text-rose-700"
                  }`}>
                    {selectedCandidate.result === "pass" ? "Đỗ" : "Trượt"}
                  </span>
                )}
              </div>

              <Card>
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

              <Card>
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

              <Card>
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

              <Card>
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
                {activeTab === "all" ? <Users className="h-10 w-10 opacity-40" /> : <Check className="h-10 w-10 opacity-40" />}
                <p className="text-sm">
                  {activeTab === "all"
                    ? "Thêm hoặc chọn ứng viên để xem thông tin."
                    : `Chưa có ứng viên ${activeTab === "pass" ? "đỗ" : "trượt"} nào.`}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
