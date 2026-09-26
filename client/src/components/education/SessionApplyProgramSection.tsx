import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Check, ChevronsUpDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SessionApplyProgramSectionProps {
  classId: string;
  classSessions: any[] | undefined;
  allEvaluationCriteria: any[] | undefined;
  allScoreSheetAssessments: any[] | undefined;
  selectedClassSessionId: string | null;
  isApplyProgramOpen: boolean;
  setIsApplyProgramOpen: (open: boolean) => void;
  applyProgramId: string;
  setApplyProgramId: (id: string) => void;
  applyProgramFromIdx: number;
  setApplyProgramFromIdx: (idx: number) => void;
  applyProgramToIdx: number;
  setApplyProgramToIdx: (idx: number) => void;
  isApplyCriteriaOpen: boolean;
  setIsApplyCriteriaOpen: (open: boolean) => void;
  applyCriteriaId: string;
  setApplyCriteriaId: (id: string) => void;
  applyCriteriaFromIdx: number;
  setApplyCriteriaFromIdx: (idx: number) => void;
  applyCriteriaToIdx: number;
  setApplyCriteriaToIdx: (idx: number) => void;
  isApplyScoreSheetOpen: boolean;
  setIsApplyScoreSheetOpen: (open: boolean) => void;
  applyScoreSheetId: string;
  setApplyScoreSheetId: (id: string) => void;
  applyScoreSheetFromIdx: number;
  setApplyScoreSheetFromIdx: (idx: number) => void;
  applyScoreSheetToIdx: number;
  setApplyScoreSheetToIdx: (idx: number) => void;
}

