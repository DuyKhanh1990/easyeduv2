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
import { Loader2, MessageSquare, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { RichEditor } from "@/components/ui/rich-editor";
import { useLanguage } from "@/hooks/use-language";

export interface ExamCommentDialogProps {
  open: boolean;
  onClose: () => void;
  submissionId: string;
  studentName: string;
  examTitle: string;
  initialComment: string | null;
  startInEditMode?: boolean;
  permissionContext?: "my-space" | "education";
  canCreate?: boolean;
  canEdit?: boolean;
  onSaved?: () => void;
}

export function ExamCommentDialog({
  open,
  onClose,
  submissionId,
  studentName,
  examTitle,
  initialComment,
  startInEditMode = false,
  permissionContext = "education",
  canCreate = true,
  canEdit = true,
  onSaved,
}: ExamCommentDialogProps) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const canModifyComment = initialComment?.trim() ? canEdit : canCreate;
  const [isEditing, setIsEditing] = useState(canModifyComment && (startInEditMode || !initialComment));
  const [commentVal, setCommentVal] = useState(initialComment || "");

  useEffect(() => {
    if (open) {
      setIsEditing(canModifyComment && (startInEditMode || !initialComment));
      setCommentVal(initialComment || "");
    }
  }, [open, initialComment, startInEditMode, canModifyComment]);

  const mutation = useMutation({
    mutationFn: (comment: string) =>
      apiRequest(
        "PATCH",
        permissionContext === "my-space"
          ? `/api/my-space/assignments/staff/exam-comment/${submissionId}`
          : `/api/exam-submissions/${submissionId}`,
        { comment },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-space/assignments/staff"] });
      toast({ title: t("mySpace.assignments.commentSaved") });
      setIsEditing(false);
      onSaved?.();
    },
    onError: () => toast({ title: t("mySpace.assignments.commentSaveError"), variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="w-4 h-4 text-amber-500" />
            {t("mySpace.assignments.examComment")}
            <span className="text-muted-foreground text-sm font-normal">— {studentName}</span>
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">{examTitle}</p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-2">
          {isEditing ? (
            <RichEditor
              value={commentVal}
              onChange={setCommentVal}
              placeholder={t("mySpace.assignments.enterStudentComment")}
              minHeight="120px"
            />
          ) : (
            <div
              className="prose prose-sm max-w-none rounded-md border border-border bg-muted/20 px-4 py-3 min-h-[80px]"
              dangerouslySetInnerHTML={{ __html: commentVal || `<p class='text-muted-foreground text-sm'>${t("mySpace.assignments.noComment")}</p>` }}
            />
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t pt-3">
          {isEditing ? (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  if (initialComment) {
                    setIsEditing(false);
                    setCommentVal(initialComment);
                  } else {
                    onClose();
                  }
                }}
              >
                {t("mySpace.assignments.cancel")}
              </Button>
              <Button
                onClick={() => mutation.mutate(commentVal)}
                disabled={mutation.isPending || !canModifyComment}
              >
                {mutation.isPending ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />{t("mySpace.assignments.saving")}</>
                ) : t("mySpace.assignments.saveComment")}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>
                {t("mySpace.assignments.close")}
              </Button>
              {canEdit && initialComment && (
                <Button variant="secondary" onClick={() => setIsEditing(true)}>
                  <Pencil className="w-3.5 h-3.5 mr-1.5" />
                  {t("mySpace.assignments.edit")}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
