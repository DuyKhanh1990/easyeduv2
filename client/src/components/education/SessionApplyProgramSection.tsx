import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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

  const { data: allCoursePrograms } = useQuery<any[]>({
    queryKey: ["/api/course-programs"],
  });

  const { data: allScoreSheets } = useQuery<any[]>({
    queryKey: ["/api/score-sheets"],
  });

  const applyScoreSheetMutation = useMutation({
    mutationFn: async (data: { scoreSheetId: string; fromSessionIndex: number; toSessionIndex: number }) => {
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
                    {(classSessions || []).map((s: any) => (
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
                    {(classSessions || []).filter((s: any) => s.sessionIndex >= applyProgramFromIdx).map((s: any) => (
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
                    {(classSessions || []).map((s: any) => (
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
                    {(classSessions || []).filter((s: any) => s.sessionIndex >= applyCriteriaFromIdx).map((s: any) => (
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
            <DialogDescription>Chọn bảng điểm và phạm vi buổi học để áp dụng</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Bảng điểm</label>
              <Select value={applyScoreSheetId} onValueChange={setApplyScoreSheetId}>
                <SelectTrigger data-testid="select-apply-score-sheet">
                  <SelectValue placeholder="Chọn bảng điểm..." />
                </SelectTrigger>
                <SelectContent>
                  {(allScoreSheets || []).map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Từ buổi</label>
                <Select value={String(applyScoreSheetFromIdx)} onValueChange={(v) => setApplyScoreSheetFromIdx(Number(v))}>
                  <SelectTrigger data-testid="select-apply-score-sheet-from">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(classSessions || []).map((s: any) => (
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
                    {(classSessions || []).filter((s: any) => s.sessionIndex >= applyScoreSheetFromIdx).map((s: any) => (
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
                applyScoreSheetMutation.mutate({ scoreSheetId: applyScoreSheetId, fromSessionIndex: applyScoreSheetFromIdx, toSessionIndex: applyScoreSheetToIdx });
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