export function SessionApplyProgramSection({
  classId,
  classSessions,
  allEvaluationCriteria,
  allScoreSheetAssessments,
  selectedClassSessionId,
  isApplyProgramOpen,
  setIsApplyProgramOpen,
  applyProgramId,
  setApplyProgramId,
  applyProgramFromIdx,
  setApplyProgramFromIdx,
  applyProgramToIdx,
  setApplyProgramToIdx,
  isApplyCriteriaOpen,
  setIsApplyCriteriaOpen,
  applyCriteriaId,
  setApplyCriteriaId,
  applyCriteriaFromIdx,
  setApplyCriteriaFromIdx,
  applyCriteriaToIdx,
  setApplyCriteriaToIdx,
  isApplyScoreSheetOpen,
  setIsApplyScoreSheetOpen,
  applyScoreSheetId,
  setApplyScoreSheetId,
  applyScoreSheetFromIdx,
  setApplyScoreSheetFromIdx,
  applyScoreSheetToIdx,
  setApplyScoreSheetToIdx,
}: SessionApplyProgramSectionProps) {
  const { toast } = useToast();
  const [scoreSheetPickerOpen, setScoreSheetPickerOpen] = useState(false);

  const { data: allCoursePrograms } = useQuery<any[]>({
    queryKey: ["/api/course-programs"],
  });

  const { data: allScoreSheets } = useQuery<any[]>({
    queryKey: ["/api/score-sheets"],
  });

  // A session's business number is sessionIndex, not its position in the
  // response array. Keep all range selectors on the same canonical order.
  const orderedClassSessions = [...(classSessions || [])].sort((a, b) => {
    const indexA = a.sessionIndex ?? Number.MAX_SAFE_INTEGER;
    const indexB = b.sessionIndex ?? Number.MAX_SAFE_INTEGER;
    return indexA !== indexB ? indexA - indexB : a.id.localeCompare(b.id);
  });
  const normalizedScoreSheetSelection = applyScoreSheetId.includes(":")
    ? applyScoreSheetId
    : applyScoreSheetId
      ? `sheet:${applyScoreSheetId}`
      : "";
  const [selectedScoreSheetKind, selectedScoreSheetId] = normalizedScoreSheetSelection.split(":");
  const selectedLegacyScoreSheet = selectedScoreSheetKind === "sheet"
    ? allScoreSheets?.find((sheet: any) => sheet.id === selectedScoreSheetId)
    : null;
  const selectedAssessment = selectedScoreSheetKind === "assessment"
    ? allScoreSheetAssessments?.find((assessment: any) => assessment.id === selectedScoreSheetId)
    : null;
  const selectedScoreSheetLabel = selectedAssessment
    ? `${selectedAssessment.code} — ${selectedAssessment.name}`
    : selectedLegacyScoreSheet?.name ?? "";

  const applyScoreSheetMutation = useMutation({
    mutationFn: async (data: {
      scoreSheetId?: string;
      scoreSheetAssessmentId?: string;
      fromSessionIndex: number;
      toSessionIndex: number;
    }) => {
      return apiRequest("POST", `/api/classes/${classId}/apply-score-sheet`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/classes"] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/sessions`] });
      toast({ title: "Áp dụng bảng điểm thành công" });
      setIsApplyScoreSheetOpen(false);
      setApplyScoreSheetId("");
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err.message || "Không thể áp dụng bảng điểm", variant: "destructive" });
    },
  });

  const applyProgramMutation = useMutation({
    mutationFn: async (data: { programId: string; fromSessionIndex: number; toSessionIndex: number }) => {
      return apiRequest("POST", `/api/classes/${classId}/apply-program`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/sessions`] });
      queryClient.invalidateQueries({ queryKey: ["/api/class-sessions"] });
      // Invalidate ALL session content queries so every session shows fresh content
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === "string" && key.includes("/api/class-sessions/") && key.includes("/contents");
        },
      });
      toast({ title: "Áp dụng chương trình thành công" });
      setIsApplyProgramOpen(false);
      setApplyProgramId("");
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err.message || "Không thể áp dụng chương trình", variant: "destructive" });
    },
  });

  const applyCriteriaMutation = useMutation({
    mutationFn: async (data: { criteriaId: string; fromSessionIndex: number; toSessionIndex: number }) => {
      return apiRequest("POST", `/api/classes/${classId}/apply-criteria`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/classes"] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/sessions`] });
      toast({ title: "Áp dụng tiêu chí thành công" });
      setIsApplyCriteriaOpen(false);
      setApplyCriteriaId("");
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err.message || "Không thể áp dụng tiêu chí", variant: "destructive" });
    },
  });

  return (
    <>
      {/* Apply Program Dialog */}
      <Dialog open={isApplyProgramOpen} onOpenChange={setIsApplyProgramOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Áp dụng chương trình học</DialogTitle>
            <DialogDescription>Chọn chương trình và phạm vi buổi học để áp dụng nội dung</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Chương trình</label>
              <Select value={applyProgramId} onValueChange={setApplyProgramId}>
                <SelectTrigger data-testid="select-apply-program">
                  <SelectValue placeholder="Chọn chương trình..." />
                </SelectTrigger>
                <SelectContent>
                  {(allCoursePrograms || []).map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Từ buổi</label>
                <Select value={String(applyProgramFromIdx)} onValueChange={(v) => setApplyProgramFromIdx(Number(v))}>
                  <SelectTrigger data-testid="select-apply-program-from">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {orderedClassSessions.map((s: any) => (
                      <SelectItem key={s.id} value={String(s.sessionIndex)}>Buổi {s.sessionIndex}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Đến buổi</label>
                <Select value={String(applyProgramToIdx)} onValueChange={(v) => setApplyProgramToIdx(Number(v))}>
                  <SelectTrigger data-testid="select-apply-program-to">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {orderedClassSessions.filter((s: any) => s.sessionIndex >= applyProgramFromIdx).map((s: any) => (
                      <SelectItem key={s.id} value={String(s.sessionIndex)}>Buổi {s.sessionIndex}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsApplyProgramOpen(false)}>Huỷ</Button>
            <Button
              data-testid="btn-confirm-apply-program"
              disabled={!applyProgramId || applyProgramMutation.isPending}
              onClick={() => {
                if (!applyProgramId) return;
                applyProgramMutation.mutate({ programId: applyProgramId, fromSessionIndex: applyProgramFromIdx, toSessionIndex: applyProgramToIdx });
              }}
            >
              {applyProgramMutation.isPending ? "Đang lưu..." : "Lưu lại"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Apply Criteria Dialog */}
      <Dialog open={isApplyCriteriaOpen} onOpenChange={setIsApplyCriteriaOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Áp dụng tiêu chí đánh giá</DialogTitle>
            <DialogDescription>Chọn tiêu chí và phạm vi buổi học để áp dụng</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Tiêu chí</label>
              <Select value={applyCriteriaId} onValueChange={setApplyCriteriaId}>
                <SelectTrigger data-testid="select-apply-criteria">
                  <SelectValue placeholder="Chọn tiêu chí..." />
                </SelectTrigger>
                <SelectContent>
                  {(allEvaluationCriteria || []).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Từ buổi</label>
                <Select value={String(applyCriteriaFromIdx)} onValueChange={(v) => setApplyCriteriaFromIdx(Number(v))}>
                  <SelectTrigger data-testid="select-apply-criteria-from">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {orderedClassSessions.map((s: any) => (
                      <SelectItem key={s.id} value={String(s.sessionIndex)}>Buổi {s.sessionIndex}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Đến buổi</label>
                <Select value={String(applyCriteriaToIdx)} onValueChange={(v) => setApplyCriteriaToIdx(Number(v))}>
                  <SelectTrigger data-testid="select-apply-criteria-to">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {orderedClassSessions.filter((s: any) => s.sessionIndex >= applyCriteriaFromIdx).map((s: any) => (
                      <SelectItem key={s.id} value={String(s.sessionIndex)}>Buổi {s.sessionIndex}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsApplyCriteriaOpen(false)}>Huỷ</Button>
            <Button
              data-testid="btn-confirm-apply-criteria"
              disabled={!applyCriteriaId || applyCriteriaMutation.isPending}
              onClick={() => {
                if (!applyCriteriaId) return;
                applyCriteriaMutation.mutate({ criteriaId: applyCriteriaId, fromSessionIndex: applyCriteriaFromIdx, toSessionIndex: applyCriteriaToIdx });
              }}
            >
              {applyCriteriaMutation.isPending ? "Đang lưu..." : "Lưu lại"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Apply Score Sheet Dialog */}
      <Dialog open={isApplyScoreSheetOpen} onOpenChange={setIsApplyScoreSheetOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Áp dụng bảng điểm</DialogTitle>
            <DialogDescription>
              Chọn bảng điểm và phạm vi buổi học để áp dụng. Với cấu hình bảng điểm, ngày thi thực tế lấy theo ngày của từng buổi.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Bảng điểm</label>
              <Popover open={scoreSheetPickerOpen} onOpenChange={setScoreSheetPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={scoreSheetPickerOpen}
                    data-testid="select-apply-score-sheet"
                    className="w-full justify-between font-normal"
                  >
                    <span className="truncate">{selectedScoreSheetLabel || "Chọn bảng điểm..."}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Tìm mã hoặc tên bảng điểm..." />
                    <CommandList>
                      <CommandEmpty>Không tìm thấy bảng điểm phù hợp.</CommandEmpty>
                      {(allScoreSheets?.length ?? 0) > 0 && (
                        <CommandGroup heading="Bảng điểm hiện có">
                          {allScoreSheets?.map((sheet: any) => (
                            <CommandItem
                              key={`sheet:${sheet.id}`}
                              value={`sheet ${sheet.name} ${sheet.id}`}
                              onSelect={() => {
                                setApplyScoreSheetId(`sheet:${sheet.id}`);
                                setScoreSheetPickerOpen(false);
                              }}
                            >
                              <Check className={`mr-2 h-4 w-4 ${normalizedScoreSheetSelection === `sheet:${sheet.id}` ? "opacity-100" : "opacity-0"}`} />
                              {sheet.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}
                      {(allScoreSheetAssessments?.length ?? 0) > 0 && (
                        <CommandGroup heading="Danh sách bảng điểm">
                          {allScoreSheetAssessments?.map((assessment: any) => (
                            <CommandItem
                              key={`assessment:${assessment.id}`}
                              value={`${assessment.code} ${assessment.name} ${assessment.templateSnapshot?.name ?? ""} ${assessment.id}`}
                              onSelect={() => {
                                setApplyScoreSheetId(`assessment:${assessment.id}`);
                                setScoreSheetPickerOpen(false);
                              }}
                            >
                              <Check className={`mr-2 h-4 w-4 ${normalizedScoreSheetSelection === `assessment:${assessment.id}` ? "opacity-100" : "opacity-0"}`} />
                              <span className="min-w-0">
                                <span className="block truncate">{assessment.code} — {assessment.name}</span>
                                <span className="block truncate text-xs text-muted-foreground">
                                  {assessment.templateSnapshot?.name ?? "Bảng điểm mẫu"}
                                </span>
                              </span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            {selectedAssessment && (
              <p className="text-xs text-muted-foreground">
                Ngày thi thực tế của mỗi buổi sẽ lấy từ ngày học đã xếp trên lịch.
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Từ buổi</label>
                <Select value={String(applyScoreSheetFromIdx)} onValueChange={(v) => setApplyScoreSheetFromIdx(Number(v))}>
                  <SelectTrigger data-testid="select-apply-score-sheet-from">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {orderedClassSessions.map((s: any) => (
                      <SelectItem key={s.id} value={String(s.sessionIndex)}>Buổi {s.sessionIndex}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Đến buổi</label>
                <Select value={String(applyScoreSheetToIdx)} onValueChange={(v) => setApplyScoreSheetToIdx(Number(v))}>
                  <SelectTrigger data-testid="select-apply-score-sheet-to">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {orderedClassSessions.filter((s: any) => s.sessionIndex >= applyScoreSheetFromIdx).map((s: any) => (
                      <SelectItem key={s.id} value={String(s.sessionIndex)}>Buổi {s.sessionIndex}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsApplyScoreSheetOpen(false)}>Huỷ</Button>
            <Button
              data-testid="btn-confirm-apply-score-sheet"
              disabled={!applyScoreSheetId || applyScoreSheetMutation.isPending}
              onClick={() => {
                if (!applyScoreSheetId) return;
                const [kind, selectedId] = normalizedScoreSheetSelection.split(":");
                applyScoreSheetMutation.mutate({
                  ...(kind === "assessment"
                    ? { scoreSheetAssessmentId: selectedId }
                    : { scoreSheetId: selectedId }),
                  fromSessionIndex: applyScoreSheetFromIdx,
                  toSessionIndex: applyScoreSheetToIdx,
                });
              }}
            >
              {applyScoreSheetMutation.isPending ? "Đang lưu..." : "Lưu lại"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
