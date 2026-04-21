import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Star } from "lucide-react";

interface SubCriteriaItem {
  id: string;
  name: string;
  criteriaId: string;
}

interface CriteriaItem {
  id: string;
  name: string;
  subCriteria: SubCriteriaItem[];
}

interface TeacherItem {
  id: string;
  fullName: string;
}

interface ReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentSessionIds: string[];
  studentNames: string[];
  criteria: CriteriaItem[];
  teachers: TeacherItem[];
  existingReviewData?: Record<string, { teacherName: string; items: { subCriteriaId?: string; subCriteriaName?: string; criteriaId: string; criteriaName: string; comment: string }[] }> | null;
  existingPublished?: boolean;
  classSessionId: string;
}

type ReviewMap = Record<string, Record<string, string>>;

function buildEmptyComments(criteria: CriteriaItem[], teachers: TeacherItem[]): ReviewMap {
  const map: ReviewMap = {};
  teachers.forEach((t) => {
    map[t.id] = {};
    criteria.forEach((c) => {
      if (c.subCriteria && c.subCriteria.length > 0) {
        c.subCriteria.forEach((sc) => { map[t.id][sc.id] = ""; });
      } else {
        map[t.id][c.id] = "";
      }
    });
  });
  return map;
}

export function ReviewDialog({
  open,
  onOpenChange,
  studentSessionIds,
  studentNames,
  criteria,
  teachers,
  existingReviewData,
  existingPublished,
  classSessionId,
}: ReviewDialogProps) {
  const { toast } = useToast();
  const isBulk = studentSessionIds.length > 1;

  const [comments, setComments] = useState<ReviewMap>({});
  const [published, setPublished] = useState(false);
  const [activeTeacher, setActiveTeacher] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    if (!isBulk && existingReviewData && Object.keys(existingReviewData).length > 0) {
      const map: ReviewMap = {};
      teachers.forEach((t) => {
        map[t.id] = {};
        const teacherData = existingReviewData[t.id];
        criteria.forEach((c) => {
          if (c.subCriteria && c.subCriteria.length > 0) {
            c.subCriteria.forEach((sc) => {
              const found = teacherData?.items?.find((i) => i.subCriteriaId === sc.id);
              map[t.id][sc.id] = found?.comment || "";
            });
          } else {
            const found = teacherData?.items?.find((i) => i.criteriaId === c.id && !i.subCriteriaId);
            map[t.id][c.id] = found?.comment || "";
          }
        });
      });
      setComments(map);
      setPublished(existingPublished ?? false);
    } else {
      setComments(buildEmptyComments(criteria, teachers));
      setPublished(false);
    }
    if (teachers.length > 0) setActiveTeacher(teachers[0].id);
  }, [open, existingReviewData, existingPublished, criteria, teachers, isBulk]);

  const reviewMutation = useMutation({
    mutationFn: async () => {
      const reviewData: Record<string, { teacherName: string; items: any[] }> = {};
      teachers.forEach((t) => {
        const items: any[] = [];
        criteria.forEach((c) => {
          if (c.subCriteria && c.subCriteria.length > 0) {
            c.subCriteria.forEach((sc) => {
              items.push({
                criteriaId: c.id,
                criteriaName: c.name,
                subCriteriaId: sc.id,
                subCriteriaName: sc.name,
                comment: comments[t.id]?.[sc.id] || "",
              });
            });
          } else {
            items.push({
              criteriaId: c.id,
              criteriaName: c.name,
              comment: comments[t.id]?.[c.id] || "",
            });
          }
        });
        reviewData[t.id] = { teacherName: t.fullName, items };
      });
      return apiRequest("POST", "/api/student-sessions/review", {
        studentSessionIds,
        reviewData,
        published,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0] as string;
          return typeof key === "string" && (
            key.includes("/student-sessions") ||
            key === "/api/my-space/calendar/staff" ||
            key === "/api/schedule"
          );
        },
      });
      toast({
        title: "Đã lưu nhận xét",
        description: published
          ? "Nhận xét đã được lưu và công bố tới học viên."
          : "Nhận xét đã được lưu (chưa công bố).",
      });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Lỗi", description: "Không thể lưu nhận xét", variant: "destructive" });
    },
  });

  const title = isBulk
    ? `Nhận xét hàng loạt (${studentSessionIds.length} học viên)`
    : `Nhận xét: ${studentNames[0] || "Học viên"}`;

  const hasContent = criteria.length > 0 && teachers.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="h-4 w-4 text-yellow-500 fill-yellow-400" />
            {title}
          </DialogTitle>
          {isBulk && (
            <p className="text-xs text-muted-foreground mt-1">
              Nhận xét sẽ được áp dụng cho tất cả học viên đã chọn
            </p>
          )}
        </DialogHeader>

        {!hasContent ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            {criteria.length === 0
              ? "Lớp học chưa có tiêu chí đánh giá nào. Vui lòng thêm tiêu chí trong cài đặt lớp học."
              : "Buổi học chưa có giáo viên nào."}
          </div>
        ) : teachers.length === 1 ? (
          <CriteriaForm
            teacherId={teachers[0].id}
            criteria={criteria}
            comments={comments}
            setComments={setComments}
          />
        ) : (
          <Tabs value={activeTeacher} onValueChange={setActiveTeacher}>
            <div className="flex flex-wrap gap-2 mb-3">
              {teachers.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTeacher(t.id)}
                  className={cn(
                    "px-3 py-1 rounded-md border text-xs font-medium transition-all",
                    activeTeacher === t.id
                      ? "bg-primary border-primary text-primary-foreground"
                      : "bg-background border-border text-foreground hover:bg-muted/50"
                  )}
                >
                  {t.fullName}
                </button>
              ))}
            </div>
            {teachers.map((t) => (
              <TabsContent key={t.id} value={t.id}>
                <CriteriaForm
                  teacherId={t.id}
                  criteria={criteria}
                  comments={comments}
                  setComments={setComments}
                />
              </TabsContent>
            ))}
          </Tabs>
        )}

        <div className="flex items-center justify-between py-2 border-t mt-2">
          <div className="space-y-0.5">
            <Label htmlFor="publish-switch" className="text-sm font-medium cursor-pointer">
              Công bố
            </Label>
            <p className="text-[11px] text-muted-foreground">
              {published
                ? "Nhận xét sẽ được gửi tới tài khoản học viên khi lưu"
                : "Lưu nội bộ, chưa gửi tới học viên"}
            </p>
          </div>
          <Switch
            id="publish-switch"
            checked={published}
            onCheckedChange={setPublished}
            data-testid="switch-publish-review"
          />
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button
            onClick={() => reviewMutation.mutate()}
            disabled={reviewMutation.isPending || !hasContent}
            data-testid="button-save-review"
          >
            {reviewMutation.isPending ? "Đang lưu..." : published ? "Lưu & Công bố" : "Lưu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CriteriaForm({
  teacherId,
  criteria,
  comments,
  setComments,
}: {
  teacherId: string;
  criteria: CriteriaItem[];
  comments: ReviewMap;
  setComments: (fn: (prev: ReviewMap) => ReviewMap) => void;
}) {
  return (
    <div className="space-y-4 py-1">
      {criteria.map((c) => (
        <div key={c.id} className="space-y-2">
          <p className="text-sm font-semibold text-foreground">{c.name}</p>
          {c.subCriteria && c.subCriteria.length > 0 ? (
            <div className="space-y-2 pl-3 border-l-2 border-muted">
              {c.subCriteria.map((sc) => (
                <div key={sc.id} className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{sc.name}</Label>
                  <Textarea
                    placeholder={`Nhận xét về ${sc.name}...`}
                    value={comments[teacherId]?.[sc.id] || ""}
                    onChange={(e) =>
                      setComments((prev) => ({
                        ...prev,
                        [teacherId]: { ...prev[teacherId], [sc.id]: e.target.value },
                      }))
                    }
                    rows={2}
                    className="text-sm resize-none"
                    data-testid={`textarea-review-${teacherId}-${sc.id}`}
                  />
                </div>
              ))}
            </div>
          ) : (
            <Textarea
              placeholder={`Nhận xét về ${c.name}...`}
              value={comments[teacherId]?.[c.id] || ""}
              onChange={(e) =>
                setComments((prev) => ({
                  ...prev,
                  [teacherId]: { ...prev[teacherId], [c.id]: e.target.value },
                }))
              }
              rows={2}
              className="text-sm resize-none"
              data-testid={`textarea-review-${teacherId}-${c.id}`}
            />
          )}
        </div>
      ))}
    </div>
  );
}
