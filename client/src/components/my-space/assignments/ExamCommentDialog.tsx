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

export interface ExamCommentDialogProps {
  open: boolean;
  onClose: () => void;
  submissionId: string;
  studentName: string;
  examTitle: string;
  initialComment: string | null;
  startInEditMode?: boolean;
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
  onSaved,
}: ExamCommentDialogProps) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(startInEditMode || !initialComment);
  const [commentVal, setCommentVal] = useState(initialComment || "");

  useEffect(() => {
    if (open) {
      setIsEditing(startInEditMode || !initialComment);
      setCommentVal(initialComment || "");
    }
  }, [open, initialComment, startInEditMode]);

  const mutation = useMutation({
    mutationFn: (comment: string) =>
      apiRequest("PATCH", `/api/exam-submissions/${submissionId}`, { comment }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-space/assignments/staff"] });
      toast({ title: "Đã lưu nhận xét" });
      setIsEditing(false);
      onSaved?.();
    },
    onError: () => toast({ title: "Lỗi lưu nhận xét", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="w-4 h-4 text-amber-500" />
            Nhận xét bài kiểm tra
            <span className="text-muted-foreground text-sm font-normal">— {studentName}</span>
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">{examTitle}</p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-2">
          {isEditing ? (
            <RichEditor
              value={commentVal}
              onChange={setCommentVal}
              placeholder="Nhập nhận xét cho học viên..."
              minHeight="120px"
            />
          ) : (
            <div
              className="prose prose-sm max-w-none rounded-md border border-border bg-muted/20 px-4 py-3 min-h-[80px]"
              dangerouslySetInnerHTML={{ __html: commentVal || "<p class='text-muted-foreground text-sm'>Chưa có nhận xét</p>" }}
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
                Hủy
              </Button>
              <Button
                onClick={() => mutation.mutate(commentVal)}
                disabled={mutation.isPending}
              >
                {mutation.isPending ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Đang lưu...</>
                ) : "Lưu nhận xét"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>
                Đóng
              </Button>
              <Button variant="secondary" onClick={() => setIsEditing(true)}>
                <Pencil className="w-3.5 h-3.5 mr-1.5" />
                Chỉnh sửa
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
